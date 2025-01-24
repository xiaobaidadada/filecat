import {otherMsg} from "../../../common/frame/router";
import {CmdType} from "../../../common/frame/WsData";
import WebSocket from "ws";
import {videoService} from "./video.service";
import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {Sucess} from "../../other/Result";
import {data_common_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";

const navindex_video_key = data_common_key.navindex_video_key;
@JsonController("/video")
export class VideoController {

    @otherMsg(CmdType.rtsp_get)
    getRtsp(ws: WebSocket,query:{[key: string]: string}) {
        userService.check_user_auth(query['token'], UserAuth.rtsp_proxy);
        videoService.getRtsp(decodeURIComponent(query["url"]),ws);
    }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[],@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.rtsp_proxy_tag_update);
        DataUtil.set(navindex_video_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get(@Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.rtsp_proxy);
        let list = DataUtil.get(navindex_video_key);
        return Sucess(list || []);
    }
}
