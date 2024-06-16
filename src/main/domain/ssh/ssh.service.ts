import {SshPojo} from "../../../common/req/ssh.pojo";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";

const {Readable} = require('stream');
const EventEmitter = require('events');


import {Client} from 'ssh2';
import {SshSsh2} from "./ssh.ssh2";
import path from "path";
import {Env} from "../../../common/Env";
import fs from "fs";
import archiver from "archiver";
import Stream from "node:stream";
import multer from "multer";
import {Context} from "koa";
import {DataUtil} from "../data/DataUtil";


export const navindex_remote_ssh_key = "navindex_remote_ssh_key";

export class SshService extends SshSsh2 {

    async start(req: SshPojo) {
        const data = this.lifeGetData(SshPojo.getKey(req));
        if (data) {
            return true;
        }
        const client = await this.connect(req);
        this.lifeStart(SshPojo.getKey(req), client, async (c) => {
            try {
                client.end();
            } catch (e) {
                console.log('触发', e)
            }
        })
        return true;
    }

    async close(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req));
        if (client) {
            this.lifeClose(SshPojo.getKey(req));
        }
        return true;
    }


    async getDir(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return [];
        }
        this.lifeHeart(SshPojo.getKey(req));
        return this.sftGetDir(req, client);
    }

    async getFileText(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        this.lifeHeart(SshPojo.getKey(req));
        return this.sftGetFileText(req, client);
    }

    async updateFileText(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        this.lifeHeart(SshPojo.getKey(req));
        return this.sftUpdateFileText(req, client);
    }

    async create(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        if (req.dir) {
            await this.sftCreateDir(req, client);
        } else if (req.file) {
            req.context = "";
            await this.sftUpdateFileText(req, client);
        }
        this.lifeHeart(SshPojo.getKey(req));
        return;
    }

    async deletes(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        if (req.dir) {
            await this.sftDelteFolder(req.dir, client);
        } else if (req.file) {
            await this.sftDelteFile(req.file, client);
        }
        this.lifeHeart(SshPojo.getKey(req));
        return;
    }

    async move(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        await this.sftMoveFile(req.source, req.target, client);
        this.lifeHeart(SshPojo.getKey(req));
        return;
    }

    async copy(req: SshPojo) {
        const client = this.lifeGetData(SshPojo.getKey(req)) as Client;
        if (!client) {
            return "";
        }
        await this.sftCopyFile(req.source, req.target, client);
        this.lifeHeart(SshPojo.getKey(req));
        return;
    }

    async send(data: WsData<SshPojo>) {
        try {
            const pojo = data.context as SshPojo;
            const wss = (data.wss as Wss);
            let emitter = wss.dataMap.get("emitter");
            if (!emitter) {
                emitter = new EventEmitter();
                wss.dataMap.set("emitter", emitter);
                const client = this.lifeGetData(SshPojo.getKey(pojo)) as Client;
                if (!client) {
                    return "";
                }
                client.shell((err, stream) => {
                    // cd目录
                    stream.write(`cd '${pojo.dir}' \r`);
                    //发送到web
                    stream.on('data', (cmdData) => {
                        const result = new WsData<SysPojo>(CmdType.remote_shell_getting);
                        result.context = cmdData.toString();
                        (data.wss as Wss).ws.send(result.encode())
                    })
                    // 发送
                    emitter.on('data', (data) => {
                        stream.write(data);
                    });

                    wss.ws.on('close', function close() {
                        // 发送命令以关闭shell会话
                        stream.end('exit\r');
                    });
                })
            } else {
                if (data.context !== null && data.context !== "null") {
                    emitter.emit("data", data.context)
                }
            }
        } catch (e) {
            console.log(e)
        }

    }

    cancel(data: WsData<SshPojo>) {
        const wss = (data.wss as Wss);
        const emitter = wss.dataMap.get("emitter");
        if (emitter) {
            emitter.emit("data", "exit\r");
        }
    }

    cd(data: WsData<SshPojo>) {
        const wss = (data.wss as Wss);
        const emitter = wss.dataMap.get("emitter");
        if (emitter) {
            if (data.context) {
                emitter.emit("data", `cd '${data.context}' \r`);
            }
        }
    }

    download(ctx) {
        const file = ctx.request.query.file;
        if (!file || !file.length) {
            ctx.status = 404;
            ctx.body = 'File not found';
            return;
        }
        ctx.attachment(file);
        ctx.set('Content-Type', 'application/octet-stream');
        const stream = new Stream.PassThrough()
        ctx.body = stream
        const client = this.lifeGetData(SshPojo.getKey(ctx.request.query)) as Client;
        if (!client) {
            return ctx.body = "";
        }
        const sftp = this.sftGet(client);
        const readStream = sftp.createReadStream(file);
        readStream.pipe(stream);
    }

    public uploadFile(ctx, file: multer.File) {
        const client = this.lifeGetData(SshPojo.getKey(ctx.request.query)) as Client;
        const sftp = this.sftGet(client);
        const remoteFilePath = ctx.request.query.target;

        const temp = "tempfile";

        const localFilePath = DataUtil.writeFileSyncTemp(path.basename(remoteFilePath),temp,file.buffer);


        const readStream = fs.createReadStream(localFilePath);
        const writeStream = sftp.createWriteStream(remoteFilePath);
        // const stats = fs.statSync(localFilePath);
        // const totalSize = stats.size;
        // let uploadedSize = 0;

        readStream.on('data', (chunk) => {
            // uploadedSize += chunk.length;
            // const percent = Math.floor((uploadedSize / totalSize) * 100);
            // console.log(`Progress: ${percent}%`);
        });

        return new Promise((resolve, reject) => {
            readStream.pipe(writeStream);
            writeStream.on('close', () => {
                resolve(1);
                fs.unlinkSync(localFilePath);
            });
            writeStream.on('error', (err) => {
                reject(err);
            });
        })
        // return new Promise((resolve, reject) => {
        //     sftp.fastPut(localFilePath, remoteFilePath, (err) => {
        //         if (err) {
        //             reject(err);
        //         } else {
        //             resolve(1);
        //         }
        //     });
        // })
        // const writeStream = sftp.createWriteStream(remoteFilePath);
        // // 将流数据写入远程文件
        // // 将文件数据转换为可读流
        // const fileStream = Readable.from(file.buffer);
        // fileStream.pipe(writeStream);

        // sftp.fastPut(file.buffer, remoteFilePath, (err) => {
        //     if (err) throw err;
        // });

    }
}

export const sshService = new SshService();
