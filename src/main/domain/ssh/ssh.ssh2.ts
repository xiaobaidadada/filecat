import {SshPojo} from "../../../common/req/ssh.pojo";
import {FileTypeEnum, GetFilePojo} from "../../../common/file.pojo";
import {formatFileSize, getShortTime} from "../../../common/ValueUtil";
import {LifecycleRecordService} from "../pre/lifeRecordService";

const EventEmitter = require('events');


import {Client} from '@xiaobaidadada/ssh2-prebuilt';
import fs from "fs";

export const sftp_client = "sftp_client_key";

export class SshSsh2 extends LifecycleRecordService {

    async connect(req: SshPojo): Client {
        // 要传递的环境变量
        // const envVars = {
        //     PATH: process.env.PATH, // 传递 PATH 环境变量
        // };
        const options = {
            host: req.domain,
            port: req.port,
            username: req.username,
            // env:envVars,
            // 设定keepaliveInterval和keepaliveCountMax
            keepaliveInterval: 10000, // 每10秒发送一次keepalive消息
            keepaliveCountMax: 10 // 尝试10次keepalive后如果没有响应则断开连接
        };
        if (req.private_path) {
            options['privateKey'] = fs.readFileSync(req.private_path);
        } else if (req.password) {
            options['password'] = req.password;
        }
        return new Promise((resolve, reject) => {
            const client = new Client();
            client.on('ready', async function () {
                console.log("连接ssh成功");
                const sftp = await new Promise((resolve, reject) => {
                    client.sftp((err, sftp) => {
                        if (err) throw err;
                        resolve(sftp);
                    });
                })
                client[sftp_client] = sftp;
                resolve(client);
            }).connect(options).on('error', (err) => {
                resolve(false);
            }).on("close", () => {
                resolve(false);
                console.log("ssh关闭")
                this.lifeClose(SshPojo.getKey(req));
                // try {
                //     client[sftp_client].end();
                // } catch (e) {
                //     console.log(e);
                // }
            });
        })
    }

    // 获取sftp
    sftGet(client: Client) {
        const sftp = client[sftp_client];
        return sftp;
    }

    // 获取文件信息
    async sftGetFileStats(filePath:string,client: Client) :Promise<any>{
        return this.asyncExec((resolve, reject) => {
            const sftp = this.sftGet(client);
            sftp.stat(filePath, (err, stats) => {
                if (err) {
                    resolve(null);
                    return;
                }
                resolve(stats);
            });
        }, 1000 * 30);
    }

    // 获取目录下文件
    async sftGetDir(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
            const sftp = this.sftGet(client);
            const remotePath = req.dir;
            const result: GetFilePojo = {
                files: [],
                folders: []
            };
            sftp.readdir(remotePath, (err, list) => {
                if (err) throw err;
                list.forEach(file => {
                    const isDirectory = (file.attrs.mode & 0o170000) === 0o040000;
                    const isLink = (file.attrs.mode & 0o170000) === 0o120000;
                    const name = file.filename;
                    const size = formatFileSize(file.attrs.size);
                    const mtime = file.attrs.mtime;
                    const formattedCreationTime = getShortTime(new Date(mtime).getTime());
                    if (!isDirectory) {
                        result.files?.push({
                            type: FileTypeEnum.text,
                            name: name,
                            mtime: formattedCreationTime,
                            size,
                            isLink
                        })
                    } else {
                        result.folders?.push({
                            type: FileTypeEnum.folder,
                            name: name,
                            mtime: formattedCreationTime,
                            isLink
                        })
                    }
                });
                resolve(result);
            });

        }, 1000 * 30);

    }

    // 读文本文件
    async sftGetFileText(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
            const sftp = this.sftGet(client);
            let fileContent = '';
            // 创建一个读取流，从远程文件读取
            const readStream = sftp.createReadStream(req.file);
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
                resolve("");
            });
        }, 1000 * 30);

    }

    // 写文本文件
    async sftUpdateFileText(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
            const sftp = this.sftGet(client);
            // 创建一个写入流，写入到远程文件
            const writeStream = sftp.createWriteStream(req.file);
            // 将字符串内容写入写入流
            writeStream.write(req.context, 'utf-8');
            // 结束写入流
            writeStream.end();
            // 监听写入流关闭事件
            writeStream.on('close', () => {
                console.log('File uploaded successfully');
                resolve(true)
            });
            // 监听写入流错误事件
            writeStream.on('error', (err) => {
                console.error('Error uploading file:', err);
                resolve(false);
            });
        }, 1000 * 30);
    }

    // 创建文件夹
    async sftCreateDir(req: SshPojo, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 创建文件夹
            const sftp = this.sftGet(client);
            sftp.mkdir(req.dir, (err) => {
                if (err) {
                    console.error('Error creating folder:', err);
                } else {
                    console.log('Folder created successfully');
                }
                resolve(true);
            });

        }, 1000 * 30);
    }

    async sftDelteFile(file: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            //删除文件
            const sftp = this.sftGet(client);

            // 删除文件
            sftp.unlink(file, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                }
                resolve(true);
            });
        });
    }

    async sftDelteFolder(file: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
            client.exec(`rm -r ${file}`, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    resolve(true);
                });
            });
        });
    }

    async sftDeletes(req: SshPojo, client: Client) {
        let files1 = [];
        let folders1 = [];
        const result = await this.sftGetDir(req, client);
        if (result) {
            // @ts-ignore
            const {files, folders} = result;
            if (folders) {
                folders1 = folders.map(folder => folder.name);
            }
            if (files) {
                files1 = files.map(v => v.name);
            }
        }
        for (const file of files1) {
            await this.sftDelteFile(file, client);
        }
        for (const folder of folders1) {
            await this.sftDelteFolder(folder, client);
        }
    }

    // 复制文件 一次一个
    async sftCopyFile(sourceFileOrDir: string, target: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
            client.exec(`cp -r ${sourceFileOrDir} ${target}`, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    resolve(true);
                });
            });
        });
    }

    // 移动文件 一次一个 也可以用作修改文件名
    async sftMoveFile(sourceFileOrDir: string, target: string, client: Client) {
        return this.asyncExec((resolve, reject) => {
            // 删除目录
            // 执行远程命令删除文件
            client.exec(`mv  ${sourceFileOrDir} ${target}`, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    resolve(true);
                });
            });
        });
    }
}
