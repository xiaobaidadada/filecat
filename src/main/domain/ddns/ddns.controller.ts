import {
    Body,
    Controller, Get, JsonController, Param, Post, Req,
} from "routing-controllers";
import { ddnsService} from "./ddns.service";
import {DdnsConnection, DdnsIPPojo} from "../../../common/req/ddns.pojo";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {Fail, Sucess} from "../../other/Result";
import {deleteList} from "../../../common/ListUtil";
import {data_common_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";


@JsonController("/ddns")
export class DdnsController {


    @Get("/ips/:type")
    async getIps(@Req()req,@Param("type") type?: string) {
        userService.check_user_auth(req.headers.authorization,UserAuth.ddns);
        return ddnsService.getIps(type);
    }

    // save ddns connect info
    @Post("/save")
    async save(@Body() data:DdnsConnection,@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.ddns);
        return ddnsService.save(data);
    }

    // add http url
    @Post('/http/add')
    add_http(@Body() item: DdnsIPPojo,@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.ddns);
        const list:DdnsIPPojo[] = DataUtil.get(data_common_key.ddns_http_url_key) ?? [];
        if (list.find(value => value.ifaceOrWww === item.ifaceOrWww)) {
            return Fail("已经存在");
        }
        list.push(item);
        DataUtil.set(data_common_key.ddns_http_url_key, list);
        return Sucess('ok');
    }
    // delete http url
    @Post('/http/del')
    del_http(@Body() item: DdnsIPPojo,@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.ddns);
        const list:DdnsIPPojo[] = DataUtil.get(data_common_key.ddns_http_url_key) ?? [];
        deleteList(list,(v)=>v.ifaceOrWww === item.ifaceOrWww);
        DataUtil.set(data_common_key.ddns_http_url_key, list);
        return Sucess('ok');
    }
}
