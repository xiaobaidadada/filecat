import {
    Body,
    Controller, Get, JsonController, Param, Post,
} from "routing-controllers";
import {ddns_http_url_key, ddnsService} from "./ddns.service";
import {DdnsConnection, DdnsIPPojo} from "../../../common/req/ddns.pojo";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {Fail, Sucess} from "../../other/Result";
import {deleteList} from "../../../common/ListUtil";


@JsonController("/ddns")
export class DdnsController {


    @Get("/ips/:type")
    async getIps(@Param("type") type?: string) {
        return ddnsService.getIps(type);
    }

    // save ddns connect info
    @Post("/save")
    async save(@Body() data:DdnsConnection) {
        return ddnsService.save(data);
    }

    // add http url
    @Post('/http/add')
    add_http(@Body() item: DdnsIPPojo) {
        const list:DdnsIPPojo[] = DataUtil.get(ddns_http_url_key) ?? [];
        if (list.find(value => value.ifaceOrWww === item.ifaceOrWww)) {
            return Fail("已经存在");
        }
        list.push(item);
        DataUtil.set(ddns_http_url_key, list);
        return Sucess('ok');
    }
    // delete http url
    @Post('/http/del')
    del_http(@Body() item: DdnsIPPojo) {
        const list:DdnsIPPojo[] = DataUtil.get(ddns_http_url_key) ?? [];
        deleteList(list,(v)=>v.ifaceOrWww === item.ifaceOrWww);
        DataUtil.set(ddns_http_url_key, list);
        return Sucess('ok');
    }
}
