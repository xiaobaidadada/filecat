import {Body, Controller, Get, Param, Post} from "routing-controllers";
import {UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Result, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Env} from "../../../common/Env";
import {DataUtil} from "../data/DataUtil";
import {settingService} from "./setting.service";
import {GetFilePojo} from "../../../common/file.pojo";
import {json} from "react-router-dom";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {TokenSettingReq, TokenTimeMode} from "../../../common/req/setting.req";

@Service()
@Controller("/setting")
export class SettingController {

    @Post('/updatePassword')
    login(@Body()user:UserLogin) {
        // 清空
        Env.updateEnv([{key:"username"},{key:"password"}]);
        DataUtil.set("username",user.username);
        DataUtil.set("password",user.password);
        return Sucess('ok');
    }

    // 获取页面路由
    @Get("/customer_router")
    getRouter() {
        return Sucess(settingService.getCustomerRouter());
    }

    // 设置页面路由
    @Post('/customer_router/save')
    saveRouter(@Body() req:any) {
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
    saveApiRouter(@Body() req:any) {
        // todo 之前设置的js代码文件是否一直保留
        settingService.setCustomerApiRouter(req);
        return Sucess("1");
    }

    // 获取api路由 todo 修改路由后js代码也没了
    @Get("/self_auth_open")
    getSelfAuth() {
        const result = settingService.getSelfAuthOpen();
        return Sucess(result ?? false);
    }

    // 设置api路由
    @Post('/self_auth_open/save')
    saveSelfAuth(@Body() req:any) {
        settingService.setSelfAuthOpen(req);
        return Sucess("1");
    }

    @Get("/self_auth_open/jscode")
    getSelfAuthJscode() {
        const context = DataUtil.getFile(self_auth_jscode);
        const  pre = ` 
             // 必须存在的类
             class Api {  
                
                /*
                * 处理并返回结果
                * @params token: token
                */
                async handler(token) { 
                    return false;
                }
             }
        `;
        if (!context) {
            DataUtil.setFile(self_auth_jscode,pre);
        }
        return Sucess(context || pre);
    }


    // 获取js代码
    @Get('/jscode/:router*')
    async getJscode(@Param("router") router?: string) {
        router = settingService.routerHandler(router);
        const context = DataUtil.getFile(router);
        const  pre = ` 
             // 必须存在的类
             class Api {  
                
                /*
                * 处理并返回结果
                * @params headers: 请求头对象
                * @params body: 请求体
                */
                async handler(headers,body,ctx) { 
                    return null;
                }
             }
        `;
        if (!context) {
            DataUtil.setFile(router,pre);
        }
        return Sucess(context || pre);
    }

    // 设置js代码
    @Post('/jscode/save')
    async saveJscode(@Body() req:{router:string,context:string}) {
        DataUtil.setFile(settingService.routerHandler(req.router),req.context);
        return Sucess("1");
    }

    token_setting = "token_setting";
    @Get('/token')
    async  getToken() {
        return Sucess(DataUtil.get(this.token_setting));
    }

    @Post('/token/save')
    async saveToken(@Body()req:TokenSettingReq) {
        if (req.mode === TokenTimeMode.close) {
            Cache.setIgnore(false);
            Cache.setIgnoreCheck(false);
        } else  if (req.mode === TokenTimeMode.length) {
            Cache.setIgnore(true);
            Cache.getTokenMap().forEach(v=>clearTimeout(v));
            Cache.getTokenMap().clear();
            Cache.getTokenSet().forEach(v=> Cache.getTokenMap().set(v,setTimeout(()=>{
                Cache.getTokenSet().delete(v);
                Cache.getTokenMap().delete(v);
            },1000*req.length)))
        } else {
            Cache.setIgnore(true);
            Cache.setIgnoreCheck(true);
        }
        DataUtil.set(this.token_setting,req);
        return Sucess("1");
    }

    @Get('/token/clear')
    async  clearToken() {
        Cache.clear();
        return Sucess("1");
    }

}
