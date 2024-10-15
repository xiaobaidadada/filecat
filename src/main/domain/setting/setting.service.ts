import {DataUtil} from "../data/DataUtil";
import path from "path";
import fs from "fs";
import {CustomerApiRouterPojo, self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {Cache} from "../../other/cache";
import {AuthFail, Sucess} from "../../other/Result";
import {ServerEvent} from "../../other/config";
import {FileSettingItem, SysSoftware, SysSoftwareItem, TokenTimeMode} from "../../../common/req/setting.req";
import {Env} from "../../../common/Env";
import {ba} from "tencentcloud-sdk-nodejs";
import {SystemUtil} from "../sys/sys.utl";
const needle = require('needle');

const customer_router_key = "customer_router_key";

const customer_api_router_key = "customer_api_router_key";

const token_setting = "token_setting";

const files_pre_mulu_key = "files_pre_mulu_key";

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
                        ctx.body = await instance.handler(ctx.headers,data,ctx,Cache);
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
        if (Cache.check(token)) {
            Cache.updateTimer(token);
            return true;
        }
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

    getToken() {
        return DataUtil.get(token_setting);
    }

    saveToken (mode:TokenTimeMode,length:number) {
        if (mode === TokenTimeMode.close) {
            Cache.setIgnore(false);
            Cache.setIgnoreCheck(false);
        } else  if (mode === TokenTimeMode.length) {
            Cache.setIgnore(true);
            Cache.clearTokenTimerMap();
            Cache.getTokenMap().forEach(v=> Cache.getTokenTimerMap().set(v,setTimeout(()=>{
                Cache.getTokenMap().delete(v);
                Cache.getTokenTimerMap().delete(v);
            },1000*length)))
        } else if (mode === TokenTimeMode.forver){
            Cache.clearTokenTimerMap();
            Cache.setIgnore(true);
            Cache.setIgnoreCheck(true);
        }
        DataUtil.set(token_setting,{mode,length});
    }

    public init() {
        const data = DataUtil.get(token_setting);
        if (!!data && !!data['mode']) {
            this.saveToken(data['mode'],data["length"]);
        }
    }

    update_files_setting :FileSettingItem[];
    public getFilesSetting() {
        if (this.update_files_setting) {
            return this.update_files_setting;
        }
        const items:FileSettingItem[] = DataUtil.get(files_pre_mulu_key);
        const base = new FileSettingItem();
        base.path = Env.base_folder;
        base.note = "默认配置路径";
        const list = items ?? [];
        if (!list.find(v=>v.default)) {
            base.default = true;
        }
        this.update_files_setting = [base,...list];
        return this.update_files_setting;
    }

    public saveFilesSetting(items:FileSettingItem[],token:string) {
        if (!Array.isArray(items) || items.length===0) {
            return;
        }
        items.shift();
        DataUtil.set(files_pre_mulu_key, items);
        const obj = Cache.getTokenMap().get(token);
        obj["root_index"] = 0; // 回到默认
        this.update_files_setting = null;
    }

    public getFileRootPath (token:string) {
        const obj = Cache.getTokenMap().get(token);
        const index = obj?obj["root_index"]??null:null;
        const list = this.getFilesSetting();
        if(index !== null) {
            return list[index].path;
        } else {
            for (const item of list) {
                if (item.default) {
                    return item.path;
                }
            }
        }
    }

    cacheSysSoftwareItem:SysSoftwareItem[];
    public getSoftware() {
        if (this.cacheSysSoftwareItem) {
            return this.cacheSysSoftwareItem;
        }
        const items:SysSoftwareItem[] = DataUtil.get("sys_software");
        const map = new Map();
        for (const item of items ?? []) {
            map.set(item.id,item);
        }
        const list:SysSoftwareItem[] = [];
        for (const key of Object.keys(SysSoftware)) {
            const pojo = new SysSoftwareItem();
            pojo.id = SysSoftware[key];
            const item = map.get(key);
            pojo.path = item?item.path:"";
            if (key === SysSoftware.ffmpeg) {
                pojo.installed = SystemUtil.commandIsExist(`${!!item && item.path ? item.path : "ffmpeg"}  -version`);
            } else if (key === SysSoftware.smartmontools) {
                pojo.installed = SystemUtil.commandIsExist(`${!!item && item.path ? item.path : "smartctl"} --version`);
            } else if (key === SysSoftware.ntfs_3g) {
                pojo.installed = SystemUtil.commandIsExist(`${!!item && item.path ? item.path : "ntfs-3g"} --version`);
            }
            list.push(pojo);
        }
        this.cacheSysSoftwareItem = list;
        return list;
    }

    public setSoftware(req) {
        DataUtil.set("sys_software", req);
        this.cacheSysSoftwareItem = null;
        this.getFilesSetting();
    }

}

export const settingService: SettingService = new SettingService();
ServerEvent.on("start", (data) => {
    settingService.init();
})
