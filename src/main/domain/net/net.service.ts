import {
    http_body_type,
    http_download_map,
    HttpFormData,
    HttpFormPojo,
    HttpProxy,
    HttpProxyITem,
    HttpProxyServerInstance,
    HttpServerProxy,
    MacProxy,
    NetPojo
} from "../../../common/req/net.pojo";
import {find_available_port} from "../../../common/node/findPort";
import {Fail, Sucess} from "../../other/Result";
import express from "express";

import {Request, Response} from "express";
import path from "path";
import fs from "fs";
import multer from 'multer';
import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {userService} from "../user/user.service";
import {generateRandomHash} from "../../../common/StringUtil";
import {FileUtil} from "../file/FileUtil";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {get_bin_dependency} from "../bin/get_bin_dependency";
import http, {IncomingMessage, ServerResponse} from 'http';
import {URL} from 'url';
import {ServerEvent} from "../../other/config";
import net from "net";
import vm from "node:vm";
import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {NetClientUtil} from "./util/NetClientUtil";
import {tcp_client, tcp_raw_socket} from "./util/tcp.client";
import {Env} from "../../../common/node/Env";
import * as util from "node:util";
import { createProxyMiddleware } from "http-proxy-middleware";
import { Duplex } from "node:stream";


const {node_process_watcher} = get_bin_dependency("node-process-watcher", false);

const needle = require('needle');

/**
 * 多端口代理服务器实例管理器
 * key: 端口号字符串, value: { server, socketSet }
 * 每个端口实例维护自己的 http.Server 和连接集合
 */
const proxyServerMap: Map<number, { server: http.Server; socketSet: Set<net.Socket> }> = new Map();
/**
 * 全局的转发规则列表（所有端口实例的所有规则合并后的结果）
 * 每个 HttpProxyITem 会附加一个 _source_port 字段，用于标识它来自哪个端口
 */
let proxy_server_list_data: (HttpProxyITem & { _source_port?: number })[] = []


const dgram = require('dgram');

let interval = null;

interface proxyInterface {
    server;
    beforPort: number;
    heartbeat: boolean;
}

// 创建安全的沙盒环境
const sandbox = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
};

const proxyTargetUrlMap: Map<string, proxyInterface> = new Map();
const checkTimeLength = 1000 * 60 * 10;// 十分钟没有触发，就关闭
export class NetService {
    private https_tunnel_traffic_save_timer?: NodeJS.Timeout;
    public async start(data: NetPojo) {
        const map = proxyTargetUrlMap.get(data.targetProxyUrl);
        if (map) {
            return Sucess(map.beforPort);
        }
        const pojo: proxyInterface | any = {};
        proxyTargetUrlMap.set(data.targetProxyUrl, pojo);
        const port = await find_available_port(49152, 65535);
        pojo.beforPort = port;

        const app = express();
        app.use((req, res, next) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            next();
        });
        const proxy = createProxyMiddleware({
            target: data.targetProxyUrl,
            changeOrigin: true,
            ws: true, // 支持 websocket
            pathRewrite: function (path) {
                pojo.heartbeat = true;
                return path;
            },
        });
        app.use("/", proxy);

        pojo.server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
        // if (data.sysProxyPort) {
        //     options['agent'] = new httpsProxyAgent(`http://127.0.0.1:${data.sysProxyPort}`);
        // }
        // app.use(proxy(/^.*$/, options));
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

                        // 🌟 【修复核心】防止 URL 中包含中文或未编码字符导致 ClientRequest 崩溃
                        if (pojo.url) {
                            try {
                                // 使用内置的 URL 对象，它会自动对 path 和 query 中的中文及特殊字符进行标准转义
                                const parsedUrl = new URL(pojo.url);
                                pojo.url = parsedUrl.toString();
                            } catch (e) {
                                // 如果输入的不是标准规范的 URL 格式，退一步使用传统的 encodeURI 补救
                                pojo.url = encodeURI(pojo.url);
                            }
                        }
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


    /**
     * 加载所有代理服务器实例的转发规则
     * 遍历每个端口实例，加载其下所有启用的 js 规则文件，
     * 合并到全局 proxy_server_list_data 中，并为每条规则标记来源端口
     */
    load_server_proxy() {
        const data = this.getHttpServerProxy();
        const list: (HttpProxyITem & { _source_port?: number })[] = [];
        // 遍历每个端口实例
        for (const instance of data.list ?? []) {
            if (!instance.open) continue; // 端口实例未启用则跳过
            // 遍历该端口下的每个规则文件
            for (const item of instance.list ?? []) {
                if (!item.open) continue; // 规则未启用则跳过
                if (!item.random_key) continue;
                try {
                    const context = DataUtil.getFile(
                        `data_common_key.proxy_server_code_prefix_${item.random_key}`,
                        data_dir_tem_name.http_proxy_server_dir
                    );
                    if (!context) continue;
                    let p;
                    try {
                        p = JSON.parse(context);
                    } catch (e) {
                        // 可能是一个立即执行函数 (() => { return [...] })()
                        const sandbox_context = vm.createContext({
                            ...sandbox
                        });
                        p = vm.runInContext(context, sandbox_context);
                    }
                    if (p) {
                        const items: HttpProxyITem[] = Array.isArray(p) ? p : [p];
                        // 为每条规则标记来源端口
                        for (const rule of items) {
                            list.push({ ...rule, _source_port: instance.port });
                        }
                    }
                } catch (e) {
                    console.error(`[HttpProxyServer] 加载规则文件失败, port=${instance.port}, key=${item.random_key}`, e);
                }
            }
        }
        proxy_server_list_data = list;
        console.log(`[HttpProxyServer] 转发规则已加载，共 ${list.length} 条规则`);
    }

    findProxyRule(fullUrl: string): HttpProxyITem | undefined {
        return proxy_server_list_data.find(i => new RegExp(i.url_regexp).test(fullUrl));
    };


    /**
     * 为单个端口实例创建并启动 HTTP 代理服务器
     * @param instance 端口实例配置（包含端口号和启用的转发规则）
     */
    private httpServerStartForInstance(instance: HttpProxyServerInstance) {
        const port = instance.port;
        if (!port || port <= 0) return;
        // 如果该端口已经有 server 在运行，先关闭
        if (proxyServerMap.has(port)) {
            console.log(`[HttpProxyServer] 端口 ${port} 已有服务运行，先关闭旧服务`);
            this.httpServerCloseForPort(port);
        }

        const socketSet: Set<net.Socket> = new Set();
        // 需要从响应头中剔除的 hop-by-hop 头，不能原样转发给客户端
        const hopByHopHeaders = [
            'transfer-encoding',
            'connection',
            'keep-alive',
            'proxy-authenticate',
            'proxy-authorization',
            'te',
            'trailer',
            'upgrade',
        ];
        const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
            // 浏览器走 HTTP 代理时，req.url 是完整的绝对 URL（如 http://hsk.xiaohei123.fun:5567/...）
            const fullUrl = req.url;
            const item = this.findProxyRule(fullUrl);
            let targetUrl: URL;
            let headers = {}
            if (item) {
                // 命中规则 → 改写 URL
                const rewrittenUrl = fullUrl.replace(
                    new RegExp(item.rewrite_regexp_source),
                    item.rewrite_target
                );
                targetUrl = new URL(rewrittenUrl);
                headers = {...item.headers};
                if (item.changeOrigin) {
                    headers!['host'] = targetUrl.host;
                }
            } else {
                // 没匹配规则 → 直连
                targetUrl = new URL(fullUrl);
            }
            const options: http.RequestOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || 80,
                path: targetUrl.pathname + targetUrl.search,
                method: req.method,
                headers: {
                    ...req.headers,
                    ...headers,
                },
            };
            // 清理代理特有头
            delete options.headers['proxy-connection'];
            const proxyReq = http.request(
                options,
                proxyRes => {
                    // 过滤 hop-by-hop 头，避免转发给客户端导致行为异常（如 chunked 编码问题导致挂起）
                    const cleanHeaders: Record<string, string | string[]> = {};
                    for (const [key, val] of Object.entries(proxyRes.headers)) {
                        if (!hopByHopHeaders.includes(key.toLowerCase()) && val !== undefined) {
                            cleanHeaders[key] = val;
                        }
                    }
                    res.writeHead(proxyRes.statusCode || 502, cleanHeaders);
                    proxyRes.pipe(res, {end: true});
                }
            );
            proxyReq.on('error', err => {
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                }
                res.end('Proxy error: ' + err.message);
            });
            // 客户端断开时，中止上游请求，避免资源泄漏
            res.on('close', () => {
                if (!proxyReq.destroyed) {
                    proxyReq.destroy();
                }
            });
            req.pipe(proxyReq, {end: true});
        };
        // http 走 requestHandler
        const newServer = http.createServer(requestHandler);
        newServer.on('connection', (socket: net.Socket) => {
            socketSet.add(socket);
            socket.on('close', () => {
                socketSet.delete(socket);
            });
        });
        // ws 走升级 一般不会触发
        // proxyServer.on('upgrade', (req, socket, head) => {
        //     const host = req.headers.host!;
        //     const fullUrl = `http://${host}${req.url}`;
        //     const item = this.findProxyRule(fullUrl);
        //     let targetHost: string;
        //     let targetPort: number;
        //     if (item) {
        //         // 命中代理规则，改写目标地址
        //         const rewritten = fullUrl.replace(
        //             new RegExp(item.rewrite_regexp_source),
        //             item.rewrite_target
        //         );
        //         const rewrittenUrl = new URL(rewritten);
        //         targetHost = rewrittenUrl.hostname;
        //         targetPort = Number(rewrittenUrl.port) || 80;
        //     } else {
        //         const targetUrl = new URL(`http://${host}${req.url}`);
        //         targetHost = targetUrl.hostname;
        //         targetPort = Number(targetUrl.port) || 80;
        //     }
        //     const proxySocket = net.connect(targetPort, targetHost);
        //     proxySocket.on('connect', () => {
        //         // 关键：先发送原始请求行 + 头给目标服务器
        //         const rawRequest =
        //             `${req.method} ${req.url} HTTP/1.1\r\n` +
        //             Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        //             `\r\n\r\n`;
        //         proxySocket.write(rawRequest);
        //         if (head && head.length) proxySocket.write(head);
        //         // 双向管道
        //         proxySocket.pipe(socket);
        //         socket.pipe(proxySocket);
        //     });
        //     const cleanup = () => {
        //         socket.destroy();
        //         proxySocket.destroy();
        //     };
        //     socket.on('error', cleanup);
        //     socket.on('close', cleanup);
        //     proxySocket.on('error', cleanup);
        // });
        // https wss ws（概率） 走connect  处理 HTTPS CONNECT 隧道
        newServer.on('connect', (req, clientSocket, head) => {
            const [targetHost, targetPortStr] = (req.url || '').split(':');
            const targetPort = Number(targetPortStr || 443);
            // 根据端口推断协议：443 大概率是 HTTPS/WSS，80 可能是 WS 走 CONNECT 隧道
            const protocol = targetPort === 80 ? 'http://' : 'https://';
            const fullUrl = `${protocol}${targetHost}:${targetPort}/`;
            const item = this.findProxyRule(fullUrl);
            if (item) {
                if(item.use_https_tunnel && item.https_tunnel_key && item.https_tunnel_port && item.https_tunnel_host) {
                    // 使用了https隧道
                    const opt = {
                        server_host: item.https_tunnel_host,
                        server_port: item.https_tunnel_port,
                        not_reconnect_attempt: true,
                        msg_map: {
                        }
                    }
                    opt.msg_map[NetMsgType.https_tunnel_tcp_data] = (data:Buffer, util:tcp_raw_socket, tag_id?: number)=>{
                        const ok = clientSocket.write(data)
                        if(!ok) {
                            util.get_client().get_socket().pause()
                            clientSocket.once('drain',()=>{
                                util.get_client().get_socket().resume()
                            })
                        }
                    }
                    const client = new tcp_client(opt,async ()=>{
                        try {
                            const socket_id_data = await client.send_data_async(NetMsgType.https_tunnel_tcp_connect,Buffer.from(JSON.stringify(
                                {
                                    key:item.https_tunnel_key,
                                    target_proxy_port:targetPort,
                                    target_proxy_host:targetHost
                                }
                            )))
                            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                            clientSocket.on("data", data => {
                                const ok = client.send_data(NetMsgType.https_tunnel_tcp_data,Buffer.concat([socket_id_data,data]) )
                                if(!ok) {
                                    clientSocket.pause()
                                    client.get_raw_client().get_client().get_socket().once('drain',()=>{
                                        clientSocket.resume()
                                    })
                                }
                            })
                            const cleanup = () => {
                                client.get_raw_client().remove_on_close(cleanup)
                                clientSocket.end();
                                client.close();
                            };
                            clientSocket.on('error', cleanup);
                            client.get_raw_client().on_close(cleanup);
                            client.get_raw_client().get_client().get_socket().on('error', cleanup);
                            clientSocket.on('close', cleanup);
                        } catch (err) {
                            // 连接失败 什么都不做处理
                            clientSocket.end();
                            client.close()
                        }
                    })
                    client.connect().catch(console.error);
                    return;
                }
                //  走上游代理 自己请求建立http隧道
                const rewritten = fullUrl.replace(
                    new RegExp(item.rewrite_regexp_source),
                    item.rewrite_target
                );
                const rewrittenUrl = new URL(rewritten);
                const upstreamHost = rewrittenUrl.hostname;
                const upstreamPort = Number(rewrittenUrl.port) || 443;
                const upstreamSocket = net.connect(upstreamPort, upstreamHost, () => {
                    const connectReq =
                        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                        `Host: ${targetHost}:${targetPort}\r\n` +
                        `Connection: keep-alive\r\n\r\n`;
                    upstreamSocket.write(connectReq);
                    if (head && head.length) upstreamSocket.write(head);
                });
                let buffered = Buffer.alloc(0);
                const onUpstreamData = (chunk: Buffer) => {
                    buffered = Buffer.concat([buffered, chunk]);
                    const str = buffered.toString('utf8', 0, Math.min(buffered.length, 4096));
                    const headerEndIdx = str.indexOf('\r\n\r\n');
                    if (headerEndIdx === -1) return;
                    const headerText = str.slice(0, headerEndIdx);
                    const statusLine = headerText.split('\r\n')[0];
                    const m = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)/);
                    upstreamSocket.removeListener('data', onUpstreamData);
                    if (!m) {
                        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\nInvalid upstream proxy response\r\n');
                        upstreamSocket.destroy();
                        return;
                    }
                    const statusCode = Number(m[1]);
                    const rest = buffered.slice(headerEndIdx + 4);
                    if (statusCode === 200) {
                        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                        if (rest.length) clientSocket.write(rest);
                        upstreamSocket.pipe(clientSocket);
                        clientSocket.pipe(upstreamSocket);
                    } else {
                        clientSocket.end(`HTTP/1.1 ${statusCode} Upstream Proxy Error\r\n\r\n${headerText}\r\n`);
                        upstreamSocket.end();
                    }
                };
                upstreamSocket.on('data', onUpstreamData);
                upstreamSocket.setKeepAlive(true);
                // upstreamSocket.setTimeout(10000, () => {
                //     clientSocket.end('HTTP/1.1 504 Gateway Timeout\r\n\r\nUpstream proxy timeout\r\n');
                //     upstreamSocket.destroy();
                // });
                upstreamSocket.on('error', (err) => {
                    clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\nUpstream socket error: ${err.message}\r\n`);
                });
                const cleanup = () => this.safeDestroy(clientSocket, upstreamSocket);
                clientSocket.on('error', cleanup);
                clientSocket.on('close', cleanup);
                upstreamSocket.on('error', cleanup);
                upstreamSocket.on('close', cleanup);
                return
            }
            // 直接请求 http/https
            const directSocket = net.connect(targetPort, targetHost, () => {
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                if (head && head.length) directSocket.write(head);
                directSocket.pipe(clientSocket);
                clientSocket.pipe(directSocket);
            });
            directSocket.setKeepAlive(true);
            // directSocket.setTimeout(10000, () => {
            //     clientSocket.end('HTTP/1.1 504 Gateway Timeout\r\n\r\nDirect connection timeout\r\n');
            //     directSocket.destroy();
            // });
            directSocket.on('error', (err) => {
                clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\nDirect socket error: ${err.message}\r\n`);
            });
            const cleanup = () => this.safeDestroy(clientSocket, directSocket);
            directSocket.on('error', cleanup);
            directSocket.on('timeout', cleanup);
            directSocket.on('close', cleanup);
            clientSocket.on('error', cleanup);
            clientSocket.on('close', cleanup);
        });
        newServer.listen(port, () => {
            console.log(`[HttpProxyServer] HTTP 代理服务器已启动，端口: ${port}`);
        });

        proxyServerMap.set(port, { server: newServer, socketSet });
    }

    /**
     * 关闭指定端口的代理服务器
     */
    private httpServerCloseForPort(port: number) {
        const entry = proxyServerMap.get(port);
        if (!entry) return;
        const { server, socketSet } = entry;
        proxyServerMap.delete(port);
        // 强制销毁所有连接
        for (const socket of socketSet) {
            if (!socket.destroyed) {
                socket.destroy();
            }
        }
        socketSet.clear();
        server.close(() => {
            console.log(`[HttpProxyServer] 端口 ${port} 代理服务器已关闭`);
        });
        server.closeAllConnections?.();
        server.closeIdleConnections?.();
    }

    /**
     * 关闭所有代理服务器
     */
    private stopAllProxyServers() {
        for (const port of proxyServerMap.keys()) {
            this.httpServerCloseForPort(port);
        }
    }

    safeDestroy(...sockets: (net.Socket | Duplex | undefined)[]) {
        sockets.forEach(s => {
            if (s && !s.destroyed) {
                s.destroy();
            }
        });
    };

    /**
     * 关闭所有 HTTP 代理服务（对外接口）
     */
    public httpServerProxyClose(): Promise<void> {
        this.stopAllProxyServers();
        return Promise.resolve();
    }

    /**
     * 保存 HTTP 代理服务器配置并重启所有服务
     */
    public async saveHttpServer(req: HttpServerProxy) {
        DataUtil.set(data_common_key.http_server_key, req);
        // 关闭所有现有服务
        this.stopAllProxyServers();
        // 重新加载规则
        this.load_server_proxy();
        // 启动所有启用的端口实例
        this.httpServerStart(req);
    }

    /**
     * 启动所有已启用的端口实例
     */
    httpServerStart(data: HttpServerProxy) {
        for (const instance of data.list ?? []) {
            if (instance.open && instance.port > 0) {
                this.httpServerStartForInstance(instance);
            }
        }
    }

    /**
     * 获取 HTTP 代理服务器配置，兼容旧格式
     */
    public getHttpServerProxy(): HttpServerProxy {
        const raw: any = DataUtil.get(data_common_key.http_server_key);
        // 兼容旧格式（单端口结构），在内存中做兼容处理
        if (raw && (typeof raw.port !== 'undefined' || typeof raw.open !== 'undefined')) {
            const instance: HttpProxyServerInstance = {
                open: raw.open ?? false,
                port: raw.port ?? 0,
                note: "",
                list: raw.list ?? [],
            };
            return { list: [instance] };
        }
        // 新格式
        return raw ?? { list: [] };
    }


}

export const netService: NetService = new NetService();

ServerEvent.on("start", async (data) => {
    try {
        const req = netService.getHttpServerProxy();
        // 检查是否有启用的端口实例
        const hasOpenInstance = req.list?.some(instance => instance.open && instance.port > 0);
        if (hasOpenInstance) {
            netService.load_server_proxy();
            netService.httpServerStart(req);
        }
    } catch (e) {
        console.error('启动 Http Proxy Server 失败', e);
    }
})
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
