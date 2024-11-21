import {
    Body,
    Controller, Get, JsonController, Param, Post,
} from "routing-controllers";
import {ddnsService} from "./ddns.service";
import {DdnsConnection} from "../../../common/req/ddns.pojo";


@JsonController("/ddns")
export class DdnsController {


    @Get("/ips/:type")
    async getIps(@Param("type") type?: string) {
        return ddnsService.getIps(type);
    }

    @Post("/save")
    async save(@Body() data:DdnsConnection) {
        return ddnsService.save(data);
    }
}
