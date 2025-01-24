import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {rdpService} from "./rdp.service";
import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {NavIndexItem} from "../../../common/req/common.pojo";
import { DataUtil} from "../data/DataUtil";
import {Sucess} from "../../other/Result";
import {data_common_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Wss} from "../../../common/frame/ws.server";
// todo json序列化方式，传输速度，页面css适配问题
const navindex_rdp_key = data_common_key.navindex_rdp_key
@JsonController("/rdp")
export class RdpController {

    @msg(CmdType.infos)
    async infos(data:WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.rdp_proxy);
        rdpService.infos(data);
        return ""
    }

    @msg(CmdType.mouse)
    async mouse(data:WsData<any>) {
        rdpService.mouse(data);
        return ""
    }

    @msg(CmdType.wheel)
    async wheel(data:WsData<any>) {
        rdpService.wheel(data);
        return "";
    }

    @msg(CmdType.unicode)
    async unicode(data:WsData<any>) {
        rdpService.unicode(data);
        return ""
    }

    @msg(CmdType.scancode)
    async scancode(data:WsData<any>) {
        rdpService.scancode(data);
        return "";
    }

    @msg(CmdType.rdp_disconnect)
    async rdpDisconnect(data:WsData<any>) {
        rdpService.rdpDisconnect(data);
        return ""
    }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[],@Req()req) {
        DataUtil.set(navindex_rdp_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get(@Req() req) {
        let list = DataUtil.get(navindex_rdp_key);
        return Sucess(list || []);
    }

}
