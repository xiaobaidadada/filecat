import 'reflect-metadata';
import {createExpressServer} from 'routing-controllers';
// import {config} from "./other/config";
// import dotenv from "dotenv";
import {WsServer} from "../common/frame/ws.server";
import {UserController} from "./domain/user/user.controller";
import {SysController} from "./domain/sys/sys.controller";
import {ShellController} from "./domain/shell/shell.controller";
import {FileController} from "./domain/file/file.controller";
import {AuthMiddleware} from "./other/middleware/AuthMiddleware";
import {GlobalErrorHandler} from "./other/middleware/GlobalErrorHandler";
// import {CheckTokenMiddleware} from "./other/middleware/redirect";
import path from "path";
import fs from "fs";
import {DdnsController} from "./domain/ddns/ddns.controller";
import {NetController} from "./domain/net/net.controller";
// import proxy from 'koa-proxies';
import {NavindexController} from "./domain/navindex/navindex.controller";
import {Env} from "../common/Env";
import {SettingController} from "./domain/setting/setting.controller";
import {SSHController} from "./domain/ssh/ssh.controller";
import {RdpController} from "./domain/rdp/rdp.controller";
import {ServerEvent} from "./other/config";
import {VideoController} from "./domain/video/video.controller";
import {routerConfig} from "../common/RouterConfig";
import {getWebFirstKey} from "../common/StringUtil";
import {CryptoController} from "./domain/crypto/crypto.controller";
import {Request, Response} from 'express';
import {DataUtil} from "./domain/data/DataUtil";
import {userService} from "./domain/user/user.service";
import {shellServiceImpl} from "./domain/shell/shell.service";
import {FileUtil} from "./domain/file/FileUtil";
import {settingService} from "./domain/setting/setting.service";
import mime from "mime-types";
import {get_base, get_sys_base_url_pre} from "./domain/bin/bin";
import {VirtualController} from "./domain/net/virtual/virtual.controller";
import {Ai_AgentController} from "./domain/ai_agent/ai_agent.controller";
const http = require('http');
const https = require('https');
const Mustache = require('mustache');

const WebSocket = require('ws');
const compression = require('compression'); // webpack-dev-server 包含的有


async function start() {

    await Env.parseArgs();
    DataUtil.handle_history_data();
    await userService.root_init();
    shellServiceImpl.path_init();

    // 创建 Koa 应用并注册控制器
    const app = createExpressServer({
        cors: false,
        routePrefix: get_sys_base_url_pre(),
        classTransformer: true,
        controllers: [
            UserController, SysController, ShellController,
            FileController, DdnsController, NetController,
            VirtualController,NavindexController, SettingController,
            SSHController, RdpController, VideoController,
            CryptoController,Ai_AgentController
        ],
        middlewares: [AuthMiddleware, GlobalErrorHandler],
        defaultErrorHandler: false, // 有自己的错误处理程序再禁用默认错误处理
    });
    app.use(compression());


    //  todo 目前  还不能用，ws也需要代理
    // const proxyConfigList  = [
    //     {
    //         url_regexp: 'abc\\.qq\\.fun', // 正则转义：. 需要写成 \\.
    //         rewrite_regexp_source: '', // 不配置路径重写
    //         rewrite_target: '',
    //         headers: {
    //             'X-Proxy-Source': 'Express-Server', // 自定义转发标识头
    //             'Connection': 'keep-alive'
    //         },
    //         target_hostname:"179.116.1.1",
    //         target_port:80
    //     }
    // ];

    // app.use((req, res, next) => {
    //     const matchedConfig = proxyConfigList.find((config) => {
    //         if (!config.url_regexp) return false;
    //
    //         const urlRegex = new RegExp(config.url_regexp);
    //         const requestFullAddress = `${req.headers.host}${req.originalUrl}`;
    //
    //         return urlRegex.test(requestFullAddress);
    //     });
    //
    //     if (!matchedConfig) {
    //         return next();
    //     }
    //
    //     let targetPath = req.originalUrl;
    //     const { rewrite_regexp_source, rewrite_target,target_hostname,target_port } = matchedConfig;
    //     if(!target_hostname || !target_port) return next();
    //     if (rewrite_regexp_source && rewrite_target !== undefined) {
    //         const rewriteRegex = new RegExp(rewrite_regexp_source);
    //         targetPath = targetPath.replace(rewriteRegex, rewrite_target);
    //     }
    //
    //     const targetConfig = {
    //         hostname: target_hostname,
    //         port: target_port,
    //         path: targetPath,
    //         method: req.method,
    //         headers: { ...req.headers, ...matchedConfig.headers },
    //     };
    //
    //     const client = targetConfig.port === 443 ? https : http;
    //
    //     const proxyReq = client.request(targetConfig, (proxyRes) => {
    //         res.writeHead(proxyRes.statusCode, proxyRes.headers);
    //         proxyRes.pipe(res, { end: true });
    //     });
    //
    //     proxyReq.on('error', (err) => {
    //         console.error(`转发请求失败（匹配配置：${JSON.stringify(matchedConfig)}）：`, err);
    //         if (!res.headersSent) {
    //             res.status(500).send('faile');
    //         } else {
    //             res.end();
    //         }
    //     });
    //
    //     req.pipe(proxyReq, { end: true });
    // });

    const wss = new WebSocket.Server({noServer: true});
    (new WsServer(wss)).start(settingService.check.bind(settingService));

    if (process.env.NODE_ENV === "production") {
        const router = new Set();
        for (const item of Object.values(routerConfig)) {
            router.add(`/${item}`)
            router.add(`${item}`)
        }
        router.add(get_base()); // base_url

        let index_text = await settingService.get_index_html();
        ServerEvent.on("sys_env_update", async (data) => {
            index_text = await settingService.get_index_html();
        })

        const sys_pre = get_sys_base_url_pre();
        app.use(async (req: Request, res: Response, next) => {
            if (req.originalUrl && (req.originalUrl.startsWith(sys_pre))) {
                next();
                return;
            }
            try {
                if (router.has(req.originalUrl) || router.has(getWebFirstKey(req.originalUrl))) {
                    throw "";
                }
                let url;
                if (req.originalUrl.includes("excalidraw-assets")) {
                    req.originalUrl = req.originalUrl.slice(1); // 删去/
                    url = path.join(__dirname, 'dist', req.originalUrl);
                } else {
                    url = path.join(__dirname, 'dist', path.basename(req.originalUrl));
                }
                if (!await FileUtil.access(url)) {
                    throw "";
                }

                // fs.accessSync(url, fs.constants.F_OK);
                const readStream = fs.createReadStream(url);
                res.type(mime.lookup(url));
                if (url.endsWith('.js') || url.endsWith(".woff2")) {
                    res.setHeader('Cache-Control', 'public, max-age=86400 '); // 让js类型的数据缓存一下 有一些类库的资源请求 js 除非版本变了否则不会更改 webpack打包的有版本hash会变名字
                }
                readStream.pipe(res);
            } catch (e) {
                res.type('text/html').send(index_text);
                // fs.createReadStream(path.join(__dirname, 'dist', "index.html")).pipe(res);
            }
        });
    } else {

        const {createProxyMiddleware} = require('http-proxy-middleware');
        // 使用正则表达式匹配路径并代理
        // const self_pre = settingService.get_customer_api_pre_key();
        const sys_pre = get_sys_base_url_pre();
        // const regex = new RegExp(`^(?!(\/${sys_pre}|${self_pre}))`);
        const regex = new RegExp(`^(?!(\/${sys_pre}))`);
        app.use(regex, createProxyMiddleware({
            target: `http://127.0.0.1:${process.env.webpack_port ?? "3301"}`, // 代理目标
            // changeOrigin: true,
            pathRewrite: (path, req) => {
                if (path.endsWith(".md")) {
                    return "/"; // md 特殊文件
                }
                const dot_index = path.indexOf('.')
                if (dot_index !== -1 && dot_index > 0 && path[dot_index - 1] !== '/') {
                    const paths = path.split('/') // 带后缀的静态文件
                    return '/' + paths[paths.length - 1]
                } else {
                    return '/'; // 其它所有的非文件类型
                }
            }
        }));
    }

    // 启动服务器
    const server = app.listen(Env.port, () => {
        const url = `http://localhost:${Env.port}/`;
        console.log(`\x1b[31m服务器正在运行 click\x1b[0m  \x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`);
    });

    // 将WebSocket服务器与Koa服务器绑定到同一个端口
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    ServerEvent.emit("start");

    process.on('uncaughtException', (err) => {
        console.error('未捕获的异常:', err);
    });
}

start();


const log = console.log.bind(console);
console.log = (...args) => {
    log((new Date()).toLocaleString(),...args);
}
