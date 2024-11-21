import {Body, Controller, Get, JsonController, Param, Post} from "routing-controllers";
import {ddnsService} from "../ddns/ddns.service";
import {Sucess} from "../../other/Result";
import {crypto_service} from "./crypto.service";
import {DdnsConnection} from "../../../common/req/ddns.pojo";


@JsonController("/crypto")
export class CryptoController {


    @Post("/generate")
    async generate(@Body() data:{type:string,form:string}) {
        return Sucess(crypto_service.generate(data.type, data.form));
    }

    @Post("/save_openssh")
    async save_openssh(@Body() data:{context:string,name:string}) {
        crypto_service.save_openssh(data.name,data.context);
        return Sucess("1");
    }

}