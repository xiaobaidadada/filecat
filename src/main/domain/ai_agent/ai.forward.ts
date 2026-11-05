import {NextFunction, Request, Response} from "express";
import express from "express";
import path from "path";
import {mountService} from "../mount/mount.service";
import {settingService} from "../setting/setting.service";

/**
 * AI 聊天接口的「转发到对端」拦截。
 *
 * AI 的接口参数里没有目录路径（只有 session_id 之类），无法像 git 那样从 body
 * 判断该发给谁，所以由前端把当前所在目录放进 dir_path 请求头。
 * 这里只做两件事：
 *  1. 把 dir_path 解析成本地绝对路径，判断它落在哪个挂载里；
 *  2. 挂载的驱动实现了 ai_request，就交给它执行并原样返回结果。
 *
 * 语义与 git 转发一致：能力差异都在驱动层表达，这里不判断具体驱动类型。
 *
 * 这个中间件挂在 routing-controllers 之前（它才会装 body 解析器），
 * 所以这里自带一个 JSON 解析，已解析过就直接用。
 */
const json_parser = express.json({limit: "50mb"});

function parse_body(req: Request): Promise<any> {
    if (req.body && typeof req.body === "object") {
        return Promise.resolve(req.body);
    }
    return new Promise((resolve) => {
        json_parser(req, {} as Response, () => resolve(req.body));
    });
}

export async function ai_forward_middleware(req: Request, res: Response, next: NextFunction) {
    const dir_path = req.headers.dir_path;
    if (!dir_path || typeof dir_path !== "string") {
        return next();
    }
    const root = settingService.getFileRootPath(req.headers.authorization as string);
    if (!root) {
        return next();
    }
    const sys_path = path.resolve(root, decodeURIComponent(dir_path));
    const match = mountService.resolve(sys_path);
    if (!match) {
        return next();
    }
    // 只有显式开启「转发到对端」的挂载才把请求交给对端，否则按本机处理
    if (!match.mount.forward_to_remote) {
        return next();
    }
    const driver = mountService.driver_of(match.mount);
    if (!driver.ai_request) {
        return next();
    }
    // req.path 已被 express 去掉挂载前缀，剩下的就是接口名，如 session / audio/speech
    const route = req.path.split("/").filter(Boolean).join("/");
    const body = await parse_body(req);
    try {
        const rsp = await driver.ai_request(route, req.method, body, match.base_path, sys_path);
        // 音频等二进制响应原样回传，前端按字节读取；其余接口本来就是 JSON 结果体
        if (rsp.content_type.includes("application/json")) {
            return res.json(JSON.parse(rsp.body.toString("utf8")));
        }
        res.setHeader("Content-Type", rsp.content_type || "application/octet-stream");
        // 音频合成会用这个头回传新建的会话 id，前端要读
        if (rsp.session_id) {
            res.setHeader("X-Session-Id", rsp.session_id);
        }
        res.send(rsp.body);
    } catch (e: any) {
        res.json({code: 1, message: e?.message ?? String(e)});
    }
}
