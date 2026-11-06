import {Request, Response, NextFunction} from "express";
import HttpProxy from "http-proxy";
import express from "express";
import {settingService} from "../../domain/setting/setting.service";

/**
 * 域名转发代理：类似 nginx 的 server/location，按 Host + 路径前缀把请求转发到目标服务，
 * 或者把本地目录当成该域名的 web 根。
 *
 * 单独创建一个 http-proxy 实例，不复用 FilecatProxy 里那个：
 * 那个实例绑定的是内网穿透通道，且用 once 挂事件，多个请求之间会互相干扰。
 */
const proxy = HttpProxy.createProxyServer({
    changeOrigin: true,
    // 改成目标服务的 host，避免目标服务按 Host 做校验时拒绝
    followRedirects: false,
    // 透传客户端真实地址
    xfwd: true,
});

// 代理本身出错时不能抛到进程上，回一个 502
proxy.on("error", (err, req, res: any) => {
    console.error("[host_proxy] 转发失败:", err?.message ?? err);
    if (!res) return;
    if (typeof res.writeHead === "function" && !res.headersSent) {
        res.writeHead(502, {"Content-Type": "text/plain; charset=utf-8"});
        res.end("Bad Gateway");
    } else if (typeof res.end === "function") {
        res.end();
    }
});

// 静态目录按 root 缓存 express.static 中间件，避免每个请求都重建
const static_handler_cache = new Map<string, any>();

const get_static_handler = (root_path: string) => {
    let handler = static_handler_cache.get(root_path);
    if (!handler) {
        handler = express.static(root_path, {index: "index.html"});
        static_handler_cache.set(root_path, handler);
    }
    return handler;
};

/**
 * 按 rewrite / path 把请求路径改写掉，返回改写后的路径。
 * 配了 rewrite 就做前缀替换，没配就剥掉 path 前缀，目标服务不必感知外层前缀。
 */
const rewrite_path = (url: string, rule: {path?: string, rewrite?: string}) => {
    if (!rule.path) return url;
    const [pathname, search] = url.split("?");
    const rest = pathname.slice(rule.path.length);
    // 前缀替换：/v1/user -> /api/user；没配 rewrite 时 rest 就是 /user
    const next_path = rule.rewrite === undefined ? rest : rule.rewrite + rest;
    const final_path = next_path === "" ? "/" : next_path;
    return search === undefined ? final_path : final_path + "?" + search;
};

/**
 * 创建域名转发中间件。
 * 命中规则就处理并中止后续处理；未命中直接 next()，交给 filecat 自己的路由。
 */
export const use_host_proxy_middleware = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const rule = settingService.match_proxy_rule(req.headers.host, req.originalUrl);
        if (!rule) {
            next();
            return;
        }

        if (rule.root) {
            // 静态目录：同样要先把路径前缀处理掉，再交给 express.static 去找文件
            const origin_url = req.url;
            req.url = rewrite_path(origin_url, rule);
            get_static_handler(rule.root)(req, res, (err: any) => {
                req.url = origin_url;
                if (err) {
                    next(err);
                } else {
                    next();
                }
            });
            return;
        }

        // http-proxy 在 ignorePath=false 时会自己拼 target + req.url，
        // 所以这里直接改 req.url，转发完（proxyRes / error）再还原回去，
        // 避免影响后续中间件看到原始地址。
        const origin_url = req.url;
        req.url = rewrite_path(origin_url, rule);

        const restore = () => {
            req.url = origin_url;
        };
        res.once("finish", restore);
        res.once("close", restore);

        proxy.web(req, res, {target: rule.target});
    };
};

/**
 * 处理 WebSocket 升级请求的域名转发。
 * 返回 true 表示已接管（命中规则），调用方不要再走 filecat 自己的 ws 逻辑。
 * 未命中返回 false，继续原有流程。
 */
export const handle_host_proxy_upgrade = (request: any, socket: any, head: any): boolean => {
    const rule = settingService.match_proxy_rule(request.headers.host, request.url);
    if (!rule) return false;
    // 静态目录规则没有上游服务可转，WS 不接管
    if (rule.root) return false;
    // 规则显式关闭了 websocket 就不接管，避免把不该转的升级请求送过去
    if (rule.websocket === false) return false;

    request.url = rewrite_path(request.url, rule);

    proxy.ws(request, socket, head, {target: rule.target});
    return true;
};
