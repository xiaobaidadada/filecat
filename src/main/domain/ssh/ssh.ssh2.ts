import {SshPojo} from "../../../common/req/ssh.pojo";
import {FileTypeEnum, GetFilePojo} from "../../../common/file.pojo";
import {LifecycleRecordService} from "../pre/lifeRecordService";
import {get_bin_dependency} from "../bin/get_bin_dependency";
const EventEmitter = require('events');


// const {Client} = get_bin_dependency("@xiaobaidadada/ssh2-prebuilt");

type Client = any
import fs from "fs";
import {FileUtil} from "../file/FileUtil";

const {Client} = get_bin_dependency("@xiaobaidadada/ssh2-prebuilt",false)
export const sftp_client = "sftp_client_key";

const SSH_ERROR_MAP: Record<number, string> = {
    0: 'Success',
    1: 'End of file',
    2: 'No such file or directory',
    3: 'Permission denied',
    4: 'Operation failure (SSH_FX_FAILURE)',
    5: 'Connection lost',
    6: 'Protocol error',
    7: 'Connection interrupted',
    8: 'Operation unsupported'
};

export class SshSsh2 extends LifecycleRecordService {


    /**
     * 异步执行任务（带超时控制）
     * 增加类型支持以提升代码健壮性
     */
    async asyncExec<T>(fun: (resolve: (val: T) => void, reject: (err: any) => void) => void, outtime: number = 3000): Promise<T | null> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(null), outtime);

            const wrappedResolve = (data: T) => {
                clearTimeout(timer);
                resolve(data);
            };

            const wrappedReject = (err: any) => {
                clearTimeout(timer);
                if(err?.code != null && SSH_ERROR_MAP[err.code]) {
                    err = SSH_ERROR_MAP[err.code];
                }
                reject(err);
            };

            fun(wrappedResolve, wrappedReject);
        });
    }

    async connect(req: SshPojo): Promise<any> {
        const options = {
            host: req.domain,
            port: req.port,
            username: req.username,
            keepaliveInterval: 10000,
            keepaliveCountMax: 10,
            ...(req.private_path ? { privateKey: await FileUtil.readFileSync(req.private_path) } : { password: req.password })
        };

        const client = new Client();

        return new Promise((resolve, reject) => {
            // 设置单次连接超时（防止死锁）
            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error('SSH 连接超时'));
            }, 30000);

            client.on('ready', async () => {
                clearTimeout(timeout);
                try {
                    // 使用 promisify 风格获取 SFTP
                    const sftp = await new Promise((res, rej) => {
                        client.sftp((err, sftp) => (err ? rej(err) : res(sftp)));
                    });

                    client[sftp_client] = sftp;
                    // console.log("SSH 及 SFTP 连接成功");
                    resolve(client);
                } catch (err) {
                    client.end();
                    reject(err);
                }
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            client.on('close', () => {
                // console.log("SSH 连接已关闭");
                this.lifeClose(SshPojo.getKey(req));
            });

            client.connect(options);
        });
    }

    // 获取sftp
    sftGet(client: Client) {
        const sftp = client[sftp_client];
        return sftp;
    }

    // 获取文件信息
    async sftGetFileStats(filePath:string,client: Client) :Promise<any>{
        return this.asyncExec((resolve, reject) => {
           try {
               const sftp = this.sftGet(client);
               sftp.stat(filePath, (err, stats) => {
                   if (err) {
                       reject(null);
                       return;
                   }
                   resolve(stats);
               });
           } catch (err) {
               reject(err);
           }
        }, 1000 * 30);
    }

    // 获取目录下文件
    async sftGetDir(dir: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            try {
                const sftp = this.sftGet(client);
                const remotePath = dir;
                const result: GetFilePojo = {
                    files: [],
                    folders: []
                };
                sftp.readdir(remotePath, (err, list) => {
                    if (err) {
                        return reject(err);
                    }
                    list.forEach(file => {
                        const isDirectory = (file.attrs.mode & 0o170000) === 0o040000;
                        const isLink = (file.attrs.mode & 0o170000) === 0o120000;
                        const name = file.filename;
                        // const size = formatFileSize(file.attrs.size);
                        const mtime = file.attrs.mtime;
                        // const formattedCreationTime = getShortTime(new Date(mtime).getTime());
                        if (!isDirectory) {
                            result.files?.push({
                                type: FileTypeEnum.text,
                                name: name,
                                mtime: file.attrs.mtime,
                                size:file.attrs.size,
                                isLink
                            })
                        } else {
                            result.folders?.push({
                                type: FileTypeEnum.folder,
                                name: name,
                                mtime: file.attrs.mtime,
                                isLink
                            })
                        }
                    });
                    resolve(result);
                });
            } catch (e) {
                reject(e);
            }
        }, 1000 * 30);

    }

    // 读文本文件
    async sftGetFileText(file: string, client: Client): Promise<string> {
        try {

            return await new Promise((resolve, reject) => {
                const sftp = this.sftGet(client);
                let fileContent = '';
                // 创建一个读取流，从远程文件读取
                const readStream = sftp.createReadStream(file);
                // 监听数据事件，将数据块累加到 fileContent 字符串
                readStream.on('data', (chunk) => {
                    fileContent += chunk.toString();
                });
                // 监听结束事件
                readStream.on('end', () => {
                    resolve(fileContent);
                });
                // 监听错误事件
                readStream.on('error', (err) => {
                    console.error('Error downloading file:', err);
                    reject(err);
                });
            });
        } catch (err) {
            console.error(`读取文件失败 [${file}]:`, err);
            // 抛出错误，让上层业务知道读取失败，而不是给出一个静默的空字符串
            throw err;
        }
    }

    // 写文本文件
    async sftUpdateFileText(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
           try {
               const sftp = this.sftGet(client);
               // 创建一个写入流，写入到远程文件
               const writeStream = sftp.createWriteStream(decodeURIComponent(req.file));
               // 将字符串内容写入写入流
               writeStream.write(req.context, 'utf-8');
               // 结束写入流
               writeStream.end();
               // 监听写入流关闭事件
               writeStream.on('close', () => {
                   // console.log('File uploaded successfully');
                   resolve(true)
               });
               // 监听写入流错误事件
               writeStream.on('error', (err) => {
                   // console.error('Error uploading file:', err);
                   resolve(false);
               });
           } catch (err) {
               reject(err);
           }
        }, 1000 * 30);
    }

    // 创建文件夹
    async sftCreateDir(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
          try {
              // 创建文件夹
              const sftp = this.sftGet(client);
              const dir = decodeURIComponent(req.dir);
              sftp.mkdir(dir, (err) => {
                  if (err) {
                      // console.error('Error creating folder:', err);
                      reject(err);
                  } else {
                      // console.log('ssh Folder created successfully',dir);
                  }
                  resolve(true);
              });

          } catch (err) {
              reject(err);
          }
        }, 1000 * 30);
    }

    async sftDeleteFile(file: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
           try {
               //删除文件
               const sftp = this.sftGet(client);
               // 删除文件
               sftp.unlink(file, (err) => {
                   if (err) {
                       console.error('Error deleting file:', err);
                       reject(err);
                   }
                   resolve(true);
               });
           } catch (err) {
               reject(err);
           }
        });
    }

    async sftDeleteFolder(file: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
            try {
                client.exec(`rm -r ${file}`, (err, stream) => {
                    if (err) {
                        return reject(err);
                    }
                    stream.on('close', (code, signal) => {
                        resolve(true);
                    });
                });
            } catch (err) {
                reject(err);
            }
        });
    }
    // 删除目录（只尝试删除，不递归）
    // async sftDeleteFolder(folder: string, client: Client) {
    //     return this.asyncExec((resolve, reject) => {
    //         try {
    //             const sftp = this.sftGet(client);
    //             // 直接调用 rmdir，如果目录非空或不存在，SFTP 服务器会返回错误，我们直接 resolve(false) 视为“不能删就算了”
    //             sftp.rmdir(folder, (err) => {
    //                 if (err) {
    //                     console.warn(`Cannot delete folder [${folder}], it might not be empty or exist:`, err.message);
    //                     resolve(false); // 不能删就算了
    //                 } else {
    //                     console.log('Folder deleted successfully:', folder);
    //                     resolve(true);
    //                 }
    //             });
    //         } catch (err) {
    //             console.error('Unexpected error during sftDelteFolder:', err);
    //             resolve(false);
    //         }
    //     }, 1000 * 10); // 时间可以短一点，因为不用遍历
    // }



    // // 复制文件：使用流复制，支持单个文件
    // async sftCopyFile(source: string, target: string, client: Client) {
    //     return this.asyncExec(async (resolve, reject) => {
    //         try {
    //             const sftp = this.sftGet(client);
    //             const readStream = sftp.createReadStream(source);
    //             const writeStream = sftp.createWriteStream(target);
    //
    //             readStream.on('error', reject);
    //             writeStream.on('error', reject);
    //             writeStream.on('close', () => resolve(true));
    //
    //             readStream.pipe(writeStream);
    //         } catch (err) {
    //             reject(err);
    //         }
    //     }, 1000 * 60);
    // }
    //
    // // 移动文件 一次一个 也可以用作修改文件名
    // async sftMoveFile(source: string, target: string, client: Client): Promise<boolean> {
    //     return new Promise((res, rej) => {
    //         const sftp = this.sftGet(client);
    //         // sftp.rename 天然支持重命名或移动（在同文件系统内）
    //         sftp.rename(source, target, (err) => err ? rej(err) : res(true));
    //     });
    // }

    // 复制文件 一次一个
    async sftCopyFile(sourceFileOrDir: string, target: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
            try {
                client.exec(`cp -r ${sourceFileOrDir} ${target}`, (err, stream) => {
                    if (err) {
                        return reject(err);
                    }
                    stream.on('close', (code, signal) => {
                        resolve(true);
                    });
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    // 移动文件 一次一个 也可以用作修改文件名
    async sftMoveFile(sourceFileOrDir: string, target: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
           try {
               client.exec(`mv  ${sourceFileOrDir} ${target}`, (err, stream) => {
                   if (err) {
                       return reject(err);
                   }
                   stream.on('close', (code, signal) => {
                       resolve(true);
                   });
               });
           } catch (err) {
               reject(err);
           }
        });
    }
}
