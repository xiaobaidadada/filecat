import {Body, Controller, Get, JsonController, Post} from "routing-controllers";
import {UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {NetPojo, VirClientPojo, VirNetItem, VirServerPojo} from "../../../common/req/net.pojo";
import {netService} from "./net.service";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {virtualService} from "./net.virtual.service";
import {Wss} from "../../../common/frame/ws.server";

const navindex_key = "navindex_net_key_list";

const navindex_wol_key = "navindex_wol_key";

@JsonController("/net")
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
    wol(@Body() data: { mac: string }) {
        netService.wol(data.mac);
        return Sucess("");
    }

    // 虚拟网络
    @Get("/vir/server/get")
    virServerGet() {
        return Sucess(virtualService.virServerGet());
    }

    @Post("/vir/server/save")
    virServerSave(@Body() data: VirServerPojo) {
        virtualService.virServerSave(data);
        return Sucess("1");
    }

    @Get("/vir/client/get")
    virClientGet() {
        return Sucess(virtualService.virClientGet());
    }

    @Post("/vir/client/save")
    virClientSave(@Body() data: VirClientPojo) {
        virtualService.virClientSave(data);
        return Sucess("1");
    }

    @msg(CmdType.vir_net_serverIno_get)
    getServerInfos(data: WsData<any>) {
        const list:any[] = [];
        virtualService.serverRealMap.forEach(v=>{
            list.push([v.vir_ip,v.to_address,v.to_address?"在线":"离线"])
        })
        return list;
    }

}
