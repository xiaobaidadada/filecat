import {Body, Get, JsonController, Param, Post, Req} from "routing-controllers";
import {UserAuth} from "../../../common/req/user.req";
import {Fail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {DataUtil} from "../data/DataUtil";
import {settingService} from "./setting.service";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {ai_agent_Item, sys_setting_type, TokenSettingReq, TokenTimeMode} from "../../../common/req/setting.req";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {router_pre_file, self_auth_open_js_code_file, self_shell_cmd_check_js_code_file} from "./setting.prefile";
import {userService} from "../user/user.service";
import fs from "fs"
import path from "path"
import {Http_controller_router} from "../../../common/req/http_controller_router";
import {ServerEvent} from "../../other/config";
import {ai_agentService} from "../ai_agent/ai_agent.service";

@JsonController("/setting")
export class SettingController {


    // 获取页面路由
    @Get(`/${Http_controller_router.setting_customer_router}`)
    getRouter() {
        return Sucess(settingService.getCustomerRouter());
    }

    // 设置页面路由
    @Post(`/${Http_controller_router.setting_customer_router_save}`)
    saveRouter(@Body() req: any, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.code_resource);
        settingService.setCustomerRouter(req);
        return Sucess("1");
    }

    @Get(`/${Http_controller_router.setting_customer_workflow_router}`)
    get_workflow_router() {
        return Sucess(settingService.get_workflow_router());
    }

    // 设置workflow路由
    @Post(`/${Http_controller_router.setting_customer_workflow_router_save}`)
    save_workflow_router(@Body() req: any, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.workflow_api);
        settingService.save_workflow_router(req);
        return Sucess("1");
    }

    // 获取api路由
    @Get("/api/customer_router")
    getApiRouter() {
        return Sucess(settingService.getCustomerApiRouter());
    }

    // 设置api路由
    @Post('/api/customer_router/save')
    saveApiRouter(@Body() req: any, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.code_api);
        // todo 之前设置的js代码文件是否一直保留
        settingService.setCustomerApiRouter(req);
        return Sucess("1");
    }

    // 获取api路由  修改路由后js代码也没了
    @Get("/self_auth_open")
    getSelfAuth() {
        const result = settingService.getSelfAuthOpen();
        return Sucess(result);
    }

    // 设置 auth 开启状态
    @Post('/self_auth_open/save')
    saveSelfAuth(@Body() req: any, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.code_auth);
        settingService.setSelfAuthOpen(req);
        return Sucess("1");
    }

    // auth js 代码获取
    @Get("/self_auth_open/jscode")
    getSelfAuthJscode(@Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.code_auth);
        const context = DataUtil.getFile(self_auth_jscode, data_dir_tem_name.sys_file_dir);
        const pre = self_auth_open_js_code_file;
        if (!context) {
            DataUtil.setFile(self_auth_jscode, pre, data_dir_tem_name.sys_file_dir);
        }
        return Sucess(context || pre);
    }

    // 获取自定义 shell cmd 开启状态
    @Get("/shell_cmd_check_open")
    get_shell_cmd_check() {
        const result = settingService.get_shell_cmd_check();
        return Sucess(result);
    }

    // 保存 自定义 shell cmd 开启状态
    @Post('/shell_cmd_check_open/save')
    save_shell_cmd_check(@Body() req: any, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.shell_cmd_check);
        settingService.save_shell_cmd_check(req.open);
        return Sucess("1");
    }

    // 自定义 shell cmd js 代码获取
    @Get("/shell_cmd_check_open/jscode")
    get_shell_cmd_Jscode(@Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.shell_cmd_check);
        const context = DataUtil.getFile(data_common_key.self_shell_cmd_jscode, data_dir_tem_name.sys_file_dir);
        const pre = self_shell_cmd_check_js_code_file;
        if (!context) {
            DataUtil.setFile(data_common_key.self_shell_cmd_jscode, pre, data_dir_tem_name.sys_file_dir);
        }
        return Sucess(context || pre);

    }

    // 保存 shell cmd js 代码获取
    @Post("/shell_cmd_check_open/jscode/save")
    save_shell_cmd_Jscode(@Req() req, @Body() body: { context: string }) {
        userService.check_user_auth(req.headers.authorization, UserAuth.shell_cmd_check);
        DataUtil.setFile(data_common_key.self_shell_cmd_jscode, body.context, data_dir_tem_name.sys_file_dir);
        return Sucess("1");
    }

    // 获取js代码
    @Get('/jscode/:router*')
    async getJscode(@Req() req, @Param("router") router?: string) {
        userService.check_user_auth(req.headers.authorization, UserAuth.code_api);
        router = settingService.routerHandler(router);
        const context = DataUtil.getFile(router, data_dir_tem_name.all_user_api_file_dir);
        const pre = router_pre_file;
        if (!context) {
            DataUtil.setFile(router, pre, data_dir_tem_name.all_user_api_file_dir);
        }
        return Sucess(context || pre);
    }

    // 设置js代码(用于任意的js代码文件保存)
    @Post('/jscode/save')
    async saveJscode(@Body() req: { router: string, context: string }, @Req() r) {
        let dir;
        if (req.router === self_auth_jscode) {
            dir = data_dir_tem_name.sys_file_dir;
            userService.check_user_auth(r.headers.authorization, UserAuth.code_auth);
        } else {
            // 这里不再用于通用的 只用于这两个
            userService.check_user_auth(r.headers.authorization, UserAuth.code_api);
            dir = data_dir_tem_name.all_user_api_file_dir;
        }

        DataUtil.setFile(settingService.routerHandler(req.router), req.context, dir);
        return Sucess("1");
    }


    @Get('/token')
    async getToken() {
        return Sucess(settingService.getToken());
    }

    @Post('/token/save')
    async saveToken(@Body() req: TokenSettingReq, @Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.token_update);
        if (req.mode === TokenTimeMode.length && req.length < 10) {
            return Fail("时间过短小于10秒");
        }
        settingService.saveToken(req.mode, req.length);
        return Sucess("1");
    }

    @Get('/token/clear')
    async clearToken(@Req() r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.token_update);
        Cache.clear();
        return Sucess("1");
    }


    // 设置文件路由设置
    @Post('/filesSetting/save')
    async saveFilesSetting(@Body() req: any, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.sys_env_setting_key);
        await settingService.saveFilesSetting(req, ctx.headers.authorization);
        return Sucess("1");
    }

    // 获取文件设置
    @Get("/filesSetting")
    getFilesSetting(@Req() ctx) {
        return Sucess(settingService.getFilesSetting(ctx.headers.authorization));
    }

    @Post('/ai_agent_setting/save')
    async ai_agent_settingsave(@Body() req: {models:ai_agent_Item[]}, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        DataUtil.set(data_common_key.ai_agent_model_setting,req)
        ai_agentService.load_key()
        return Sucess("1");
    }

    // ai代理设置获取
    @Get("/ai_agent_setting")
    ai_agent_setting_get(@Req() ctx) {
        // 全部数据配置，需要编辑权限才能看到
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        return Sucess(settingService.ai_agent_setting());
    }

    @Get("/ai_docs_setting")
    ai_docs_setting(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        return Sucess(settingService.ai_docs_setting());
    }

    @Post("/ai_docs_setting_save")
    async ai_docs_setting_save(@Req() ctx,@Body() data) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        await settingService.ai_docs_setting_save(ctx.headers.authorization,data)
        return Sucess("");
    }

    @Get("/ai_agent_setting/env")
    ai_agent_setting_get_env(@Req() ctx) {
        return Sucess(ai_agentService.get_env());
    }

    @Get("/get_share_file_list")
    get_share_file_list(@Req() ctx) {
        // 全部数据配置，需要编辑权限才能看到
        userService.check_user_auth(ctx.headers.authorization, UserAuth.share_file);
        return Sucess(settingService.get_share_file_list());
    }

    @Post("/add_share_file_list")
    add_share_file_list(@Body() req: any, @Req() ctx) {
        // 全部数据配置，需要编辑权限才能看到
        userService.check_user_auth(ctx.headers.authorization, UserAuth.share_file);
        settingService.add_share_file(req,ctx.headers.authorization)
        return Sucess("");
    }

    @Post("/set_share_file_list")
    set_share_file_list(@Body() req: any, @Req() ctx) {
        // 全部数据配置，需要编辑权限才能看到
        userService.check_user_auth(ctx.headers.authorization, UserAuth.share_file);
        settingService.set_share_file_list(req,ctx.headers.authorization)
        return Sucess("");
    }


    // 系统软件设置
    @Get("/outside/software/get")
    getSoftware() {
        return Sucess(settingService.getSoftware());
    }

    @Post('/outside/software/save')
    setSoftware(@Body() req: any, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.outside_software_path);
        settingService.setSoftware(req, ctx.headers.authorization);
        return Sucess("");
    }

    @Get("/pty_cmd")
    get_pty_cmd() {
        const list = settingService.get_pty_cmd();
        return Sucess(list.join(" "));
    }

    @Post("/pty_cmd/save")
    save_pty_cmd(@Body() req: any, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.pty_cmd_update);
        settingService.save_pty_cmd(req.str);
        return Sucess("");
    }

    // path路径
    @Get("/env/path/get")
    getEnvPath() {
        return Sucess(settingService.getEnvPath());
    }

    @Post('/env/path/save')
    setEnvPath(@Body() req: { paths: any[] }, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.env_path_update);
        settingService.setEnvPath(req.paths);
        return Sucess("1");
    }


    // 获取保护目录
    @Get("/protection_dir")
    protectionDirGet(@Req() ctx) {
        return Sucess(settingService.protectionDirGet(ctx.headers.authorization));
    }

    // 保存保护目录
    @Post('/protection_dir/save')
    async protectionDirSave(@Body() req: any, @Req() ctx) {
        await settingService.protectionDirSave(req, ctx.headers.authorization);
        return Sucess("1");
    }

    // 获取保护目录
    @Get("/protection_dir/sys")
    protectionSysDirGet(@Req() ctx) {
        return Sucess(settingService.protectionSysDirGet());
    }

    // 保存保护目录
    @Post('/protection_dir/sys/save')
    protectionSysDirSave(@Body() req: any, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.sys_protection_dir);
        settingService.protectionSysDirSave(req);
        return Sucess("1");
    }

    // 获取并发数量限制
    @Get("/dir_upload_max_num")
    get_dir_upload_max_num(@Req() ctx) {
        return Sucess(settingService.get_dir_upload_max_num());
    }

    @Post("/dir_upload_max_num/save")
    save_dir_upload_max_num(@Body() req: any, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.dir_upload_max_num);
        settingService.save_dir_upload_max_num(req);
        return Sucess("1");
    }

    // 获取系统所有的配置
    @Get("/sys_option/status")
    get_sys_option_status(@Req() ctx) {
        // 获取系统所有功能的状态
        const r = {
            self_auth_open: settingService.getSelfAuthOpen(), // 自定义登录鉴权
            shell_cmd_check_open: settingService.get_shell_cmd_check(), // 自定义cmd判断
            recycle_open: settingService.get_recycle_bin_status(), // 垃圾回收站功能
            recycle_dir: settingService.get_recycle_dir_str(), // 垃圾回收站 目录也返回
            sys_env: settingService.get_sys_env(),
        }
        return Sucess(r);
    }

    // @Get("/customer_api_pre_key")
    // get_customer_api_pre_key(@Req() ctx) {
    //         return Sucess(settingService.get_customer_api_pre_key());
    // }
    //
    // @Post("/customer_api_pre_key/save")
    // customer_api_pre_key_save(@Req() ctx,@Body() req: any) {
    //     userService.check_user_auth(ctx.headers.authorization, UserAuth.customer_api_pre_key);
    //     settingService.customer_api_pre_key_save(req);
    //     return Sucess("1");
    // }

    // 保存系统所有的开关状态
    @Post(`/${Http_controller_router.setting_sys_option_status_save}`)
    async save_sys_option_status(@Req() ctx, @Body() body: { type: sys_setting_type, value: any, open: boolean }) {
        // 获取系统所有功能的状态
        if (body.type === sys_setting_type.cyc) {
            // 文件回收站
            userService.check_user_auth(ctx.headers.authorization, UserAuth.recycle_file_save);
            DataUtil.set(data_common_key.recycle_bin_status, body.open)
            if (!body.value) {
                return Fail("empty value")
            }
            const list = body.value.split(";");
            const key_map_list: string[][] = [];
            for (const item of list) {
                const l = item.split(' ');
                for (const it of l) {
                    if (!fs.existsSync(it)) {
                        throw "dir not found"
                    }
                    const stats = fs.statSync(it);
                    if (!stats.isDirectory()) {
                        throw "dir not a dir"
                    }
                    if (!path.isAbsolute(it)) {
                        throw "dir not absolute"
                    }
                }
                key_map_list.push(l);
            }
            DataUtil.set(data_common_key.recycle_bin_key, key_map_list);
        } else if (body.type === sys_setting_type.sys_env) {
            userService.check_user_auth(ctx.headers.authorization, UserAuth.sys_env_setting_key);
            settingService.set_sys_env({web_site_title: body.value.web_site_title});
            ServerEvent.emit("sys_env_update");
            // 语言
            const user_data = userService.get_user_info_by_token(ctx.headers.authorization);
            user_data.language = body.value.language;
            user_data.theme = body.value.theme;
            await userService.save_user_info(user_data.id, user_data);
        }
        return Sucess("1");
    }
}
