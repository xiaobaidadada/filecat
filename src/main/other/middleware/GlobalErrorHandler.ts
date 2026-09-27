// 自定义全局异常处理中间件
import {
    ExpressErrorMiddlewareInterface,
    Middleware
} from "routing-controllers";
import {Fail} from "../Result";
import {Request, Response} from 'express';

@Middleware({type: "after"})
export class GlobalErrorHandler implements ExpressErrorMiddlewareInterface  {
    // async use(req: Request, res: Response, next: (err?: any) => Promise<any>) {
    //     try {
    //         await next();
    //     } catch (error) {
    //         console.log("全局异常拦截", error);
    //         // next不再执行
    //         res.send(JSON.stringify(Fail(JSON.stringify(error))));
    //         return;
    //     }
    // }
    error(error: any, request: any, response: Response, next: (err: any) => any) {
        // 某些场景（文件上传、流式下载、代理转发、客户端中途断开）响应头已经发出去了，
        // 此时再调用 send/json 会抛 ERR_HTTP_HEADERS_SENT，导致错误处理器自身报错。
        // 这种情况只记录日志，把错误交还给 express 默认处理，不再二次响应。
        if (response.headersSent) {
            console.error("全局异常拦截（响应已发出，不再重复响应）", error);
            return next(error);
        }
        console.error("全局异常拦截", error);
        // next不再执行
        let message:string;
        if(typeof error === "string"){
            message = error;
        } else {
           try {
               if(error?.message){
                   message = error.message;
               } else {
                   message = JSON.stringify(error);
               }
           } catch(err) {
               console.log(error)
               message = 'server error'
           }
        }
        response.status(200).send(Fail(message));
        return;
    }
}