import {ShellInitPojo, SshPojo} from "../../../common/req/ssh.pojo";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
const {Readable} = require('stream');
const EventEmitter = require('events');

import {Client} from '@xiaobaidadada/ssh2-prebuilt';
import {sftp_client, SshSsh2} from "./ssh.ssh2";
import path from "path";
import {Env} from "../../../common/Env";
import fs from "fs";
import archiver from "archiver";
import Stream from "node:stream";
import {DataUtil} from "../data/DataUtil";
import {Fail, Sucess} from "../../other/Result";
import {RCode} from "../../../common/Result.pojo";
import {settingService} from "../setting/setting.service";
import multer from 'multer';
import {Request, Response} from "express";
import {FileUtil} from "../file/FileUtil";



export class SshService extends SshSsh2 {

    // map: Map<string, SshPojo> = new Map();
    async start(req: SshPojo) {
        let key = SshPojo.getKey(req);
        const data = this.lifeGetData(key);
        if (data) {
            return {key};
        }
        const client = await this.connect(req);
        if (!client) {
            throw "连接失败";
        }
        this.lifeStart(key, client, async (c) => {
            try {
                client[sftp_client].end();
                client.end();
                // this.map.delete(key);
            } catch (e) {
                console.log('触发', e)
            }
        })
        // this.map.set(key, req);
        return {key};
    }

    async close(req: SshPojo) {
        const client = this.lifeGetData(req.key);
        if (client) {
            this.lifeClose(req.key);
        }
        // this.map.delete(req.key);
        return true;
    }


    async getDir(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return [];
        }
        this.lifeHeart(req.key);
        return this.sftGetDir(decodeURIComponent(req.dir), client);
    }

    async getFileText(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        this.lifeHeart(req.key);
        const stats = await this.sftGetFileStats(req.file,client);
        // if (stats.size > MAX_SIZE_TXT) {
        //     return Fail("超过20MB",RCode.File_Max);
        // }
        return Sucess(await this.sftGetFileText(decodeURIComponent(req.file), client));
    }

    async updateFileText(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        this.lifeHeart(req.key);
        return this.sftUpdateFileText(req, client);
    }

    async create(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        if (req.dir) {
            await this.sftCreateDir(req, client);
        } else if (req.file) {
            req.context = "";
            await this.sftUpdateFileText(req, client);
        }
        this.lifeHeart(req.key);
        return;
    }

    async deletes(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        if (req.dir) {
            await this.sftDelteFolder(decodeURIComponent(req.dir), client);
        } else if (req.file) {
            await this.sftDelteFile(decodeURIComponent(req.file), client);
        }
        this.lifeHeart(req.key);
        return;
    }

    async move(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        await this.sftMoveFile(decodeURIComponent(req.source), decodeURIComponent(req.target), client);
        this.lifeHeart(req.key);
        return;
    }

    async copy(req: SshPojo) {
        const client = this.lifeGetData(req.key) as Client;
        if (!client) {
            return "";
        }
        await this.sftCopyFile(decodeURIComponent(req.source), decodeURIComponent(req.target), client);
        this.lifeHeart(req.key);
        return;
    }

    async open(data: WsData<SshPojo>) {
        try {
            const pojo = data.context as SshPojo;
            const client = this.lifeGetData(pojo.key) as Client;
            if (!client) {
                return "";
            }
            this.forEveryLifeHeart(pojo.key);
            const wss = (data.wss as Wss);
            let emitter = new EventEmitter();
            wss.dataMap.set(`emitter_${pojo.key}`, emitter);
            client.shell((err, stream) => {
                // 设置初始终端大小
                stream.setWindow(pojo.rows, pojo.cols);
                // cd目录
                stream.write(`cd '${pojo.init_path}' \r`);
                //发送到web
                stream.on('data', (cmdData) => {
                    const result = new WsData<SysPojo>(CmdType.remote_shell_getting);
                    result.context = cmdData.toString();
                    (data.wss as Wss).sendData(result.encode())
                })
                // 发送
                emitter.on('data', (data) => {
                    stream.write(data);
                });
                wss.setClose(()=>{
                    this.endForEveryLifeHeart(pojo.key);
                    // 发送命令以关闭shell会话
                    stream.end('exit\r');
                })
                // wss.ws.on('close', function close() {
                //
                // });
            })

        } catch (e) {
            console.log(e)
        }

    }

    async send(data: WsData<SshPojo>) {
        try {
            const pojo = data.context as SshPojo;
            const wss = (data.wss as Wss);
            let emitter = wss.dataMap.get(`emitter_${pojo.key}`);
            if (emitter) {
                if (pojo.cmd!== null && pojo.cmd !== "null") {
                    emitter.emit("data", pojo.cmd)
                }
            }
        } catch (e) {
            console.log(e)
        }

    }

    // cancel(data: WsData<SshPojo>) {
    //     const wss = (data.wss as Wss);
    //     const emitter = wss.dataMap.get("emitter");
    //     if (emitter) {
    //         emitter.emit("data", "exit\r");
    //     }
    // }

    // cd(data: WsData<SshPojo>) {
    //     const wss = (data.wss as Wss);
    //     const emitter = wss.dataMap.get("emitter");
    //     if (emitter) {
    //         if (data.context) {
    //             emitter.emit("data", `cd '${data.context}' \r`);
    //         }
    //     }
    // }

    download(ctx) {
        const file = ctx.query.file;
        if (!file || !file.length) {
            ctx.res.status(404).send('File not found');
            return;
        }
        ctx.res.attachment(file);
        ctx.res.set('Content-Type', 'application/octet-stream');
        // const stream = new Stream.PassThrough()
        // ctx.res.body = stream
        const client = this.lifeGetData(decodeURIComponent(ctx.query.key)) as Client;
        if (!client) {
            ctx.status(200).send('not connect ssh');
            return ;
        }
        const sftp = this.sftGet(client);
        const readStream = sftp.createReadStream(file);
        readStream.pipe(ctx.res);
    }

    fileUploadOptions = {
        storage: multer.diskStorage({
            destination: (req: any, file: any, cb: any) => {
                // return cb(new Error("Custom error: Path issue"));
                cb(null, req.fileDir);  // 存储路径
            },
            filename: (req: any, file: any, cb: any) => {
                // file.originalname
                cb(null, req.fileName);
            }
        })
    };

    upload = multer({
        storage: this.fileUploadOptions.storage,
        // limits: { fileSize: 1024 * 1024 * 2 }, // 限制文件大小为 2MB 无限制
    }).single('file');

    public uploadFileAsync(req: Request, res: Response): Promise<void> {
        return new Promise((resolve, reject) => {
            this.upload(req, res, (err) => {
                if (err) {
                    return reject(err);  // 如果出错，拒绝 Promise
                }
                resolve();  // 如果上传成功，解析 Promise
            });
        });
    }

    public async uploadFile(req:any,res:Response) {
        const client = this.lifeGetData(decodeURIComponent(req.query.key)) as Client;
        const sftp = this.sftGet(client);
        const remoteFilePath = decodeURIComponent(req.query.target);
        if (req.query.dir === "1") {
            req.dir = remoteFilePath;
            await this.sftCreateDir(req, client);
            return ;
        }
        const temp = "tempfile";

        const localFilePath = DataUtil.writeFileSyncTemp(path.basename(remoteFilePath),temp);
        req['fileDir'] = path.dirname(localFilePath);
        req['fileName'] = path.basename(localFilePath);
        await this.uploadFileAsync(req, res);
        return new Promise((resolve, reject) => {
            this.lifeHeart(req.query.key);
            // 上传文件
            sftp.fastPut(localFilePath, remoteFilePath, async (err) => { // 比下面的更快
                if (err) {
                    reject(err);
                } else {
                    resolve(1);
                }
                await FileUtil.unlinkSync(localFilePath);
            });
        });
        //
        // const readStream = fs.createReadStream(localFilePath);
        // const writeStream = sftp.createWriteStream(remoteFilePath);
        // readStream.on('data', (chunk) => {
        //     // 这种方式可以检测到进度 但是会慢点 fastPut 会并发 上传占用的内存都差不多
        //     // uploadedSize += chunk.length;
        //     // const percent = Math.floor((uploadedSize / totalSize) * 100);
        //     // console.log(`Progress: ${percent}%`);
        // });
        // return new Promise((resolve, reject) => {
        //     readStream.pipe(writeStream);
        //     writeStream.on('close', () => {
        //         resolve(1);
        //         readStream.close();
        //         fs.unlinkSync(localFilePath);
        //     });
        //     writeStream.on('error', (err) => {
        //         reject(err);
        //     });
        // })
    }
}

export const sshService = new SshService();
