import {CmdType, WsData} from "../../../common/frame/WsData";
// import rdp from "./lib";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import {msg} from "../../../common/frame/router";

const rdpClientKey = "rdpClient";
let rdp_:any;
function init() {
    if(!rdp_) {
        rdp_ = require("./lib/index");
    }
}
export class RdpService {


    async infos(data:WsData<any>) {
        init()
        const wss = (data.wss as Wss);
        let rdpClient : any = wss.dataMap.get(rdpClientKey);
        if (rdpClient) {
            // clean older connection
            rdpClient.close();
        };
        const context = data.context;
        // todo 异常处理
        rdpClient = rdp_.createClient({
            domain : context.domain,
            userName : context.username,
            password : context.password,
            enablePerf : true,
            autoLogin : true,
            screen : context.screen,
            locale : context.locale,
            logLevel : process.argv[2] || 'INFO'
        });
        wss.dataMap.set(rdpClientKey, rdpClient);
        rdpClient.on('connect', function () {
            const result = new WsData<SysPojo>(CmdType.rdp_connect);
            result.context = "";
            (data.wss as Wss).sendData(result.encode())
        }).on('bitmap', async function(bitmap) {
            const result = new WsData<SysPojo>(CmdType.rdp_bitmap);
            result.bin_context = bitmap.data;
            bitmap.data=null;
            result.context = bitmap;
            (data.wss as Wss).ws.send(result.encode())
        }).on('close', function() {
            const result = new WsData<SysPojo>(CmdType.rdp_close);
            result.context = "";
            (data.wss as Wss).sendData(result.encode())
        }).on('error', function(err) {
            const result = new WsData<SysPojo>(CmdType.rdp_error);
            result.context = err;
            (data.wss as Wss).sendData(result.encode())
        }).connect(context.ip, 3389);
        (data.wss as Wss).setClose(()=>{
            if(!rdpClient) return;
            console.log('由于ws断开，rpd关闭');
            rdpClient.close();
        })
        return ""
    }


    async mouse(data:WsData<any>) {
        const context = data.context;
        const rdpClient : any = (data.wss as Wss).dataMap.get(rdpClientKey);
        if (!rdpClient)  return;
        rdpClient.sendPointerEvent(context.x, context.y, context.button, context.isPressed);
    }


    async wheel(data:WsData<any>) {
        const context = data.context;
        const rdpClient : any = (data.wss as Wss).dataMap.get(rdpClientKey);
        if (!rdpClient) {
            return;
        }
        rdpClient.sendWheelEvent(context.x, context.y, context.step, context.isNegative, context.isHorizontal);
    }


    async unicode(data:WsData<any>) {
        // todo 暂时无用
        const context = data.context;
        const rdpClient : any = (data.wss as Wss).dataMap.get(rdpClientKey);
        if (!rdpClient) return;

        rdpClient.sendKeyEventUnicode(context.code, context.isPressed);
    }


    async scancode(data:WsData<any>) {
        const context = data.context;
        const rdpClient : any = (data.wss as Wss).dataMap.get(rdpClientKey);
        if (!rdpClient) {
            return;
        }
        rdpClient.sendKeyEventScancode(context.code, context.isPressed);
    }

    @msg(CmdType.rdp_disconnect)
    async rdpDisconnect(data:WsData<any>) {
        const context = data.context;
        const rdpClient : any = (data.wss as Wss).dataMap.get(rdpClientKey);
        if (!rdpClient) {
            return;
        }
        rdpClient.close();
    }
}
export const rdpService = new RdpService();
