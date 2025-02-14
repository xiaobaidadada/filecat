import {Middleware, KoaMiddlewareInterface, UnauthorizedError, ExpressMiddlewareInterface} from 'routing-controllers';
import {Cache} from "../cache";
import {Container, Inject} from "typedi";
import {AuthFail, Fail} from "../Result";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {FileServiceImpl} from "../../domain/file/file.service";
import {DataUtil} from "../../domain/data/DataUtil";
import {settingService} from "../../domain/setting/setting.service";
import {sshService} from "../../domain/ssh/ssh.service";
import {Request, Response} from 'express';

const pathRegex = /^(?!.*\/api).*$/;

@Middleware({type: 'before'})
export class AuthMiddleware implements ExpressMiddlewareInterface {



    async use(req: Request, res: Response, next: (err?: any) => Promise<any>): Promise<any> {
        // 下载拦截
        if (req.originalUrl.startsWith("/api/download")) {
            const token:string = req.query['token'] as string;
            if (!await settingService.check(token)) {
                res.send(JSON.stringify(AuthFail('失败')));
                return
            }
            FileServiceImpl.download(req);
            return ;
        }
        // 校验可以用params
        if (req.originalUrl.startsWith("/api/ssh/download")) {
            const token:string = req.query['token'] as string;
            if (!await settingService.check(token)) {
                res.send(JSON.stringify(AuthFail('失败')));
                return
            }
            sshService.download(req);
            return ;
        }
        //  自定义路由拦截
        if (await settingService.intercept(req)) {
            return ;
        }
        if (req.originalUrl.indexOf('/api/user/login') !==-1  ||  pathRegex.test(req.originalUrl) ) {
            // 过滤 非api直接放行
             next();
            return;
        }
        // 从请求头或者其他地方获取登录凭证，这里以简单示例为例
        const token = req.headers.authorization;
        if (await settingService.check(token)) {
             next();
            return
        }
        // 如果没有登录凭证，返回未授权错误
        res.send(JSON.stringify(AuthFail('失败')));
        return;
    }



    // @msg(CmdType.auth)
    // async auth(wsData:WsData<any>){
    //     // todo 暂时不严格处理
    //     if (await settingService.check(wsData.context.Authorization)) {
    //         (wsData.wss as Wss).status = 1;
    //     }
    // }
}
