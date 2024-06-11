import {Body, Controller, Get, Post} from "routing-controllers";
import {UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {NetPojo} from "../../../common/req/net.pojo";
import {netService} from "./net.service";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";

const navindex_key = "navindex_net_key_list";

const navindex_wol_key = "navindex_wol_key";

@Controller("/net")
export class NetController {

    @Post('/start')
    async start(@Body() data: NetPojo) {
        return netService.start(data);
    }

    @Post('/close')
    async close(@Body() data: NetPojo) {
        await netService.close(data);
        return Sucess("1");
    }


    @Post('/tag/save')
    save(@Body() items: NavIndexItem[]) {
        DataUtil.set(navindex_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get() {
        let list = DataUtil.get(navindex_key);
        return Sucess(list || []);
    }

    @Post('/wol/tag/save')
    saveWolTag(@Body() items: NavIndexItem[]) {
        DataUtil.set(navindex_wol_key, items);
        return Sucess('ok');
    }

    @Get("/wol/tag")
    getWolTag() {
        let list = DataUtil.get(navindex_wol_key);
        return Sucess(list || []);
    }

    @Post("/wol/exec")
    wol(@Body() data:{mac:string}) {
        netService.wol(data.mac);
        return Sucess("");
    }
}
