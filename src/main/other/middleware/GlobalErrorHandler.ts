

// 自定义全局异常处理中间件
import {KoaMiddlewareInterface, Middleware} from "routing-controllers";
import {Fail} from "../Result";

@Middleware({ type: "after" })
export class GlobalErrorHandler implements KoaMiddlewareInterface {
    async use(ctx: any, next: (err?: any) => Promise<any>) {
        try {
            await next();
        } catch (error) {
            // next不再执行
            ctx.body = JSON.stringify(Fail(JSON.stringify(error)));
        }
    }
}