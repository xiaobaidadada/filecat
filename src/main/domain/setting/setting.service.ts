import {DataUtil} from "../data/DataUtil";
import path from "path";
import fs from "fs";
import {CustomerApiRouterPojo, self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {Cache} from "../../other/cache";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {ServerEvent} from "../../other/config";
import {
    ai_agent_Item, ai_docs_item, ai_docs_setting,
    dir_upload_max_num_item,
    FileQuickCmdItem,
    FileSettingItem,
    QuickCmdItem,
    SysSoftware,
    SysSoftwareItem,
    TokenTimeMode
} from "../../../common/req/setting.req";
import {SystemUtil} from "../sys/sys.utl";
import {Request} from "express";
import {data_common_key, data_dir_tem_name, file_key} from "../data/data_type";
import * as vm from "node:vm";
import {UserService, userService} from "../user/user.service";
import {shellServiceImpl, sysType} from "../shell/shell.service";
import {workflowService} from "../file/workflow/workflow.service";
import {SysEnum, UserAuth} from "../../../common/req/user.req";
import {FileServiceImpl} from "../file/file.service";
import {FileUtil} from "../file/FileUtil";
import {get_base, get_sys_base_url_pre} from "../bin/bin";
import {get_user_now_pwd} from "../../../common/DataUtil";
import {ai_agentService} from "../ai_agent/ai_agent.service";
import {file_share_item} from "../../../common/req/file.req";
import {generateRandomHash} from "../../../common/StringUtil";
const ffmpeg = require('fluent-ffmpeg');

const needle = require('needle');
const Mustache = require('mustache');

const customer_router_key = data_common_key.customer_router_key;

const customer_api_router_key = data_common_key.customer_api_router_key;

const token_setting = data_common_key.token_setting;

// const files_pre_mulu_key = data_common_key.files_pre_mulu_key;

const customer_cache_map = new Map(); // 用于用户自定义缓存的map对象


const sandbox = {
    needle: needle, // needle http 请求工具
    fs: fs,
    path: path,
    cache_map: customer_cache_map
};
const sandbox_context = vm.createContext(sandbox); // 创建沙箱上下文

export class SettingService {

    getCustomerRouter() {
        const list = DataUtil.get(customer_router_key);
        return list ?? [];
    }

    setCustomerRouter(req: any) {
        DataUtil.set(customer_router_key, req);
    }

    get_workflow_router() {
        const list = DataUtil.get(data_common_key.customer_workflow_router_key);
        return list ?? [];
    }

    save_workflow_router(req: any) {
        DataUtil.set(data_common_key.customer_workflow_router_key, req);
    }


    // 甚至可以替代系统的 api
    public async intercept(ctx: Request) {
        try {
            let c_url = ctx.originalUrl;
            if (ctx.originalUrl.includes("?")) {
                c_url = ctx.originalUrl.split("?")[0];
            }
            if (!c_url || !c_url.startsWith(get_sys_base_url_pre())) return;
            const workflow_list_router = this.get_workflow_router() as [][];
            if (!!workflow_list_router && workflow_list_router.length > 0) {
                for (let item of workflow_list_router) {
                    // @ts-ignore
                    const router = item[0];
                    if (router === c_url) {
                        // @ts-ignore
                        const location = item[1];
                        if (location && await FileUtil.access(location)) {
                            // @ts-ignore
                            const token = item[2];
                            if (token) {
                                // token验证
                                if (path.isAbsolute(token)) {
                                    const context = (await FileUtil.readFileSync(token)).toString();
                                    if (context !== ctx.headers.authorization) {
                                        ctx.res.status(500).send("token is invalid");
                                        return true;
                                    }
                                } else if (token !== ctx.headers.authorization) {
                                    ctx.res.status(500).send("token is invalid");
                                    return true;
                                }
                            }
                            // workflow文件存在
                            try {
                                // @ts-ignore
                                const user_info = userService.get_user_info_by_user_id(item[3]);
                                // @ts-ignore
                                userService.check_user_auth_by_user_id(item[3], UserAuth.workflow_exe);
                                workflowService.exec_file(location, user_info).catch((e) => {
                                    console.log("workflow触发失败", e)
                                    ctx.res.status(500).send(JSON.stringify(e));
                                }).then(() => {
                                    ctx.res.status(200).send("ok");
                                });
                            } catch (e) {
                                ctx.res.status(500).send(JSON.stringify(e));
                            }
                            return true;
                        }
                    }
                }
            }
            const list_router: any[] = DataUtil.get<[][]>(customer_router_key);
            if (!!list_router && list_router.length > 0) {
                for (let item of list_router) {
                    const router = item[0] as string;
                    if (c_url.startsWith(router)) { // 使用包含 可以用于目录的情况
                        const location = item[1];
                        if (location) {
                            if ((location as string).startsWith("http")) {
                                const response = await needle('get', location, ctx.headers);
                                for (let key in response.headers) {
                                    ctx.res.setHeader(key, response.headers[key]);
                                    // ctx.set(key, response.headers[key]);
                                }
                                ctx.res.status(response.statusCode).send(response.body);
                            } else {
                                let sys_file_path = path.join(location); // 可以删除 .. 符号
                                let stats = await FileUtil.statSync(location);
                                if (stats.isDirectory()) {
                                    let p = c_url.slice(router.length);
                                    p = decodeURIComponent(p);
                                    if (p === "/" || !p) {
                                        const list = await FileUtil.readdirSync(sys_file_path);
                                        const ok_file_name = list.find((v => v.startsWith("index.htm") || v === "index"));
                                        if (ok_file_name) {
                                            sys_file_path = path.join(location, ok_file_name);
                                            stats = await FileUtil.statSync(sys_file_path);
                                        } else {
                                            throw " 404 ";
                                        }
                                    } else {
                                        sys_file_path = path.join(location, p);
                                        stats = await FileUtil.statSync(sys_file_path);
                                    }
                                }
                                if (!userService.isSubPath(location, sys_file_path)) {
                                    throw " 404 ";
                                }
                                FileServiceImpl.download_one_file(path.basename(sys_file_path), stats.size, sys_file_path, ctx.res, {
                                    handle_type_: "inline",
                                    cache_length: item[2]
                                });
                            }
                            return true;
                        }
                    }
                }
            }
            const list_api_router = DataUtil.get<CustomerApiRouterPojo[]>(customer_api_router_key);
            if (!!list_api_router && list_api_router.length > 0) {
                for (let item of list_api_router) {
                    if (item.router === c_url) {
                        if (item.needAuth) {
                            const token = ctx.headers.authorization;
                            if (!await this.check(token)) {
                                ctx.res.send(AuthFail('失败'));
                                return true;
                            }
                        }
                        try {

                            const instance = this.getHandlerClass(item.router, data_dir_tem_name.all_user_api_file_dir);
                            // 监听 'data' 事件以接收数据块
                            let data = '';
                            ctx.on('data', (chunk) => {
                                data += chunk;
                            });
                            // 等待 'end' 事件完成
                            await new Promise((resolve) => {
                                ctx.on('end', resolve);
                            });
                            const r = await instance.handler(ctx.headers, data, ctx);
                            if (r !== null && r !== undefined) {
                                ctx.res.send(r);
                            }
                        } catch (e) {
                            ctx.res.send(Sucess(e.toString()))
                        }
                        return true;
                    }
                }
            }

            // 拦截失败
            return false;
        } catch (e) {
            ctx.res.send(Fail(e.toString()))
            console.log(e);
            return true;
        }

    }

    // 每次都会重新读取文件没有必要缓存 todo 更合适方案
    public getHandlerClass(key, dir) {
        const jscode = DataUtil.getFile(this.routerHandler(key), dir);
        if (!jscode) {
            return {};
        }
        const result = vm.runInContext(`(() => {
                                                ${jscode};
                                                return Api;
                                            })()`, sandbox_context);
        const instance = new result();
        // const ApiClass = eval(`(() => {
        //     ${jscode};
        //     return Api;
        // })()`);
        // const instance = new ApiClass();
        return instance;
    }

    getCustomerApiRouter() {
        const list = DataUtil.get(customer_api_router_key);
        return list ?? [];
    }

    setCustomerApiRouter(req: any) {
        DataUtil.set(customer_api_router_key, req);
    }

    public async check(token: string) {
        if (Cache.check(token)) {
            Cache.updateStamp(token);
            return true;
        }
        return false;
    }

    public routerHandler(p) {
        p = decodeURIComponent(p);
        const keys = p.split("");
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] === "/") {
                keys[i] = "_";
            }
        }
        return keys.join("");
    }

    public get_shell_cmd_check() {
        return DataUtil.get(data_common_key.self_shell_cmd_check_open_status) ?? false;
    }

    public save_shell_cmd_check(status) {
        return DataUtil.set(data_common_key.self_shell_cmd_check_open_status, status);
    }

    public getSelfAuthOpen() {
        return DataUtil.get(self_auth_jscode) ?? false;
    }

    public setSelfAuthOpen(req) {
        return DataUtil.set(self_auth_jscode, req.open);
    }

    public get_recycle_bin_status() {
        return DataUtil.get(data_common_key.recycle_bin_status) ?? false;
    }

    // public get_customer_api_pre_key():string {
    //     return DataUtil.get(data_common_key.customer_api_pre_key)??get_sys_base_url_pre(); // 必须属于 get_sys_base_url_pre 获取的前缀内 也就是要包括 ***/api
    // }
    //
    // customer_api_pre_key_save(req) {
    //     return DataUtil.set(data_common_key.customer_api_pre_key, req.pre);
    // }

    public get_recycle_dir_str(): string {
        let v = DataUtil.get(data_common_key.recycle_bin_key) ?? "";
        if (typeof v !== "string") {
            const l = v as string[][];
            v = "";
            const item_l = [];
            for (const item of l) {
                item_l.push(item.join(' '));
            }
            v = item_l.join(";");
        }
        return v as string;
    }


    public async get_index_html() {
        const index_path = path.join(__dirname, 'dist', "index.html");
        let index_text = await FileUtil.readFileSync(index_path);
        const web_site_title = this.get_sys_env().web_site_title;
        index_text = Mustache.render(index_text.toString(),{
            Windows_FileCat: JSON.stringify({
                base_url:get_base(),
                web_site_title
            }), // 给前端
            web_site_title
        });
        return index_text;
    }

    public get_sys_env(): { web_site_title: string } {
        return DataUtil.get(data_common_key.sys_env_key) ?? {web_site_title: 'FileCat'};
    }

    public set_sys_env(req:{web_site_title: string }) {
        return DataUtil.set(data_common_key.sys_env_key, req);
    }

    public get_recycle_dir_map_list(): string[][] {
        let v = DataUtil.get(data_common_key.recycle_bin_key) ?? []
        if (typeof v === "string") {
            const list = v.split(";");
            const key_map_list: string[][] = [];
            for (const item of list) {
                const l = item.split(' ');
                key_map_list.push(l);
            }
            v = key_map_list;
        }
        return v as string[][];
    }

    getToken() {
        return DataUtil.get(token_setting);
    }

    saveToken(mode: TokenTimeMode, length: number) {
        if (mode === TokenTimeMode.close) {
            // 使用默认长度模式
            Cache.set_default_time_len(60 * 60 * 1000);
        } else if (mode === TokenTimeMode.length) {
            // 使用指定长度模式
            Cache.set_default_time_len(length * 1000);
        } else if (mode === TokenTimeMode.forver) {
            // 永不过期
            Cache.set_default_time_len(-1);
        }
        DataUtil.set(token_setting, {mode, length});
    }

    share_timer :NodeJS.Timeout[] = []

    public init_share() {

        // 清理旧timer
        if (this.share_timer) {
            for (const it of this.share_timer) {
                clearTimeout(it);
            }
        }
        this.share_timer = [];

        const share_list = this.get_share_file_list();
        const new_share_list = [];
        for (const it of share_list) {
            if (it.left_hour == null || it.left_hour < 0) {
                new_share_list.push(it);
                continue;
            }
            const now = Date.now();
            const targetTime =
                it.time_stamp + it.left_hour * 3600000;
            if (targetTime <= now) {
                // 过期直接跳过
                continue;
            }
            new_share_list.push(it);
            const delay = targetTime - now;
            const timer = setTimeout(() => {
                this.init_share();
            }, delay);
            this.share_timer.push(timer);
        }
        DataUtil.set(data_common_key.share_file_list_key, new_share_list);
    }


    public init() {
        const data = DataUtil.get(token_setting);
        if (!!data && !!data['mode']) {
            this.saveToken(data['mode'], data["length"]);
        }
        // 高版本的 npm 也需要用pty环境了
        const shell_list = ['bash', 'sh', 'cmd.exe', 'pwsh.exe', 'powershell.exe', 'vim', 'nano', 'cat', 'tail']; // 一些必须用 node_pty 执行的 powershell 不行 必须得 powershell.exe
        if (!DataUtil.get(data_common_key.cmd_use_pty_key)) {
            DataUtil.set(data_common_key.cmd_use_pty_key, shell_list);
        }
        ai_agentService.load_key()

        // 处理分享
        this.init_share()
    }

    // update_files_setting: FileSettingItem[];
    ai_agent_setting():{models:ai_agent_Item[]} {
        const r = DataUtil.get(data_common_key.ai_agent_model_setting)as  any;
        if(!r) {
            const pojo = new ai_agent_Item()
            // 默认添加豆包的 api
            pojo.url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
            pojo.model = "doubao-seed-1-6"
            pojo.note = "豆包模型"
            pojo.open = false
            return {
                models:[
                    pojo
                ]
            }
        } else {
            return r
        }
    }

    ai_docs_setting():ai_docs_setting{
        return DataUtil.get(data_common_key.ai_agent_docs_setting) ??{
            list:[],
            param:''
        }
    }

    async ai_docs_setting_save(token,data:ai_docs_setting) {
        const source_item = this.ai_docs_setting()
        if(data.list != null) {
            for (const it of data.list) {
                userService.check_user_path(token, it.dir)
            }
            source_item.list = data.list
        }
        if (data.param != null) {
            source_item.param = data.param
        }
        DataUtil.set(data_common_key.ai_agent_docs_setting, source_item);
        if(data.list != null) {
             ai_agentService.init_search_docs().catch(console.error);
        }
        if(data.param != null) {
            ai_agentService.init_search_docs_param()
        }
    }

    // 获取文件分享列表
    get_share_file_list():file_share_item[] {
        const list:file_share_item[] = DataUtil.get(data_common_key.share_file_list_key) ?? []
        const statics:any = DataUtil.get(data_common_key.share_file_list_key_download_statics,file_key.statics_tag) ?? {}
        for (const item of list) {
            item.download_num = statics[item.id]
        }
        return list;
    }

    add_share_file(item:file_share_item,token) {
        const list = this.get_share_file_list()
        list.push(item)
        this.set_share_file_list(list,token)
    }

    set_share_file_list(list:file_share_item[],token) {
        const time = Date.now()
        const keys = new Set()
        for (const item of list) {
            userService.check_user_path(token, item.path)
            if(!item.id) {
                item.id = generateRandomHash(15)
            }
            if(!item.time_stamp) {
                item.time_stamp = time
            }
            keys.add(item.id)
        }
        DataUtil.set(data_common_key.share_file_list_key, list);
        // 清理一下统计
        const statics :any = DataUtil.get(data_common_key.share_file_list_key_download_statics,file_key.statics_tag);
        if(statics) {
            for (const key of Object.keys(statics)) {
                if(!keys.has(key)) {
                    delete statics[key]
                }
            }
            DataUtil.set(data_common_key.share_file_list_key_download_statics,statics,file_key.statics_tag);
        }
        // 最后重置一下过期时间设置
        this.init_share()
    }

    public getFilesSetting(token) {
        // if (this.update_files_setting) {
        //     return this.update_files_setting;
        // }
        // const items: FileSettingItem[] = DataUtil.get(files_pre_mulu_key);
        //
        // const list = items ?? [];
        // if (!list.find(v => v.default)) {
        //     base.default = true;
        // }
        // this.update_files_setting = [base, ...list];
        // return this.update_files_setting;
        const user_data = userService.get_user_info_by_token(token);
        const base = new FileSettingItem();
        base.path = user_data.cwd;
        base.note = "default path";
        let ok = true;
        for (const item of user_data?.folder_items ?? []) {
            if (item.default) {
                ok = false;
                break;
            }
        }
        if (ok) base.default = true;
        return {
            dirs:[base, ...user_data?.folder_items ?? []],
            quick_cmd:[...user_data?.quick_cmd ?? []],
            file_quick_cmd:[...user_data?.file_quick_cmd ?? []]
        };
    }

    public async saveFilesSetting(data:{dirs: FileSettingItem[],quick_cmd:QuickCmdItem[],file_quick_cmd:FileQuickCmdItem[]}, token: string) {
        const user_data = userService.get_user_info_by_token(token);
        if(data.dirs) {
            const items = data.dirs;
            if (!Array.isArray(items) || items.length === 0) {
                return;
            }
            items.shift(); // 删除系统的

            // 校验路径是否合法
            for (const item of items) {
                userService.check_user_path(token, item.path)
            }
            user_data.folder_items = items;
            let index;
            for (const v of items) {
                if (v.default)
                    index = v.index
            }
            user_data.folder_item_now = index; // 使用默认的 cwd
            if (index === undefined || index === null) {
                user_data.folder_item_now = 0; // 回到默认
            }

        } else if(data.quick_cmd) {
            user_data.quick_cmd = data.quick_cmd;
        } else if(data.file_quick_cmd) {
            user_data.file_quick_cmd = data.file_quick_cmd;
        }
        await userService.save_user_info(user_data.id, user_data);
        // DataUtil.set(files_pre_mulu_key, items);
        // const obj = Cache.getValue(token);
        // obj["root_index"] = 0; // 回到默认
        // this.update_files_setting = null;
    }

    public getFileRootPath(token: string): string {
        // const obj = Cache.getValue(token);
        // const index = obj ? obj["root_index"] ?? null : null;
        // const list = this.getFilesSetting(token);
        // if (index !== null) {
        //     return list[index].path;
        // } else {
        //     for (const item of list) {
        //         if (item.default) {
        //             return item.path;
        //         }
        //     }
        // }
        const user_data = userService.get_user_info_by_token(token);
        return get_user_now_pwd(user_data)
    }

    cacheSysSoftwareItem: SysSoftwareItem[];

    getFfmpeg() {
        const list = this.getSoftware();
        for (const item of list) {
            if (item.id === SysSoftware.ffmpeg && item.installed && !!item.path) {
                ffmpeg.setFfmpegPath(item.path);
            }
        }
        return ffmpeg;
    }

    smartctl:string

    getSmartctl() {
        const list = settingService.getSoftware();
        for (const item of list) {
            if (item.id === SysSoftware.smartmontools && item.installed && !!item.path) {
                this.smartctl = item.path;
            }
        }
        return this.smartctl;
    }

    ntfs_3g:string

    get_ntfs_3g() {
        const list = settingService.getSoftware();
        for (const item of list) {
            if (item.id === SysSoftware.ntfs_3g && item.installed && !!item.path) {
                this.ntfs_3g = item.path;
            }
        }
        return this.ntfs_3g;
    }

    public getSoftware() {
        if (this.cacheSysSoftwareItem) {
            return this.cacheSysSoftwareItem;
        }
        const items: SysSoftwareItem[] = DataUtil.get(data_common_key.sys_software);
        const map = new Map();
        for (const item of items ?? []) {
            map.set(item.id, item);
        }
        const list: SysSoftwareItem[] = [];
        for (const key of Object.keys(SysSoftware)) {
            const pojo = new SysSoftwareItem();
            pojo.id = SysSoftware[key];
            const item = map.get(key);
            pojo.path = item ? item.path : "";
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

    public setSoftware(req, token) {
        DataUtil.set(data_common_key.sys_software, req);
        this.cacheSysSoftwareItem = null;
        this.getFilesSetting(token);
    }

    // extra_env_path = data_common_key.extra_env_path

    public getEnvPath() {
        return DataUtil.get(data_common_key.extra_env_path_list_key) ?? [];
    }

    public get_env_list() {
        const list: any[] = DataUtil.get(data_common_key.extra_env_path_list_key) ?? [];
        const s = sysType === SysEnum.win ? ";" : ":";
        return list.map(v => v.path).join(s);
    }

    setEnvPath(paths: any[]) {
        DataUtil.set(data_common_key.extra_env_path_list_key, paths);
        shellServiceImpl.path_init();
        return Sucess("1");
    }

    // protection_directory = data_common_key.protection_directory


    protectionDirGet(token): { path: string }[] {
        const user_data = userService.get_user_info_by_token(token);
        // DataUtil.get(this.protection_directory) ?? [];
        return user_data.protection_directory ?? []
    }

    // 获取系统保护目录
    protectionSysDirGet(): { path: string }[] {

        return DataUtil.get(data_common_key.protection_directory) ?? [];
    }

    get_dir_upload_max_num(): dir_upload_max_num_item[] {
        return DataUtil.get(data_common_key.dir_upload_max_num) ?? [];
    }

    get_pty_cmd(): string[] {
        return DataUtil.get(data_common_key.cmd_use_pty_key) ?? [];
    }

    save_pty_cmd(str) {
        if (!str) str = "";
        const list = str.split(/\s+/).filter(v => !!v);
        DataUtil.set(data_common_key.cmd_use_pty_key, list);
    }


    async protectionDirSave(data, token) {
        const user_data = userService.get_user_info_by_token(token);
        user_data.protection_directory = data;
        await userService.save_user_info(user_data.id, user_data);
    }

    protectionSysDirSave(data) {
        DataUtil.set(data_common_key.protection_directory, data);
    }

    save_dir_upload_max_num(data: dir_upload_max_num_item[]) {
        const list = data ?? [];
        for (const item of list) {
            if (!item.path) {
                throw "path is empty";
            }
            if (typeof item.user_upload_num === "string") {
                item.user_upload_num = parseInt(item.user_upload_num);
            }
            if (typeof item.sys_upload_num === "string") {
                item.sys_upload_num = parseInt(item.sys_upload_num);
            }
            if (typeof item.open_ws_file === "string") {
                item.open_ws_file = item.open_ws_file === "true";
            }
            if (item.open_ws_file) {
                if (typeof item.ws_file_block_mb_size !== "number") {
                    throw `编号:${item.index} 文件块的大小设置有问题`;
                }
                if (typeof item.ws_file_parallel_num !== "number") {
                    throw `编号:${item.index} 并发数量设置有问题`;
                }
                if (typeof item.ws_file_standard_size !== "number") {
                    throw `编号:${item.index} 大文件size设置有问题`;
                }
            }
        }
        DataUtil.set(data_common_key.dir_upload_max_num, list);
    }

    protectionCheck(sys_path: string) {
        const list = this.protectionSysDirGet() ?? [];
        for (const item of list) {
            if (UserService.path_check_is_child(item.path, sys_path)) {
                // 是子路径
                return true;
            }
        }
        return false;
    }

}

export const settingService: SettingService = new SettingService();
ServerEvent.on("start", (data) => {
    settingService.init();
    ai_agentService.init_search_docs_param()
    ai_agentService.init_search_docs().catch(console.error);
})
