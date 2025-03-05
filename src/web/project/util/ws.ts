import {WsClient} from "../../../common/frame/ws.client";
import {CmdType, WsData} from "../../../common/frame/WsData";

export const ws = new WsClient(window.location.host+window.location.pathname,  (socket)=>{
    // const data = new WsData(CmdType.auth);
    // data.context = {
    //     Authorization: localStorage.getItem('token')
    // }
    //  // @ts-ignore
    // socket.send(data.encode())
},"全局");
