import {Body, Controller, Ctx, Get, JsonController, Param, Post, Req} from "routing-controllers";
import {UserAuth, UserBaseInfo, UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Result, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Env} from "../../../common/Env";
import { DataUtil} from "../data/DataUtil";
import {settingService} from "./setting.service";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {TokenSettingReq, TokenTimeMode} from "../../../common/req/setting.req";
import {getSys} from "../shell/shell.service";
import {getShortTime} from "../../../common/ValueUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {hash_string} from "../user/user.hash";
import {router_pre_file, self_auth_open_js_code_file, self_shell_cmd_check_js_code_file} from "./setting.prefile";
import {userService} from "../user/user.service";

@Service()
@JsonController("/setting")
export class SettingController {



    // 获取页面路由
    @Get("/customer_router")
    getRouter() {
        return Sucess(settingService.getCustomerRouter());
    }

    // 设置页面路由
    @Post('/customer_router/save')
    saveRouter(@Body() req:any,@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.code_resource);
        settingService.setCustomerRouter(req);
        return Sucess("1");
    }

    // 获取api路由
    @Get("/api/customer_router")
    getApiRouter() {
        return Sucess(settingService.getCustomerApiRouter());
    }

    // 设置api路由
    @Post('/api/customer_router/save')
    saveApiRouter(@Body() req:any,@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.code_api);
        // todo 之前设置的js代码文件是否一直保留
        settingService.setCustomerApiRouter(req);
        return Sucess("1");
    }

    // 获取api路由  修改路由后js代码也没了
    @Get("/self_auth_open")
    getSelfAuth() {
        const result = settingService.getSelfAuthOpen();
        return Sucess(result ?? false);
    }

    // 设置 auth 开启状态
    @Post('/self_auth_open/save')
    saveSelfAuth(@Body() req:any,@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.code_auth);
        settingService.setSelfAuthOpen(req);
        return Sucess("1");
    }

    // auth js 代码获取
    @Get("/self_auth_open/jscode")
    getSelfAuthJscode(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.code_auth);
        const context = DataUtil.getFile(self_auth_jscode,data_dir_tem_name.sys_file_dir);
        const  pre = self_auth_open_js_code_file;
        if (!context) {
            DataUtil.setFile(self_auth_jscode,pre,data_dir_tem_name.sys_file_dir);
        }
        return Sucess(context || pre);
    }

    // 获取自定义 shell cmd 开启状态
    @Get("/shell_cmd_check_open")
    get_shell_cmd_check() {
        const result = settingService.get_shell_cmd_check();
        return Sucess(result ?? false);
    }

    // 保存 自定义 shell cmd 开启状态
    @Post('/shell_cmd_check_open/save')
    save_shell_cmd_check(@Body() req:any,@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.shell_cmd_check);
        settingService.save_shell_cmd_check(req.open);
        return Sucess("1");
    }

    // 自定义 shell cmd js 代码获取
    @Get("/shell_cmd_check_open/jscode")
    get_shell_cmd_Jscode(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.shell_cmd_check);
        const context = DataUtil.getFile(data_common_key.self_shell_cmd_jscode,data_dir_tem_name.sys_file_dir);
        const  pre = self_shell_cmd_check_js_code_file;
        if (!context) {
            DataUtil.setFile(data_common_key.self_shell_cmd_jscode,pre,data_dir_tem_name.sys_file_dir);
        }
        return Sucess(context || pre);

    }

    // 保存 shell cmd js 代码获取
    @Post("/shell_cmd_check_open/jscode/save")
    save_shell_cmd_Jscode(@Req()req,@Body() body:{context:string}) {
        userService.check_user_auth(req.headers.authorization,UserAuth.shell_cmd_check);
        DataUtil.setFile(data_common_key.self_shell_cmd_jscode,body.context,data_dir_tem_name.sys_file_dir);
        return Sucess("1");
    }

    // 获取js代码
    @Get('/jscode/:router*')
    async getJscode(@Req() req,@Param("router") router?: string) {
        userService.check_user_auth(req.headers.authorization,UserAuth.code_api);
        router = settingService.routerHandler(router);
        const context = DataUtil.getFile(router,data_dir_tem_name.all_user_api_file_dir);
        const  pre = router_pre_file;
        if (!context) {
            DataUtil.setFile(router,pre,data_dir_tem_name.all_user_api_file_dir);
        }
        return Sucess(context || pre);
    }

    // 设置js代码(用于任意的js代码文件保存)
    @Post('/jscode/save')
    async saveJscode(@Body() req:{router:string,context:string},@Req()r) {
        let dir;
        if(req.router === self_auth_jscode) {
            dir = data_dir_tem_name.sys_file_dir;
            userService.check_user_auth(r.headers.authorization,UserAuth.code_auth);
        } else {
            // 这里不再用于通用的 只用于这两个
            userService.check_user_auth(r.headers.authorization,UserAuth.code_api);
            dir = data_dir_tem_name.all_user_api_file_dir;
        }

        DataUtil.setFile(settingService.routerHandler(req.router),req.context,dir);
        return Sucess("1");
    }


    @Get('/token')
    async  getToken() {
        return Sucess(settingService.getToken());
    }

    @Post('/token/save')
    async saveToken(@Body()req:TokenSettingReq,@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.token_update);
        if (req.mode === TokenTimeMode.length && req.length < 10) {
            return Fail("时间过短小于10秒");
        }
        settingService.saveToken(req.mode,req.length);
        return Sucess("1");
    }

    @Get('/token/clear')
    async  clearToken(@Req()r) {
        userService.check_user_auth(r.headers.authorization,UserAuth.token_update);
        Cache.clear();
        return Sucess("1");
    }


    // 设置文件路由设置
    @Post('/filesSetting/save')
    saveFilesSetting(@Body() req:any,@Req() ctx) {
        settingService.saveFilesSetting(req,ctx.headers.authorization);
        return Sucess("1");
    }

    // 获取文件设置
    @Get("/filesSetting")
    getFilesSetting(@Req() ctx) {
        return Sucess(settingService.getFilesSetting(ctx.headers.authorization));
    }

    // 系统软件设置
    @Get("/outside/software/get")
    getSoftware() {
        return Sucess(settingService.getSoftware());
    }
    @Post('/outside/software/save')
    setSoftware(@Body() req:any,@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.outside_software_path);
        settingService.setSoftware(req,ctx.headers.authorization);
        return Sucess("");
    }

    @Get("/pty_cmd")
    get_pty_cmd(){
        const list = settingService.get_pty_cmd();
        return Sucess(list.join(" "));
    }

    @Post("/pty_cmd/save")
    save_pty_cmd(@Body() req:any,@Req() ctx){
        userService.check_user_auth(ctx.headers.authorization,UserAuth.pty_cmd_update);
        settingService.save_pty_cmd(req.str);
        return Sucess("");
    }

    // path路径
    @Get("/env/path/get")
    getEnvPath() {
        return Sucess(settingService.getEnvPath());
    }

    @Post('/env/path/save')
    setEnvPath(@Body() req:{paths:any[]},@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.env_path_update);
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
    protectionDirSave(@Body() req:any,@Req() ctx) {
        settingService.protectionDirSave(req,ctx.headers.authorization);
        return Sucess("1");
    }
}
