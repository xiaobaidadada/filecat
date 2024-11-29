import 'reflect-metadata';
import {createExpressServer, createKoaServer} from 'routing-controllers';
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

const WebSocket = require('ws');


async function start() {

    await Env.parseArgs();
    // console.log(process.pid);
// 环境变量加载
// dotenv.config({ override: true });
// Object.keys(config).forEach(key => {
//     const value = process.env[key];
//     if (value) {
//         config[key] = value;
//     }
// })

    // 创建 Koa 应用并注册控制器
    const app = createExpressServer({
        cors: false,
        routePrefix: '/api',
        classTransformer: true,
        // controllers: [`${__dirname}/domain/**/*.*s`],
        controllers:[
            UserController, SysController, ShellController, FileController, DdnsController, NetController,
            NavindexController, SettingController, SSHController, RdpController, VideoController, CryptoController
        ],
        // controllers: [UserController, SysController, ShellController, FileController, DdnsController, NetController,
        // NavindexController, SettingController, SSHController, RdpController, VideoController, CryptoController],
        // middlewares: [`${__dirname}/other/middleware/**/*.*s`],
        middlewares: [AuthMiddleware, GlobalErrorHandler],
        defaultErrorHandler: false, // 有自己的错误处理程序再禁用默认错误处理
    });
    const wss = new WebSocket.Server({noServer: true});
    (new WsServer(wss)).start();

    if (process.env.NODE_ENV === "production") {
        const router = new Set();
        for (const item of Object.values(routerConfig)) {
            router.add(`/${item}`)
            router.add(`${item}`)
        }
        // 配置静态资源代理
        // app.use(koa_static(path.join(__dirname,'dist')), { index: true });
        // // // 当任何其他路由都不匹配时，返回单页应用程序的HTML文件
        app.use(async (req: Request, res: Response, next) => {
            if (req.originalUrl && req.originalUrl.includes("/api/")) {
                next();
                return;
            }
            try {
                if (router.has(getWebFirstKey(req.originalUrl))) {
                    throw "";
                }
                let url;
                if (req.originalUrl.includes("excalidraw-assets")) {
                    req.originalUrl = req.originalUrl.slice(1); // 删去/
                    url = path.join(__dirname, 'dist', req.originalUrl);
                } else {
                    url = path.join(__dirname, 'dist', path.basename(req.originalUrl));
                }
                fs.accessSync(url, fs.constants.F_OK,)
                const readStream = fs.createReadStream(url);
                readStream.pipe(res);
            } catch (e) {
                res.type('html');
                fs.createReadStream(path.join(__dirname, 'dist', "index.html")).pipe(res);
            }
        });
    } else {
        const {createProxyMiddleware} = require('http-proxy-middleware');
        // 使用正则表达式匹配路径并代理
        app.use(/^(?!\/api)/, createProxyMiddleware({
            target: `http://127.0.0.1:${process.env.webpack_port ?? "3301"}`, // 代理目标
            // changeOrigin: true,
            pathRewrite: (path, req) => {
                if (path.endsWith(".md")) {
                    return "/"; // md 特殊文件
                } else if (path.indexOf('.') !== -1) {
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

