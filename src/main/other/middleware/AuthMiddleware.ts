import {Middleware, KoaMiddlewareInterface, UnauthorizedError} from 'routing-controllers';
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

const pathRegex = /^(?!.*\/api).*$/;

@Middleware({type: 'before'})
export class AuthMiddleware implements KoaMiddlewareInterface {



    async use(ctx: any, next: (err?: any) => Promise<any>): Promise<any> {
        // 下载拦截
        if (ctx.url.startsWith("/download")) {
            FileServiceImpl.download(ctx);
            return ;
        }
        // 校验可以用params
        if (ctx.url.startsWith("/ssh/download")) {
            sshService.download(ctx);
            return ;
        }
        //  自定义路由拦截
        if (await settingService.intercept(ctx)) {
            return ;
        }
        if (ctx.url.indexOf('/api/user/login') !==-1  ||  pathRegex.test(ctx.url) ) {
            // 过滤 非api直接放行
            return next();
        }
        // 从请求头或者其他地方获取登录凭证，这里以简单示例为例
        const token = ctx.headers.authorization;
        if (await settingService.check(token)) {
            return next();
        }

        // 如果验证通过，将用户信息存储到上下文中，以便后续处理 todo
        // ctx.user = { id: 1, username: 'user' }; // 这里假设用户信息是 { id, username }
        // 如果没有登录凭证，返回未授权错误
        ctx.body = AuthFail('失败');
    }



    @msg(CmdType.auth)
    async auth(wsData:WsData<any>){
        // todo 暂时不严格处理
        if (await settingService.check(wsData.context.Authorization)) {
            (wsData.wss as Wss).status = 1;
        }
    }
}
