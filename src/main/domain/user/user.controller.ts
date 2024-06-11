import {Body, Controller, Get, Post} from "routing-controllers";
import {UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Env} from "../../../common/Env";
import {DataUtil} from "../data/DataUtil";

@Service()
@Controller("/user")
export class UserController {

    @Post('/login')
    login(@Body()user:UserLogin) {
        const username = DataUtil.get("username");
        if (Env.username) {
            if (user.username=== `${Env.username}` && user.password===`${Env.password}` ) {
                const uuid = Date.now();
                Cache.setToken(`${uuid}`)
                return Sucess(uuid)
            }
        } else if (username){
            const password = DataUtil.get("password");
            if (user.username=== `${username}` && user.password===`${password}` ) {
                const uuid = Date.now();
                Cache.setToken(`${uuid}`)
                return Sucess(uuid)
            }
        } else {
            if (user.username=== "admin" && user.password==="admin" ) {
                const uuid = Date.now();
                Cache.setToken(`${uuid}`)
                return Sucess(uuid)
            }
        }
        return AuthFail('密码错误');
    }

}
