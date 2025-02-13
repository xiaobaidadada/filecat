import {http_body_type, HttpFormData, HttpFormPojo, NetPojo} from "../../../common/req/net.pojo";
import {findAvailablePort} from "../../../common/findPort";
import {Fail, Sucess} from "../../other/Result";
import proxy from 'koa-proxies';
import {Request, Response} from "express";
import path from "path";
import fs from "fs";
import multer from 'multer';
import { DataUtil} from "../data/DataUtil";
import {data_dir_tem_name} from "../data/data_type";

const needle = require('needle');


const Koa = require('koa');
const cors = require('@koa/cors');
const httpsProxyAgent = require('https-proxy-agent')
const dgram = require('dgram');

let interval = null;

interface proxyInterface {
    server;
    beforPort: number;
    heartbeat: boolean;
}

const proxyTargetUrlMap: Map<string, proxyInterface> = new Map();
const checkTimeLength = 1000 * 60 * 10;// 十分钟没有触发，就关闭
export class NetService {
    public async start(data: NetPojo) {
        const map = proxyTargetUrlMap.get(data.targetProxyUrl);
        if (map) {
            return Sucess(map.beforPort);
        }
        const pojo: proxyInterface | any = {};
        proxyTargetUrlMap.set(data.targetProxyUrl, pojo);
        const port = await findAvailablePort(49152, 65535);
        pojo.beforPort = port;
        const app = new Koa();
        // 自定义 CORS 规则
        app.use(cors());
        pojo.server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
        const options = {
            target: data.targetProxyUrl,
            changeOrigin: true,
            events: {
                proxyRes(proxyRes, req, res) {
                    // 修改响应头
                    // proxyRes.headers['X-Frame-Options'] = `ALLOW-FROM ${req.headers.referer}`;
                    // proxyRes.headers['Content-Security-Policy'] = "frame-ancestors *";
                    proxyRes.headers['X-Frame-Options'] = ``;
                    proxyRes.headers['Content-Security-Policy'] = "";
                }
            },
            rewrite: function (path) {
                pojo.heartbeat = true;
                return path;
            },
        }
        if (data.sysProxyPort) {
            options['agent'] = new httpsProxyAgent(`http://127.0.0.1:${data.sysProxyPort}`);
        }
        app.use(proxy(/^.*$/, options));
        const result = new NetPojo();
        result.proxyPort = port;
        if (!interval) {
            interval = setInterval(() => {
                const keys = proxyTargetUrlMap.keys();
                for (const key of keys) {
                    const value = proxyTargetUrlMap.get(key);
                    if (!value.heartbeat) {
                        if (value.server) {
                            value.server.close();
                        }
                        proxyTargetUrlMap.delete(key);
                        console.log('超时关闭代理', key)
                    } else {
                        value.heartbeat = false;
                    }
                }
                if (proxyTargetUrlMap.size === 0) {
                    // 没有了
                    clearInterval(interval);
                    interval = null;
                }
            }, checkTimeLength);
        }
        return Sucess(port);
    }

    // todo 确保不会出现没有关闭的代理，工具本身有没有超时断开这样的功能等
    public close(data: NetPojo) {
        if (!data.targetProxyUrl) {
            // 关闭所有
            const keys = proxyTargetUrlMap.keys();
            for (const key of keys) {
                const value = proxyTargetUrlMap.get(key);
                if (value.server) {
                    value.server.close();
                }
                proxyTargetUrlMap.delete(key);
                value.heartbeat = false;
            }
            if (interval) {
                clearInterval(interval);
            }
            return;
        }
        const value = proxyTargetUrlMap.get(data.targetProxyUrl);
        if (value) {
            if (value.server) {
                value.server.close();
            }
            proxyTargetUrlMap.delete(data.targetProxyUrl);
        }
        console.log('主动关闭代理', data.targetProxyUrl)
    }

    wol(macAddress: string) {
        // 创建UDP套接字
        const socket = dgram.createSocket('udp4');

        // 设置广播模式
        socket.bind(() => {
            socket.setBroadcast(true);
        });

        // 构建WOL数据包
        const macBytes = macAddress.split(':').map(hex => parseInt(hex, 16));
        const magicPacket = Buffer.concat([
            Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
            Buffer.concat(Array(16).fill(Buffer.from(macBytes)))
        ]);

        // 发送数据包 端口一般为9
        socket.send(magicPacket, 9, '127.0.0.1', (err) => {
            if (err) {
                console.error('Error sending WOL packet:', err);
            } else {
                console.log('WOL packet sent successfully!');
            }
            // 关闭套接字
            socket.close();
        });
    }

    fileUploadOptions = {
        storage: multer.diskStorage({
            destination: (req: any, file: any, cb: any) => {
                // return cb(new Error("Custom error: Path issue"));
                cb(null, req.fileDir);  // 存储路径
            },
            filename: (req: any, file: any, cb: any) => {
                // file.originalname
                cb(null, file.fieldname);
            }
        })
    };
    upload = multer({
        storage: this.fileUploadOptions.storage,
        // limits: { fileSize: 1024 * 1024 * 2 }, // 限制文件大小为 2MB 无限制
    }).any();

    public httpSend(req: Request, res: Response) {

        const sysPath = path.join(DataUtil.get_tem_path(data_dir_tem_name.http_tempfile));
        req['fileDir'] = sysPath;
        // req['fileName'] = path.basename(sysPath);
        return new Promise((resolve)=>{
            this.upload(req, res, (err) => {
                // console.log(req)
                if (err) {
                    resolve(res.status(500).send(Fail(err.message)));
                    return;
                }
                const pojo = JSON.parse(req.body.data) as HttpFormPojo;
                const call = (err, needle_res) => {
                    if (err) {
                        console.error('Error:', err);
                        resolve(res.status(500).send(err.code));
                    } else {
                        resolve(res.header('filecat_remote_raw_headers',needle_res.rawHeaders).header("filecat_remote_code",needle_res.statusCode).status(200).send(needle_res.raw));
                    }
                    if(pojo.form_data_list) {
                        for(const item of pojo.form_data_list as HttpFormData[]) {
                            try {
                                if(item.is_file) {
                                    fs.unlinkSync(path.join(sysPath,item.fullPath))
                                }
                            } catch (e) {
                                console.log(e)
                            }
                        }
                    }

                };
                const option = {
                    headers:pojo.headers
                };
                try {
                    if (pojo.body_type === http_body_type.json) {
                        pojo.data = pojo.json_data;
                    }
                    switch (pojo.method) {
                        case 'get':
                            needle.get(pojo.url,option, call); // needle("get"...) 就会报错 。。。
                            break;
                        case 'put':
                        case 'post': {
                            if (pojo.form_data_list && pojo.form_data_list.length > 0 && pojo.body_type === http_body_type.form) {
                                option['multipart'] = true;
                                const form = {};
                                const files = {};
                                for (const f of req['files'] ?? []) {
                                    files[f['fieldname']] = f;
                                }
                                for(const item of pojo.form_data_list as HttpFormData[]) {
                                    if(item.is_file) {
                                        form[item.key] = {
                                            file:path.join(sysPath,item.fullPath) ,
                                            filename: item.fileName,
                                            content_type: files[item.fullPath]?.mimetype
                                        };
                                    } else {
                                        form[item.key] = item.value;
                                    }
                                }
                                needle[pojo.method](pojo.url,form,option, call);
                            } else {
                                needle[pojo.method](pojo.url,pojo.data,option, call);
                            }
                        }
                            break;
                        default:
                            needle[pojo.method](pojo.url,pojo.data,option, call);
                            break;
                    }
                } catch (e) {
                    resolve(res.status(500).send(e.message));
                }
            });
        })
    }
}

export const netService: NetService = new NetService();
