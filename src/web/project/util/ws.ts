import {WsClient} from "../../../common/frame/ws.client";
import {CmdType, WsData} from "../../../common/frame/WsData";

export const ws = new WsClient(window.location.host+window.location.pathname,"全局");
