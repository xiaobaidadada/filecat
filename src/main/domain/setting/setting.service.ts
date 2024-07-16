import {DataUtil} from "../data/DataUtil";
import path from "path";
import fs from "fs";
import {CustomerApiRouterPojo, self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {Cache} from "../../other/cache";
import {AuthFail, Sucess} from "../../other/Result";
const needle = require('needle');

const customer_router_key = "customer_router_key";

const customer_api_router_key = "customer_api_router_key";



export class SettingService {

    getCustomerRouter() {
        const list = DataUtil.get(customer_router_key);
        return list ?? [];
    }

    setCustomerRouter(req: any) {
        DataUtil.set(customer_router_key, req);
    }

    public async intercept(ctx: any) {
        let c_url = ctx.url;
        if (ctx.url.includes("?")) {
            c_url = ctx.url.split("?")[0];
        }
        const list_router = DataUtil.get<[][]>(customer_router_key);
        if (!!list_router && list_router.length>0 ) {
            for (let item of list_router) {
                // @ts-ignore
                const router = item[0];
                if (router === c_url) {
                    // @ts-ignore
                    const location = item[1];
                    if (location) {
                        if ((location as string).startsWith("http")) {
                            const response = await needle('get', location, ctx.headers);
                            for (let key in response.headers) {
                                ctx.set(key, response.headers[key]);
                            }
                            ctx.body = response.body;
                            ctx.status = response.statusCode;
                        } else {
                            const url = path.join(location);
                            if ((location as string).includes(".htm")) {
                                ctx.type = 'html';
                            }
                            fs.accessSync(url, fs.constants.F_OK,)
                            ctx.body = fs.createReadStream(url);
                        }
                        return true;
                    }
                }
            }
        }
        const list_api_router = DataUtil.get<CustomerApiRouterPojo[]>(customer_api_router_key);
        if (!!list_api_router && list_api_router.length>0 ) {
            for (let item of list_api_router) {
                if (item.router === c_url) {
                    if (item.needAuth) {
                        const token = ctx.headers.authorization;
                        if (!await this.check(token)) {
                            ctx.body = AuthFail('失败');
                            return true;
                        }
                    }
                    try {
                        const instance = this.getHandlerClass(item.router);
                        // 监听 'data' 事件以接收数据块
                        let data = '';
                        ctx.req.on('data', (chunk) => {
                            data += chunk;
                        });

                        // 等待 'end' 事件完成
                        await new Promise((resolve) => {
                            ctx.req.on('end', resolve);
                        });
                        ctx.body = await instance.handler(ctx.headers,data,ctx);
                    } catch (e) {
                        ctx.body = Sucess(e.toString());
                    }
                    return true;
                }
            }
        }

        // 拦截失败
        return false;
    }

    public getHandlerClass(key){
        const jscode = DataUtil.getFile(this.routerHandler(key));
        if (!jscode) {
            return  {};
        }
        const ApiClass = eval(`(() => { ${jscode}; return Api; })()`);
        const instance = new ApiClass();
        return instance;
    }

    getCustomerApiRouter() {
        const list = DataUtil.get(customer_api_router_key);
        return list ?? [];
    }

    setCustomerApiRouter(req: any) {
        DataUtil.set(customer_api_router_key, req);
    }

    public async check(token:string) {
        if (this.getSelfAuthOpen()) {
            const selfHandler = this.getHandlerClass(self_auth_jscode);
            if (!selfHandler) {
                return false;
            }
            // 开启了自定义处理
            const result = await selfHandler.handler(token);
            if (result) {
                return true;
            }
        }
        // return true;
        if (Cache.check(token)) {
            Cache.updateTimer(token);
            return true;
        }
        return false;
    }

    public routerHandler(p) {
        p = decodeURIComponent(p);
        const keys = p.split("");
        for (let i = 0; i < keys.length; i++) {
            if (keys[i]==="/") {
                keys[i] = "_";
            }
        }
        return keys.join("");
    }

    public getSelfAuthOpen() {
        return DataUtil.get(self_auth_jscode);
    }

    public setSelfAuthOpen(req) {
        return DataUtil.set(self_auth_jscode,req.open);
    }


}

export const settingService: SettingService = new SettingService();
