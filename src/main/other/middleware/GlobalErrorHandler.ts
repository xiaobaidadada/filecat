// 自定义全局异常处理中间件
import {
    ExpressErrorMiddlewareInterface,
    ExpressMiddlewareInterface,
    KoaMiddlewareInterface,
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
        console.error("全局异常拦截", error);
        // next不再执行
        response.status(200).send(Fail(""));
        return;
    }
}