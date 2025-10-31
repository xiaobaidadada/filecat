import {
    http_body_type,
    http_download_map,
    HttpFormData,
    HttpFormPojo,
    HttpProxy, MacProxy,
    NetPojo, HttpServerProxyItem
} from "../../../common/req/net.pojo";
import {findAvailablePort} from "../../../common/findPort";
import {Fail, Sucess} from "../../other/Result";
import proxy from 'koa-proxies';
import {Request, Response} from "express";
import path from "path";
import fs from "fs";
import multer from 'multer';
import {DataUtil} from "../data/DataUtil";
import {data_dir_tem_name} from "../data/data_type";
import {settingService} from "../setting/setting.service";
import {userService} from "../user/user.service";
import {generateRandomHash} from "../../../common/StringUtil";
import {FileUtil} from "../file/FileUtil";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {execSync} from "child_process";
import {node_process_watcher} from "node-process-watcher";
import http, {IncomingMessage, ServerResponse} from 'http';
import {URL} from 'url';
import https from 'https';


const needle = require('needle');

let proxyServer: http.Server | null = null;
// 证书和私钥作为字符串
const cert = `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUBU8LWB+MaQnZD8detsI4OkZy5GEwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNTEwMzExMzIxMDZaFw0yNjEw
MzExMzIxMDZaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDegov3ho6qYBdc3tda54jNFJvivJ5oImfl31E7dy0p
Vt97xRcUyZw95vaZHvrlwqh1rL/qqbo1nCAXbNMjefZLXWu504Aiuqv90OThQ2xA
+X1R2tYKBRdXZ/uoOJrCp4kFawSjmN2lcpZwuYdkzjdf44XNssW9BLohcurFk73f
HWnaYVCVieowUTfowfgRYVW5OJUwVzgpZoW4LOanAnRfNxdzse4urONvVtB1IcGJ
s6tSBdUpj8De0u5/NX+By5hS7sLA7UhYHKHG7epl71weieH+ntOEr0J5TP6KwINj
/uwqz5ajqqlsln7KASVSg6rFH+XmXGn08cFKV8dbcbZDAgMBAAGjUzBRMB0GA1Ud
DgQWBBSUhzPh9Ztb4RC4g0RHHIcPqrcobjAfBgNVHSMEGDAWgBSUhzPh9Ztb4RC4
g0RHHIcPqrcobjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCb
gX2NCoDW5qMOYfc9LQVW9HiiuPSbfOu1V+KYz6XXLvMoGiNRz/YJcl2SZtW4RWII
MfG1Smucu3xv95fXYDQLTkNwHG4CdXruC6tJYFxp1scDRX8hijfDHVRtd6ps/D5G
vk5mMvtpCUMtQRDfeBpOs2gK6pb/v5wz+cQNky2gf8SeligBBBQkWJZNOOXeBCDg
52miBkk0idPDI/O7r/BYxn8yeKowN+x1veT7RHGbw/RPr+QjIO+pLHSN+CjOinCg
E7yKgMo2KcSJnA0l/mHWcX5ph6x7fh/hOuuJJ72msCjcfGcnv42KBb3sipsYuBvU
z9uHLgWM1IwR/DE/X0sN
-----END CERTIFICATE-----`;

const key = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDegov3ho6qYBdc
3tda54jNFJvivJ5oImfl31E7dy0pVt97xRcUyZw95vaZHvrlwqh1rL/qqbo1nCAX
bNMjefZLXWu504Aiuqv90OThQ2xA+X1R2tYKBRdXZ/uoOJrCp4kFawSjmN2lcpZw
uYdkzjdf44XNssW9BLohcurFk73fHWnaYVCVieowUTfowfgRYVW5OJUwVzgpZoW4
LOanAnRfNxdzse4urONvVtB1IcGJs6tSBdUpj8De0u5/NX+By5hS7sLA7UhYHKHG
7epl71weieH+ntOEr0J5TP6KwINj/uwqz5ajqqlsln7KASVSg6rFH+XmXGn08cFK
V8dbcbZDAgMBAAECggEAVKNx3GDpqbNNj70QS/rglanuNgwrcU8NGGqe+rC1lBEA
h5ML2ZNrBDzztoELTRSDgeeJRRj0xOmzZ1W05rzAzCAoFxJ1nkBFphGszmcYKYr9
eYJ1gnA3Vb8vAekuLTcPLulrZVODlCiHQy+/ab/rXmUsg3cqMmE27/xHg4pUYiaX
UNSMJIBmxx9qCXbmn9doPJ4boYFH1+fD2SW7O0FMvvEdqvCZGjt6h/aP1q+6mwzN
B42SK5kXx0h+ivhxunoyJcc6WwemwqJJJrcReGvLB/vbDob6uGnkFV45lCHjeaD6
BFPhmmJ5vkCcPlPCaZ/4E3tCAIsTokfnNSDh5UV6QQKBgQD6jkRrbhmHzGx+aJM5
3pKpBKE026O4NZUbMTWz8m2GeySRsrpkN4HGXD/5VNhonPazM8OPWybTsMyG5rgv
gWmreFWpg/QNZ3OAIlHcISSEwVo1apahTuHBtEPiF2+qRkNeEo8iBQ0luDIoszoV
tLJDf5j5EZpTXM8gwTvjtV9TIQKBgQDjWEXhMI1sM7/oc9w4E1efl2m/cqWfYmki
ojlrhlrTian/JR6Psos8QepoXuGquI5ttO6iF/HUxCBocXeA1QmC9WLtaB/gELh0
iSMnq2tvozE5b7rrCnNIhdYDJ2F8+dO2NpaDCOZ8YBF1g2T+P1PVy0JKlJCWzRZ7
4nXDxYsA4wKBgQDEnoIYoATO6V+2bxAh2ITUt/pdhYLb2siQ1zQiazsBzn7rCwtz
+48Of3QAkFFm/s4l4Jg1Vj2I3/QQZNvjA7ZNxhfK9+672hPsWIJOsX974lONGYDt
Qv6sSG8A7I1HXO4e04eZFce0cvCBuev5/pvplicQRX0KsAkm1hzOW5VboQKBgQDH
KqAdhfF/Z16qgEXfAmLzNyy3QfMCzK4aX1A6eLu9Mo8xLQ23Cc2c/ooi4WyFqaVt
SuL8Mkn0AdX6ad0tinUIu3ztSxkRrNRLk5Cuwige5zLKhK2WF9OjJ0yz+p4XZK4q
pWv6Y6O4NllVP8UMT+JcG/N5bum0kvstkNlmpvr9zQKBgQCN34qfMlKvo0w8owJ8
4CtuXLZQ7doZQdxxwuKuZYKmaa1OVGNZz2RMQmBGZ24dOog3TmXoLCpSAzy8zlyM
nI7AlVSU3IC5DNJBLVQV3yrq18A6em+IUl6UJJd4k7JDTsVQ2lVjZz6nBIJKaQsG
rRCH9e8jJu2lg/mNn3hlrm/Z7g==
-----END PRIVATE KEY-----`;

const Koa = require('koa');
const cors = require('@koa/cors');
const httpsProxyAgent = require('https-proxy-agent')
const dgram = require('dgram');
import express from 'express';

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

    http_download_map = new Map<string, http_download_map & { stream?: any }>();
    http_download_water_wss_map = new Map<string, Wss>();

    http_download_water_interval;
    http_download_water_time;

    http_download_water_interval_start() {
        if (!this.http_download_water_interval && this.http_download_map.size !== 0 && this.http_download_water_wss_map.size !== 0) {
            this.http_download_water_send_all();
            this.http_download_water_time = Date.now();
            this.http_download_water_interval = setInterval(() => {
                this.http_download_water_send_all();
                if (this.http_download_water_wss_map.size === 0 || this.http_download_map.size === 0) {
                    clearInterval(this.http_download_water_interval);
                    this.http_download_water_interval = undefined
                    return;
                }
            }, 1000)
        }
    }

    http_download_water(data: WsData<any>) {
        const wss = data.wss as Wss;
        if (this.http_download_water_wss_map.has(wss.id)) {
            return;
        }
        this.http_download_water_wss_map.set(wss.id, wss);
        wss.setClose(() => {
            this.http_download_water_wss_map.delete(wss.id);
        })
        this.http_download_water_interval_start();
        if (!this.http_download_water_time) {
            this.http_download_water_time = Date.now();
        }
        const now = Date.now();
        const timeElapsed = (now - this.http_download_water_time) / 1000;  // 时间差（秒）
        this.http_download_water_time = now;
        return [...this.http_download_map.values()].map(it => {
            return this.get_http_download_info(it, timeElapsed)
        });
    }

    http_download_cancel(data: WsData<any>) {
        const pojo = this.http_download_map.get(data.context);
        if (pojo) {
            this.http_download_map.delete(data.context);
            pojo.stream.destroy(); // 终止请求
            pojo.stream['fileStream'].end();
        }
    }

    get_http_download_info(it: http_download_map, timeElapsed) {
        const speedInKBps = (it.loaded - it.last_loaded) / timeElapsed / (1024 * 1024); // mb 每秒
        it.last_loaded = it.loaded;
        it.seep = speedInKBps.toFixed(2);
        const progresses = !it.total ? 0 : ((it.loaded / it.total) * 100).toFixed(2);
        it.progresses = progresses;
        return {
            seep: it.seep,
            loaded: it.loaded,
            total: it.total,
            local_download_path: it.local_download_path,
            progresses: progresses,
            filename: it.filename,
        }
    }

    http_download_water_send_all() {
        const list = [];
        const now = Date.now();
        const timeElapsed = (now - this.http_download_water_time) / 1000;  // 时间差（秒）
        this.http_download_water_time = now;
        for (const it of this.http_download_map.values()) {
            list.push(this.get_http_download_info(it, timeElapsed));
        }
        const result = new WsData<http_download_map[]>(CmdType.http_download_water);
        result.context = list;
        const d = result.encode();
        for (const wss of this.http_download_water_wss_map.values()) {
            wss.sendData(d);
        }
    }

    public httpSend(req: Request, res: Response, local_download_path?: string) {
        try {
            if (local_download_path) {
                local_download_path = path.join(decodeURIComponent(local_download_path));
                userService.check_user_path(req.headers.authorization, local_download_path)
            }
            const sysPath = path.join(DataUtil.get_tem_path(data_dir_tem_name.http_tempfile));
            req['fileDir'] = sysPath;
            // req['fileName'] = path.basename(sysPath);
            return new Promise(async (resolve) => {
                try {
                    let is_dir = false;
                    if (local_download_path) {
                        if (!await FileUtil.access(local_download_path)) {
                            // 不存在 看看 它的父目录是否存在
                            const dir = path.dirname(local_download_path);
                            if (!await FileUtil.access(dir)) {
                                // 父目录也不存在
                                resolve(res.status(200).send(Fail("目录不存在")));
                                return;
                            }
                            const stats = await FileUtil.statSync(dir);
                            if (stats.isFile()) {
                                // 父目录居然不是个目录
                                resolve(res.status(200).send(Fail("不合法的下载地址")));
                                return;
                            }
                        } else {
                            const stats = await FileUtil.statSync(local_download_path);
                            is_dir = stats.isDirectory();
                        }
                    }
                    this.upload(req, res, async (err) => {
                        // console.log(req)
                        if (err) {
                            resolve(res.status(200).send(Fail(err.message)));
                            return;
                        }
                        const pojo = JSON.parse(req.body.data) as HttpFormPojo;
                        let call = async (err, needle_res) => {
                            if (err) {
                                console.error('Error:', err);
                                resolve(res.status(200).send(Fail(err.message)));
                            } else {
                                resolve(res.header('filecat_remote_raw_headers', JSON.stringify(needle_res.headers)).header("filecat_remote_code", needle_res.statusCode).status(200).send(needle_res.raw));
                            }
                            try {
                                if (pojo.form_data_list && pojo.form_data_list.length) {
                                    for (const item of pojo.form_data_list as HttpFormData[]) {

                                        if (item.is_file) {
                                            await FileUtil.unlinkSync(path.join(sysPath, item.fullPath))
                                            // fs.unlinkSync(path.join(sysPath,item.fullPath))
                                        }

                                    }
                                    pojo.form_data_list = undefined;
                                }
                            } catch (e) {
                                console.log(e)
                            }

                        };
                        if (local_download_path) {
                            call = undefined; // 当不提供 call 函数的时候 返回结果就不会留在内存中
                        }
                        const option = {
                            headers: pojo.headers
                        };
                        try {
                            // if (pojo.body_type === http_body_type.json) {
                            //     pojo.data = pojo.json_data;
                            // }
                            var stream;
                            switch (pojo.method) {
                                case 'get':
                                    stream = needle.get(pojo.url, option, call); // needle("get"...) 就会报错 。。。
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
                                        for (const item of pojo.form_data_list as HttpFormData[]) {
                                            if (item.is_file) {
                                                form[item.key] = {
                                                    file: path.join(sysPath, item.fullPath),
                                                    filename: item.fileName,
                                                    content_type: files[item.fullPath]?.mimetype
                                                };
                                            } else {
                                                form[item.key] = item.value;
                                            }
                                        }
                                        stream = needle[pojo.method](pojo.url, form, option, call);
                                    } else {
                                        stream = needle[pojo.method](pojo.url, pojo.data, option, call);
                                    }
                                }
                                    break;
                                default:
                                    stream = needle[pojo.method](pojo.url, pojo.data, option, call);
                                    break;
                            }
                            if (local_download_path) {
                                let new_path = local_download_path;
                                // const stats = await FileUtil.statSync(local_download_path);
                                await new Promise((r) => {

                                    stream.on('header', async (statusCode, headers) => {
                                        // console.log('接收到 header 事件：');
                                        // console.log('状态码:', statusCode);
                                        // console.log('响应头:', headers);
                                        // 名称获取
                                        if (is_dir) {
                                            const contentDisposition = headers['content-disposition'] || headers["contentDisposition"];
                                            if (contentDisposition) {
                                                const match = contentDisposition.match(/filename\*?=["']?(?:UTF-8'')?([^"';]+)/i);
                                                if (match && match[1]) {
                                                    // console.log('文件名:', decodeURIComponent(match[1]));
                                                    local_download_path = path.join(local_download_path, decodeURIComponent(match[1]));
                                                } else {
                                                    local_download_path = path.join(local_download_path, `temp_${generateRandomHash(15)}_${Date.now()}`);
                                                }
                                            } else {
                                                local_download_path = path.join(local_download_path, `temp_${generateRandomHash(15)}_${Date.now()}`);
                                            }
                                        }
                                        if (await FileUtil.access(local_download_path)) {
                                            new_path = await FileUtil.getUniqueFileName(local_download_path);
                                        } else {
                                            new_path = local_download_path;
                                        }
                                        resolve(res.header('filecat_remote_raw_headers', JSON.stringify(headers)).header("filecat_remote_code", statusCode).status(200).send(`文件: ${new_path}  正在下载...`));
                                        // 大小获取
                                        const contentLength = headers['content-length'] || headers['contentLength'];
                                        let totalBytes;
                                        if (contentLength) {
                                            totalBytes = parseInt(contentLength, 10); // 获取文件总大小
                                        }
                                        const pojo = {
                                            last_load_time: Date.now(),
                                            filename: path.basename(new_path),
                                            local_download_path: new_path,
                                            total: totalBytes,
                                            loaded: 0,
                                            last_loaded: 0
                                        }
                                        this.http_download_map.set(new_path, pojo);
                                        r(true);
                                    });
                                })

                                // 创建文件写入流
                                const fileStream = fs.createWriteStream(new_path);
                                // 将响应流管道到文件流
                                stream.pipe(fileStream);
                                this.http_download_water_interval_start();
                                const pojo = this.http_download_map.get(new_path);
                                pojo.stream = stream;
                                stream['fileStream'] = fileStream;
                                stream.on('data', (chunk) => {
                                    pojo.loaded += chunk.length;
                                    // const progress = ((pojo.loaded / totalBytes) * 100).toFixed(2);
                                    // console.log(`下载进度: ${progress}%`);
                                });
                                // 监听文件流的关闭事件
                                fileStream.on('finish', () => {
                                    // console.log('文件下载完成:',new_path);
                                    this.http_download_map.delete(new_path);
                                });
                                stream.on('end', () => {
                                    // console.log('文件下载完成');
                                    fileStream.end();
                                    this.http_download_map.delete(new_path);
                                });
                            }

                        } catch (e) {
                            resolve(res.status(200).send(Fail(e.message)));
                            console.log(e)
                        }
                    });
                } catch (e) {
                    resolve(res.status(200).send(Fail(e.message)));
                    console.log(e);
                }
            })
        } catch (e) {
            res.status(200).send(Fail(e.message));
        }
    }


    getWindowsProxy(): HttpProxy {
        return node_process_watcher.get_system_proxy_for_windows() as HttpProxy
    }

    getMacProxy(): MacProxy {
        // @ts-ignore
        return node_process_watcher.get_system_proxy_for_mac() as MacProxy
    }


    setWindowsProxy(config: HttpProxy) {
        try {
            node_process_watcher.set_system_proxy_for_windows(config)
        } catch (err) {
            console.error("❌ 设置代理失败:", err.message);
        }
    }

    setMacProxy(config: MacProxy[]) {
        try {
            // @ts-ignore
            node_process_watcher.set_system_proxy_for_mac(config)
        } catch (err) {
            console.error("❌ 设置代理失败:", err.message);
        }
    }


    httpServerStart(
        list: HttpServerProxyItem[],
        server_port: number,
        useHttps: boolean = false
    ) {
        if (proxyServer) return;

        const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
            if (!req.url) return res.end();

            const protocol = useHttps ? 'https:' : 'http:';
            const host = req.headers.host;
            const fullUrl = `${protocol}//${host}${req.url}`;

            const item = list.find(i => new RegExp(i.url_regexp).test(fullUrl));
            if (!item) {
                res.writeHead(404);
                return res.end('No matching proxy rule.');
            }

            const rewrittenUrl = fullUrl.replace(
                new RegExp(item.rewrite_regexp_source),
                item.rewrite_target
            );
            const targetUrl = new URL(rewrittenUrl);

            const options: http.RequestOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + (targetUrl.search ? '?' + targetUrl.search : ''),
                method: req.method,
                headers: { ...req.headers },
            };

            if (item.changeOrigin) {
                options.headers!['host'] = targetUrl.host;
            }

            const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request(
                options,
                proxyRes => {
                    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
                    proxyRes.pipe(res, { end: true });
                }
            );

            proxyReq.on('error', err => {
                res.writeHead(500);
                res.end('Proxy error: ' + err.message);
            });

            req.pipe(proxyReq, { end: true });
        };

        if (useHttps) {
            proxyServer = https.createServer({ key, cert }, requestHandler);
        } else {
            proxyServer = http.createServer(requestHandler);
        }

        proxyServer.listen(server_port, () => {
            console.log(`${useHttps ? 'HTTPS' : 'HTTP'} Proxy server running on port ${server_port}`);
        });
    }

    /**
     * 关闭 HTTP 代理服务
     */
    public httpServerProxyclose() {
        if (proxyServer) {
            proxyServer.close(() => console.log('Proxy server closed.'));
            proxyServer = null;
        }
    }

}

export const netService: NetService = new NetService();


// console.log(netService.getMacProxy())


// const proxyList: HttpServerProxyItem[] = [
//     {
//         url_regexp: '^https://localhost:8080',
//         changeOrigin: false,
//         rewrite_regexp_source: '^https://localhost:8080',
//         rewrite_target: 'http://localhost:80'
//     }
// ];
//
// netService.httpServerStart(proxyList, 8080,true);