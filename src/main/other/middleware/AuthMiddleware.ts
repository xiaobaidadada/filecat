import {ExpressMiddlewareInterface, Middleware} from 'routing-controllers';
import {AuthFail} from "../Result";
import {FileServiceImpl} from "../../domain/file/file.service";
import {settingService} from "../../domain/setting/setting.service";
import {sshService} from "../../domain/ssh/ssh.service";
import {Request, Response} from 'express';
import {get_sys_base_url_pre} from "../../domain/bin/bin";
import {public_list} from "./decorator";

// const pathRegex = /^(?!.*\/api).*$/;
// const pathRegex = new RegExp(`^(?!(\/${get_sys_base_url_pre()}))`);

// const base_pre = get_sys_base_url_pre();


@Middleware({type: 'before'})
export class AuthMiddleware implements ExpressMiddlewareInterface {

     download_start_pre = get_sys_base_url_pre()+"/download";
    share_download_start_pre = get_sys_base_url_pre()+"/share_download";
     ssh_download_start_pre = get_sys_base_url_pre()+"/ssh/download";
     login_start_pre = get_sys_base_url_pre()+"/user/login";

    async use(req: Request, res: Response, next: (err?: any) => Promise<any>): Promise<any> {
        // 先对public方法路由判断
        if(public_list.length) {
            for (let i = 0; i < public_list.length; i++) {
                if(req.originalUrl.startsWith(public_list[i])) {
                    next()
                    return ;
                }
            }
        }
        // 下载拦截
        if(req.originalUrl.startsWith(this.share_download_start_pre)) {
            FileServiceImpl.download_for_public(req);
            return ;
        }
        if (req.originalUrl.startsWith(this.download_start_pre)) {
            const token:string = req.query['token'] as string;
            if (!await settingService.check(token)) {
                res.send(JSON.stringify(AuthFail('失败')));
                return
            }
            FileServiceImpl.download_for_private(req);
            return ;
        }
        // 校验可以用params
        if (req.originalUrl.startsWith(this.ssh_download_start_pre)) {
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
        if (req.originalUrl.indexOf(this.login_start_pre) !==-1
            // || !req.originalUrl.startsWith(base_pre) // 根本不会匹配除了 /api其它的 框架设置了前缀
            // pathRegex.test(req.originalUrl)
        ) {
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
