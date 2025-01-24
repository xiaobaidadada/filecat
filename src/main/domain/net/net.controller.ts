import {Body, Controller, Get, JsonController, Param, Post, Put, Req, Res} from "routing-controllers";
import {UserAuth, UserLogin} from "../../../common/req/user.req";
import {AuthFail, Fail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {Service} from "typedi";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {NetPojo, VirClientPojo, VirNetItem, VirServerPojo} from "../../../common/req/net.pojo";
import {netService} from "./net.service";
import {NavIndexItem} from "../../../common/req/common.pojo";
import { DataUtil} from "../data/DataUtil";
import {virtualService} from "./net.virtual.service";
import {Wss} from "../../../common/frame/ws.server";
import {Request, Response} from "express";
import {FileServiceImpl} from "../file/file.service";
import {data_common_key, file_key} from "../data/data_type";
import {userService} from "../user/user.service";

const navindex_net_key_list = data_common_key.navindex_net_key_list;

const navindex_wol_key = data_common_key.navindex_wol_key;

const http_tag_key = data_common_key.http_tag_key;


@JsonController("/net")
export class NetController {

    @Post('/start')
    async start(@Body() data: NetPojo,@Req()req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.browser_proxy);
        return netService.start(data);
    }

    @Post('/close')
    async close(@Body() data: NetPojo,@Req()req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.browser_proxy);
        await netService.close(data);
        return Sucess("1");
    }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[],@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.browser_proxy_tag_update);
        DataUtil.set(navindex_net_key_list, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get(@Req()req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.browser_proxy);
        let list = DataUtil.get(navindex_net_key_list);
        return Sucess(list || []);
    }

    @Post('/wol/tag/save')
    saveWolTag(@Body() items: NavIndexItem[],@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.wol_proxy_tag_update);
        DataUtil.set(navindex_wol_key, items);
        return Sucess('ok');
    }

    @Get("/wol/tag")
    getWolTag(@Req()req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.wol_proxy);
        let list = DataUtil.get(navindex_wol_key);
        return Sucess(list || []);
    }

    @Post("/wol/exec")
    wol(@Body() data: { mac: string },@Req()req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.wol_proxy);
        netService.wol(data.mac);
        return Sucess("");
    }

    // 虚拟网络
    @Get("/vir/server/get")
    virServerGet(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.vir_net);
        return Sucess(virtualService.virServerGet());
    }

    @Post("/vir/server/save")
    virServerSave(@Body() data: VirServerPojo,@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.vir_net); userService.check_user_auth(req.headers.authorization,UserAuth.vir_net);
        virtualService.virServerSave(data);
        return Sucess("1");
    }

    @Get("/vir/client/get")
    virClientGet(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.vir_net);
        return Sucess(virtualService.virClientGet());
    }

    @Post("/vir/client/save")
    virClientSave(@Body() data: VirClientPojo,@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.vir_net);
        virtualService.virClientSave(data);
        return Sucess("1");
    }

    // todo 实时推送
    @msg(CmdType.vir_net_serverIno_get)
    getServerInfos(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.vir_net);
        const list:any[] = [];
        virtualService.serverRealMap.forEach(v=>{
            list.push([v.vir_ip,v.to_address,v.to_address?"在线":"离线"])
        })
        return list;
    }

    // http 的tag
    @Get("/http/tag")
    get_http_tag(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.http_proxy);
        let list = DataUtil.get(http_tag_key,file_key.http_tag);
        return Sucess(list || []);
    }

    @Post('/http/tag/save')
    save_http_tag(@Body() items: NavIndexItem[],@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.http_proxy_tag_update);
        DataUtil.set(http_tag_key, items,file_key.http_tag);
        return Sucess('ok');
    }

    @Post('/http/send')
    async httpSend(@Req() req: Request, @Res() res: Response) {
        userService.check_user_auth(req.headers.authorization, UserAuth.http_proxy);
        return netService.httpSend(req, res);
    }
}
