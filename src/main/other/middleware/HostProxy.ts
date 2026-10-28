import {Request, Response, NextFunction} from "express";
import HttpProxy from "http-proxy";
import {settingService} from "../../domain/setting/setting.service";

/**
 * 域名转发代理：类似 nginx 的 server/location，按 Host + 路径前缀把请求转发到目标服务。
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

/**
 * 创建域名转发中间件。
 * 命中规则就转发并中止后续处理；未命中直接 next()，交给 filecat 自己的路由。
 */
export const use_host_proxy_middleware = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const rule = settingService.match_proxy_rule(req.headers.host, req.originalUrl);
        if (!rule) {
            next();
            return;
        }

        // 带 path 的规则：转发前把前缀去掉，目标服务不必感知外层前缀。
        // http-proxy 在 ignorePath=false 时会自己拼 target + req.url，
        // 所以这里直接改 req.url，转发完（proxyRes / error）再还原回去，
        // 避免影响后续中间件看到原始地址。
        const origin_url = req.url;
        if (rule.pre_path) {
            let next_url = origin_url.slice(rule.pre_path.length) || "/";
            if (!next_url.startsWith("/")) next_url = "/" + next_url;
            req.url = next_url;
        }

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
    // 规则显式关闭了 websocket 就不接管，避免把不该转的升级请求送过去
    if (rule.websocket === false) return false;

    if (rule.pre_path) {
        let next_url = (request.url ?? "/").slice(rule.pre_path.length) || "/";
        if (!next_url.startsWith("/")) next_url = "/" + next_url;
        request.url = next_url;
    }

    proxy.ws(request, socket, head, {target: rule.target});
    return true;
};
