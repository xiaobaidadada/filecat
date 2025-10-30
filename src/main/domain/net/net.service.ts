import {
    http_body_type,
    http_download_map,
    HttpFormData,
    HttpFormPojo,
    HttpProxy,
    NetPojo
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
       return  node_process_watcher.get_system_proxy() as HttpProxy
    }


    refreshWinInetProxy() {
        node_process_watcher.refresh_proxy();
    }

    setWindowsProxy(config: HttpProxy) {
        try {
            node_process_watcher.set_system_proxy(config)
            this.refreshWinInetProxy();

        } catch (err) {
            console.error("❌ 设置代理失败:", err.message);
        }
    }

}

export const netService: NetService = new NetService();


// console.log(netService.getWindowsProxy())