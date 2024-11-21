import {otherMsg} from "../../../common/frame/router";
import {CmdType} from "../../../common/frame/WsData";
import WebSocket from "ws";
import {videoService} from "./video.service";
import {Body, Controller, Get, JsonController, Post} from "routing-controllers";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {Sucess} from "../../other/Result";

const navindex_video_key = "navindex_video_tag_key"
@JsonController("/video")
export class VideoController {

    @otherMsg(CmdType.rtsp_get)
    getRtsp(ws: WebSocket,query:{[key: string]: string}) {
        videoService.getRtsp(decodeURIComponent(query["url"]),ws);
    }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[]) {
        DataUtil.set(navindex_video_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get() {
        let list = DataUtil.get(navindex_video_key);
        return Sucess(list || []);
    }
}
