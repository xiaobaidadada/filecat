import {DataUtil} from "../data/DataUtil";
import path from "path";
import fs from "fs";
import {CustomerApiRouterPojo, self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {Cache} from "../../other/cache";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {ServerEvent} from "../../other/config";
import {
    dir_upload_max_num_item,
    FileQuickCmdItem,
    FileSettingItem, HttpsSettingReq, QuickCmdItem,
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
import {env_item, workflow_setting_item} from "../../../common/req/common.pojo";
import {plug_item, Plugin, PluginMeta, AiToolItem, PluginRoute} from "../../../plugin";
import {Env} from "../../../common/node/Env";
import {
    ai_agent_Item,
    ai_agent_item_dotenv_default, ai_docs_item, ai_docs_setting, ai_docs_setting_param_default,
    ai_mcp_server_item,
    ai_rebot_item, ai_rebot_setting,
    ai_system_prompt_item,
    json_params_default
} from "../../../common/req/filecat.ai.pojo";
import axios from "axios";
const ffmpeg = require('fluent-ffmpeg');

const needle = require('needle');
const Mustache = require('mustache');
const cron = require("node-cron");

const customer_router_key = data_common_key.customer_router_key;

const customer_api_router_key = data_common_key.customer_api_router_key;

const token_setting = data_common_key.token_setting;

// const files_pre_mulu_key = data_common_key.files_pre_mulu_key;

const customer_cache_map = new Map(); // 用于用户自定义缓存的map对象


const sandbox = {
    fs: fs,
    path: path,
    cache_map: customer_cache_map,
    axios:axios,
};
const sandbox_context = vm.createContext(sandbox); // 创建沙箱上下文

export class SettingService {


    getCustomerRouter():[string,string,number,string][] {
        const list:any[] = DataUtil.get(customer_router_key);
        return list ?? [];
    }

    setCustomerRouter(req: any) {
        DataUtil.set(customer_router_key, req);
    }

    // 1. 路由 2. 文件路径 3 token 4 用户Id 5 备注
    get_workflow_router():[string,string,string,string,string][] {
        const list:any[] = DataUtil.get(data_common_key.customer_workflow_router_key);
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
            if (!c_url || !c_url.startsWith(await get_sys_base_url_pre())) return;
            const workflow_list_router = this.get_workflow_router();
            if (!!workflow_list_router && workflow_list_router.length > 0) {
                for (let item of workflow_list_router) {
                    const router = item[0];
                    if (router === c_url) {
                        const location = item[1];
                        if (location && await FileUtil.access(location)) {
                            const token = item[2];
                            if (token) {
                                // token验证
                                if (path.isAbsolute(token)) {
                                    const context = (await FileUtil.readFileSync(token)).toString().trim();
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
                                const user_info = userService.get_user_info_by_user_id(item[3]);
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
            const list_router= this.getCustomerRouter()
            if (!!list_router && list_router.length > 0) {
                for (let item of list_router) {
                    const router = item[0]
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
            // 插件自定义路由拦截（优先级高于用户自定义 API 路由）
            const plugin_route = this.plugin_routes.get(c_url);
            if (plugin_route) {
                if (plugin_route.needAuth !== false) {
                    const token = ctx.headers.authorization;
                    if (!await this.check(token)) {
                        ctx.res.send(AuthFail('失败'));
                        ctx.res.end();
                        return true;
                    }
                }
                try {
                    // 直接把 ctx (Express Request) 传给插件，让插件自己处理 body 等
                    const r = await plugin_route.handler(ctx, ctx.res);
                    if (r !== null && r !== undefined) {
                        ctx.res.status(200).send(r);
                    }
                } catch (e) {
                    ctx.res.status(500).send(Sucess(e.toString()));
                }
                return true;
            }

            const list_api_router = DataUtil.get<CustomerApiRouterPojo[]>(customer_api_router_key);
            if (!!list_api_router && list_api_router.length > 0) {
                for (let item of list_api_router) {
                    if (item.router === c_url) {
                        if (item.needAuth) {
                            const token = ctx.headers.authorization;
                            if (!await this.check(token)) {
                                ctx.res.send(AuthFail('失败'));
                                ctx.res.end()
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
                                ctx.res.status(200).send(r);
                            }
                        } catch (e) {
                            ctx.res.status(500).send(Sucess(e.toString()))
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
                base_url:await get_base(),
                web_site_title
            }), // 给前端
            web_site_title
        });
        return index_text;
    }

    public get_sys_env(): { web_site_title: string, show_login_user_info:boolean} {
        return DataUtil.get(data_common_key.sys_env_key) ?? {web_site_title: 'FileCat',show_login_user_info: true};
    }

    public set_sys_env(req:{web_site_title: string ,show_login_user_info:boolean}) {
        return DataUtil.set(data_common_key.sys_env_key, req);
    }

    public get_https_setting(): HttpsSettingReq {
        return DataUtil.get(data_common_key.https_setting) ?? {open: false, cert_path: '', key_path: ''};
    }

    public set_https_setting(req: HttpsSettingReq) {
        // 校验路径
        if (req.open) {
            if (!req.cert_path || !req.key_path) {
                throw '证书路径和私钥路径不能为空';
            }
            if (!fs.existsSync(req.cert_path)) {
                throw `证书文件不存在: ${req.cert_path}`;
            }
            if (!fs.existsSync(req.key_path)) {
                throw `私钥文件不存在: ${req.key_path}`;
            }
        }
        DataUtil.set(data_common_key.https_setting, req);
        // 通知服务器需要重启以应用 HTTPS 设置
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


        // 处理分享
        this.init_share()
    }

    // update_files_setting: FileSettingItem[];
    ai_agent_setting():{models:ai_agent_Item[]} {
        const r = DataUtil.get(data_common_key.ai_agent_model_setting)as  any;
        if(!r) {
            const doubao_pojo = new ai_agent_Item()
            // 默认添加豆包的 api
            doubao_pojo.url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
            doubao_pojo.model = "doubao-seed-1-6"
            doubao_pojo.note = "豆包模型"
            doubao_pojo.open = false
            doubao_pojo.dotenv = ai_agent_item_dotenv_default
            doubao_pojo.json_params = json_params_default
            const longcat_pojo = new ai_agent_Item()
            longcat_pojo.url = 'https://api.longcat.chat/openai/v1/chat/completions'
            longcat_pojo.model = "LongCat-Flash-Chat"
            longcat_pojo.note = "美团龙猫"
            longcat_pojo.open = false
            longcat_pojo.dotenv = ai_agent_item_dotenv_default
            longcat_pojo.json_params = json_params_default
            const zhipu_pojo = new ai_agent_Item()
            zhipu_pojo.url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
            zhipu_pojo.model = "glm-5"
            zhipu_pojo.note = "智谱"
            zhipu_pojo.open = false
            zhipu_pojo.dotenv = ai_agent_item_dotenv_default
            zhipu_pojo.json_params = json_params_default
            const openai_pojo = new ai_agent_Item()
            openai_pojo.url = 'https://api.openai.com/v1/chat/completions'
            openai_pojo.model = "gpt-4o-mini" // 或 gpt-4.1 / gpt-5.3
            openai_pojo.note = "OpenAI"
            openai_pojo.open = false
            openai_pojo.dotenv = ai_agent_item_dotenv_default
            openai_pojo.json_params = json_params_default
            const xiaomi_pojo = new ai_agent_Item()
            xiaomi_pojo.url = 'https://api.xiaomimimo.com/v1/chat/completions'
            xiaomi_pojo.model = "mimo-v2-pro"
            xiaomi_pojo.note = "小米AI"
            xiaomi_pojo.open = false
            xiaomi_pojo.dotenv = ai_agent_item_dotenv_default
            xiaomi_pojo.json_params = json_params_default
            const deepseek_pojo = new ai_agent_Item()
            deepseek_pojo.url = 'https://api.deepseek.com/v1/chat/completions'
            deepseek_pojo.model = "deepseek-v4-pro"
            deepseek_pojo.note = "deepseek"
            deepseek_pojo.open = false
            deepseek_pojo.dotenv = ai_agent_item_dotenv_default
            deepseek_pojo.json_params = json_params_default
            deepseek_pojo.request_type = 'completions'
            return {
                models:[
                    doubao_pojo,longcat_pojo,zhipu_pojo,openai_pojo,xiaomi_pojo,deepseek_pojo
                ]
            }
        } else {
            return r
        }
    }

    ai_mcp_setting(): { list: ai_mcp_server_item[] } {
        return DataUtil.get(data_common_key.ai_agent_mcp_setting) ?? {
            list: []
        };
    }

    // 系统会话提示词
    ai_system_prompts_get(): ai_system_prompt_item[] {
        return DataUtil.get(data_common_key.ai_system_prompts) ?? [];
    }

    ai_system_prompts_save(list: ai_system_prompt_item[]) {
        DataUtil.set(data_common_key.ai_system_prompts, list);
    }

    // ============ 机器人配置 ============

    ai_rebot_setting(): ai_rebot_setting {
        return DataUtil.get(data_common_key.ai_rebot_setting) ?? { list: [] };
    }

    ai_rebot_setting_save(data: ai_rebot_setting) {
        DataUtil.set(data_common_key.ai_rebot_setting, data);
    }

    async ai_mcp_setting_save(token: string, data: { list: ai_mcp_server_item[] }) {
        const source_item = this.ai_mcp_setting();
        if (data?.list != null) {
            for (const it of data.list) {
                if (it.transport === "http") {
                    if (it.endpoint) {
                        try {
                            new URL(it.endpoint);
                        } catch {
                            throw new Error(`MCP HTTP endpoint 无效: ${it.endpoint}`);
                        }
                    }
                } else if (it.cwd) {
                    userService.check_user_path(token, it.cwd);
                }
            }
            source_item.list = data.list;
        }
        DataUtil.set(data_common_key.ai_agent_mcp_setting, source_item);
        await ai_agentService.reloadMcp().catch(console.error);
    }

    ai_docs_setting():ai_docs_setting{
        return DataUtil.get(data_common_key.ai_agent_docs_setting) ??{
            list:[],
            param:ai_docs_setting_param_default
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
        if(data.docs_update_tag) {
            ai_agentService.init().catch(console.error);
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

    public getFileRootPathById(user_id: string): string {
        const user_data = userService.get_user_info_by_user_id(user_id);
        return get_user_now_pwd(user_data)
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

    async getFfmpeg() {
        const list = await this.getSoftware();
        for (const item of list) {
            if (item.id === SysSoftware.ffmpeg && item.installed && !!item.path) {
                ffmpeg.setFfmpegPath(item.path);
            }
        }
        return ffmpeg;
    }

    smartctl:string

    async getSmartctl() {
        const list = await settingService.getSoftware();
        for (const item of list) {
            if (item.id === SysSoftware.smartmontools && item.installed && !!item.path) {
                this.smartctl = item.path;
            }
        }
        return this.smartctl;
    }

    ntfs_3g:string
    //
    // async get_ntfs_3g() {
    //     const list = await settingService.getSoftware();
    //     for (const item of list) {
    //         if (item.id === SysSoftware.ntfs_3g && item.installed && !!item.path) {
    //             this.ntfs_3g = item.path;
    //         }
    //     }
    //     return this.ntfs_3g;
    // }

    public async getSoftware() {
        if (this.cacheSysSoftwareItem) {
            return this.cacheSysSoftwareItem;
        }
        const items: SysSoftwareItem[] = DataUtil.get(data_common_key.sys_software);
        const map = new Map();
        for (const item of items ?? []) {
            map.set(item.id, item);
        }
        const list: SysSoftwareItem[] = [];
        const s = sysType === SysEnum.win ? ";" : ":";
        const env_list = settingService.get_env_path().split(s)
        for (const key of Object.keys(SysSoftware)) {
            const pojo = new SysSoftwareItem();
            pojo.id = SysSoftware[key];
            const item = map.get(pojo.id);
            pojo.path = item?.path
            if(pojo.path) {
                pojo.installed = SystemUtil.commandIsExist(`${pojo.path}`);
            } else {
                for (const p of env_list) {
                    const v = await FileUtil.get_exe_path_by_env_dir(p,pojo.id)
                    if(v) {
                        pojo.path = v;
                        pojo.installed = true;
                    }
                }
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

    public get_en_path_list():env_item[] {
        return DataUtil.get(data_common_key.extra_env_path_list_key) ?? [];
    }

    public get_env_path() {
        const list= this.get_en_path_list()
        const s = sysType === SysEnum.win ? ";" : ":";
        const filter_path_list = list.filter(v=>v.open).map(v => v.path)
        // 添加当前的node环境 添加到后面 前面有的话会覆盖
        filter_path_list.push(path.dirname(process.execPath))
        const r_list = filter_path_list.join(s);
        return process.env.PATH + s+ r_list;
    }

    setEnvPath(paths: env_item[]) {
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
                item.open_ws_file = item.open_ws_file === "true" || item.open_ws_file === true;
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

    isValidCron(expr) {
        if (typeof expr !== "string") return false;

        const parts = expr.trim().split(/\s+/);

        // node-cron: 秒 分 时 日 月 星期 => 6段
        if (parts.length !== 6) return false;

        const ranges = [
            [0, 59], // 秒
            [0, 59], // 分
            [0, 23], // 时
            [1, 31], // 日
            [1, 12], // 月
            [0, 7],  // 星期 (0/7 = Sunday)
        ];

        const isFieldValid = (field, min, max) => {
            // 支持 *, */n, n-m, n,m
            const regex = /^(\*|(\d+(-\d+)?)(,\d+(-\d+)?)*)$|^\*\/\d+$/;
            if (!regex.test(field)) return false;

            // *
            if (field === "*") return true;

            // */n
            if (field.startsWith("*/")) {
                const step = Number(field.slice(2));
                return step > 0;
            }

            // n,m or n-m
            const items = field.split(",");
            for (const item of items) {
                if (item.includes("-")) {
                    const [a, b] = item.split("-").map(Number);
                    if (a < min || b > max || a > b) return false;
                } else {
                    const num = Number(item);
                    if (num < min || num > max) return false;
                }
            }

            return true;
        };

        for (let i = 0; i < 6; i++) {
            const [min, max] = ranges[i];
            if (!isFieldValid(parts[i], min, max)) {
                return false;
            }
        }

        return true;
    }

    get_workflow_setting():workflow_setting_item[] {
        let list:workflow_setting_item[] = DataUtil.get(data_common_key.workflow_setting_item_list)
        if(!list) {
            list = []
            DataUtil.set(data_common_key.workflow_setting_item_list, list);
        }
        return list;
    }

    save_workflow_setting(list:workflow_setting_item[]) {
        for (let item of list) {
            if(item.cron_str != null && !this.isValidCron(item.cron_str)) {
                throw ` ${item.cron_str} is wrong `;
            }
        }
        DataUtil.set(data_common_key.workflow_setting_item_list, list);
        this.init_corn()
    }

    corn_job_running_list:any[] =[]

    init_corn() {
        for (const job of this.corn_job_running_list) {
            job.stop()
        }
        this.corn_job_running_list = []
        for (const item of this.get_workflow_setting()) {
            if(!item.open)continue;
            if(item.cron_str && this.isValidCron(item.cron_str)) {
                const job = cron.schedule(item.cron_str,()=>{
                    const user_info = userService.get_user_info_by_user_id(item.user_id);
                    workflowService.exec_file(item.file_path,user_info).catch(console.error);
                });
                this.corn_job_running_list.push(job);
            }
        }

    }

    power_on_corn() {
        const list = this.get_workflow_setting()
        for (const item of list) {
            if(!item.open)continue;
            if(!item.sys_power_on)continue;
            const user_info = userService.get_user_info_by_user_id(item.user_id);
            workflowService.exec_file(item.file_path,user_info).catch(console.error);
        }
    }

    // ============ 插件管理 ============

    /** 插件注册的主题列表：{主题标识: CSS文件路径} */
    plugin_themes: Map<string, string> = new Map();

    /** 插件注册的自定义路由：{路由路径: PluginRoute} */
    plugin_routes: Map<string, PluginRoute> = new Map();

    running_plugin_list:Plugin[] = []

    get_plugin_list(): plug_item[] {
        return DataUtil.get(data_common_key.filecat_plugin_list) ?? [];
    }


    async save_plugin_list(list: plug_item[]) {
        for (const item of list) {
            if (!item.name) {
                throw '插件名称不能为空';
            }
            if (!item.path) {
                throw '插件路径不能为空';
            }
        }
        DataUtil.set(data_common_key.filecat_plugin_list, list);
        await this.close_all_plugin()
        await this.load_all_plugin()
        return Sucess('保存成功');
    }


    async load_all_plugin() {
        this.running_plugin_list = [];
        this.plugin_themes.clear();
        this.plugin_routes.clear();
        const list = this.get_plugin_list();

        const results = await Promise.allSettled(
            list.map(item => this._load_single_plugin(item))
        );

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[Plugin] 加载失败: ${list[index].path}`, result.reason);
            }
        });
    }

    /**
     * 获取所有可用主题列表（内置 + 插件注册的）
     */
    get_all_themes(): {label:string,value:string}[] {
        const pluginEntries:  {label:string,value:string}[] = [];
        for (const [themeId, cssPath] of this.plugin_themes) {
            pluginEntries.push({
                label:themeId,
                value:themeId
            });
        }
        return pluginEntries;
    }

    /**
     * 根据主题ID获取插件主题的CSS文件路径
     */
    get_plugin_theme_path(themeId: string): string | undefined {
        return this.plugin_themes.get(themeId);
    }

    /**
     * 将 .css 文件注册为主题插件
     */
    private  _register_css_theme_plugin(plugin: Plugin) {
        if(!plugin.css_list?.length) return
        for (const item of plugin.css_list) {
            this.plugin_themes.set(item.label, item.path);
        }
    }

    /**
     * 将插件的自定义路由注册到全局路由表
     */
    private _register_plugin_routes(plugin: Plugin) {
        if (!plugin.routes?.length) return;
        for (const route of plugin.routes) {
            if (this.plugin_routes.has(route.router)) {
                console.warn(`[Plugin] 路由冲突: "${route.router}" 被插件 "${plugin.meta.name}" 覆盖`);
            }
            this.plugin_routes.set(route.router, route);
        }
        console.log(
            `[Plugin] "${plugin.meta.name}" 已注册路由:` ,
            plugin.routes.map(r => r.router).join(', ')
        );
    }

    /**
     * 卸载插件的自定义路由
     */
    private _unregister_plugin_routes(plugin: Plugin) {
        if (!plugin.routes?.length) return;
        for (const route of plugin.routes) {
            this.plugin_routes.delete(route.router);
        }
    }

    private _resolve_plugin(item: plug_item): Plugin {
        this._evict_require_cache(item.path);

        const raw: any = this._native_require(item.path);

        const plugin: Plugin = raw?.default?.activate
            ? raw.default
            : raw.filecat_plugin;

        if (!plugin?.activate) {
            throw new Error(`插件 ${item.path} 未找到有效导出`);
        }
        return plugin;
    }

    private async _load_single_plugin(item: plug_item): Promise<void> {
        if(!item.open) {
            // 没有开启
            return ;
        }
        const plugin = this._resolve_plugin(item);

        const params: Record<string, any> = {};
        if (item.params) {
            Env.load(item.params, params);
        }

        await plugin.activate({
            env: {
                port: Env.port,
                work_dir: Env.work_dir,
                version: process.env.version,
            },
            params,
        });

        this._register_ai_tools(plugin);
        this._register_css_theme_plugin(plugin);
        this._register_plugin_routes(plugin);

        // 保存 path 供卸载时清缓存
        (plugin as any).__plugin_path__ = item.path;
        this.running_plugin_list.push(plugin);
    }

    private _register_ai_tools(plugin: Plugin): void {
        // if (plugin.meta?.type !== 'ai_tool') return;
        if(!plugin.tools?.length) return;
        for (const tool of plugin.tools) {
            ai_agentService.registerPluginTool(plugin.meta.id, tool);
        }
        console.log(
            `[Plugin] "${plugin.meta.name}" 已注册工具:`,
            plugin.tools.map(t => t.schema.function.name).join(', ')
        );
    }

    async close_all_plugin() {
        await Promise.allSettled(
            this.running_plugin_list.map(plugin => this._unload_single_plugin(plugin))
        );
        this.running_plugin_list = [];
        this.plugin_themes.clear();
        this.plugin_routes.clear();
    }

    private async _unload_single_plugin(plugin: Plugin): Promise<void> {
        try {
            if (plugin.tools?.length) {
                ai_agentService.unregisterPluginTools(plugin.meta.id);
            }
            if (plugin.routes?.length) {
                this._unregister_plugin_routes(plugin);
            }
            await plugin.deactivate?.();
        } finally {
            // 无论 deactivate 是否报错，都清除缓存
            const pluginPath = (plugin as any).__plugin_path__;
            if (pluginPath) this._evict_require_cache(pluginPath);
        }
    }

    // 热重载单个插件
    async reload_plugin(pluginPath: string): Promise<void> {
        const index = this.running_plugin_list.findIndex(
            p => (p as any).__plugin_path__ === pluginPath
        );

        if (index !== -1) {
            await this._unload_single_plugin(this.running_plugin_list[index]);
            this.running_plugin_list.splice(index, 1);
        }

        const item = this.get_plugin_list().find(i => i.path === pluginPath);
        if (item) await this._load_single_plugin(item);
    }

    private _evict_require_cache(pluginPath: string): void {
        const nativeRequire = this._native_require;
        // require.cache 也要通过 eval require 拿
        const cache = nativeRequire.cache;

        const resolvedPath = nativeRequire.resolve(pluginPath);
        const mod = cache[resolvedPath];
        if (!mod) return;

        const pluginDir = path.dirname(resolvedPath);
        const evict = (m: NodeModule) => {
            if (!cache[m.id]) return;
            delete cache[m.id];
            m.children
                .filter(child => child.id.startsWith(pluginDir))
                .forEach(evict);
        };

        evict(mod);
    }

    _require_fn:any
    private get _native_require(): NodeRequire {
        // 缓存起来，避免每次都 eval
        if (!this._require_fn) {
            this._require_fn = eval("require");
        }
        return this._require_fn;
    }

}

export const settingService: SettingService = new SettingService();
ServerEvent.on("start", (data) => {
    settingService.init();
    settingService.power_on_corn();
    settingService.init_corn();
    settingService.load_all_plugin().catch(console.error);
})
