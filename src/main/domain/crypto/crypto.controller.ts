import {Body, Controller, Get, JsonController, Param, Post, Req} from "routing-controllers";
import {ddnsService} from "../ddns/ddns.service";
import {Sucess} from "../../other/Result";
import {crypto_service} from "./crypto.service";
import {DdnsConnection} from "../../../common/req/ddns.pojo";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";


@JsonController("/crypto")
export class CryptoController {


    @Post("/generate")
    async generate(@Body() data:{type:string,form:string}) {
        return Sucess(crypto_service.generate(data.type, data.form));
    }

    @Post("/save_openssh")
    async save_openssh(@Body() data:{context:string,name:string},@Req() req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.crypto_ssh_file);
        await crypto_service.save_openssh(data.name,data.context);
        return Sucess("1");
    }

}