import WebSocket from "ws";
import {msg, otherRouterHandlerMap, routerHandlerMap} from "./router";
import {CmdType, protocolIsProto2, WsConnectType, WsData} from "./WsData";
import * as parser from "socket.io-parser"
import {Decoder, Encoder, Packet, PacketType} from "socket.io-parser"
import {settingService} from "../../main/domain/setting/setting.service";

const url = require('url');

const decoder = new parser.Decoder();

// 连接期间内一直存在
export class Wss {

    private _ws: WebSocket;
    // 0 是未验证,1是验证过的 目前不需要心跳
    // public status = 0;

    public dataMap = new Map();
    public id: string;
    public _close: Function[] = [];

    constructor(ws: WebSocket) {
        this._ws = ws;
        this.id = Date.now().toString();
    }

    get ws() {
        return this._ws;
    }

    sendData(data: any) {
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                this._ws.send(data[i]);
            }
        } else {
            this._ws.send(data);
        }
    }

    public setClose(close: Function) {
        this._close.push(close);
    }
}

class WsPreHandler {

    @msg(CmdType.connection)
    async connection(ws: WebSocket) {
        console.log('ws客户端连接');
        // 该ws只创建一次
        const wss = new Wss(ws);
        if (!protocolIsProto2) {
            decoder.on("decoded", async (packet) => {
                const data = new WsData(packet.data[0], packet.data[1]);
                data.wss = wss;
                const handle = routerHandlerMap.get(data.cmdType);
                if (handle) {
                    const rsq: string = await handle(data);
                    // 发送消息给客户端
                    wss.sendData(new WsData(data.cmdType, rsq).encode());
                } else {
                    console.log("没有匹配到路由")
                }
            })
        }
        // 监听客户端发送的消息
        wss.ws.on('message', async function incoming(message: WebSocket.Data) {
            if (protocolIsProto2) {
                const data = WsData.decode(message);
                data.wss = wss;
                const handle = routerHandlerMap.get(data.cmdType);
                if (handle) {
                    const rsq: string = await handle(data);
                    // 发送消息给客户端
                    wss.sendData(new WsData(data.cmdType, rsq).encode());
                } else {
                    console.log("没有匹配到路由")
                }
            } else {
                // 暂时都是字符串
                decoder.add(message.toString());
            }
        });
        // 监听客户端断开连接事件
        wss.ws.on('close', function close() {
            console.log('ws客户端断开');
            if (wss._close.length > 0) {
                while (true) {
                    const close = wss._close.pop();
                    if (close) {
                        try {
                            close();
                        } catch (e) {
                            console.error('关闭函数', e)
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        });
        //  身份验证
        // setTimeout(() => {
        //     if (wss.status === 0) {
        //         wss.ws.close();
        //     }
        // }, 1000 * 10)
    }

}

export class WsServer {
    private _wss;

    constructor(wss: WebSocket.Server) {
        this._wss = wss;
    }

    public start() {
        // 监听客户端连接事件
        this._wss.on('connection', async function connection(ws: WebSocket,request) {
            try {
                // 解析查询参数
                const parsedUrl = url.parse(request.url, true); // 使用 'true' 参数解析查询字符串
                const { query } = parsedUrl; // 解析后的查询参数对象
                if (!await settingService.check(query['token'])) {
                    ws.close();
                    console.log('未验证的ws请求')
                    return;
                }
                if (query['type'] === `${WsConnectType.data}`) {
                    routerHandlerMap.get(CmdType.connection)!(ws);
                } else if (query['type'] === `${WsConnectType.other}`) {
                    const handler = otherRouterHandlerMap.get(parseInt(query['code']));
                    if (handler) {
                        handler(ws,query);
                    }else {
                        console.log('没找到对应路径')
                    };
                } else {
                    console.log('ws未找到对应的访问途径');
                    ws.close();
                }
            } catch (e) {
                console.log('ws connection',e);
                ws.close()
            }

        });
    }
}
