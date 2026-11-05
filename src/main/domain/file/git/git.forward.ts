import {NextFunction, Request, Response} from "express";
import express from "express";
import path from "path";
import {mountService} from "../../mount/mount.service";
import {settingService} from "../../setting/setting.service";

/**
 * Git 接口的「转发到对端」拦截。
 *
 * 转发能力放在驱动里（tcp_proxy_driver.git_request），这里只做两件事：
 *  1. 把请求体里的相对路径解析成本地绝对路径，判断落在哪个挂载里；
 *  2. 挂载的驱动实现了 git_request，就交给它执行并原样返回结果。
 *
 * 这样和文件操作走同一套「驱动决定怎么做」的思路，
 * 本地目录挂载、其它网盘的能力差异也都在驱动层表达，这里不用 instanceof 判断具体类型。
 *
 * 这个中间件挂在 routing-controllers 之前（它才会装 body 解析器），
 * 所以这里自带一个 JSON 解析，已解析过就直接用。
 */
const json_parser = express.json({limit: "10mb"});

function parse_body(req: Request): Promise<any> {
    if (req.body && typeof req.body === "object") {
        return Promise.resolve(req.body);
    }
    return new Promise((resolve) => {
        json_parser(req, {} as Response, () => resolve(req.body));
    });
}

export async function git_forward_middleware(req: Request, res: Response, next: NextFunction) {
    const body = await parse_body(req);
    const req_path = body && typeof body.path === "string" ? body.path : "";
    if (!req_path) {
        return next();
    }
    const root = settingService.getFileRootPath(req.headers.authorization as string);
    if (!root) {
        return next();
    }
    const match = mountService.resolve(path.resolve(root, decodeURIComponent(req_path)));
    if (!match) {
        return next();
    }
    const driver = mountService.driver_of(match.mount);
    if (!driver.git_request) {
        return next();
    }
    // req.path 已被 express 去掉挂载前缀，剩下的就是接口名，如 log / status
    const route = req.path.split("/").filter(Boolean).join("/");
    try {
        res.json(await driver.git_request(match.inner_path, route, body));
    } catch (e: any) {
        res.json({code: 1, message: e?.message ?? String(e)});
    }
}
