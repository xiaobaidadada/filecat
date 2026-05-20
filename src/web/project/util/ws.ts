import {WsClient} from "../../../common/frame/ws.client";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {front_config} from "./config";

export const ws = new WsClient(`${window.location.host}${front_config.baseUrl}${window.location.pathname}`,"全局");
