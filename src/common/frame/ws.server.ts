import WebSocket from "ws";
import {msg, routerHandlerMap} from "./router";
import {CmdType, WsData} from "./WsData";

// 连接期间内一直存在
export class Wss {

    private _ws: WebSocket;
    // 0 是未验证,1是验证过的 目前不需要心跳
    public status = 0;

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
        // 监听客户端发送的消息
        wss.ws.on('message', async function incoming(message: WebSocket.Data) {
            const data = WsData.decode(message.toString());
            data.wss = wss;
            const handle = routerHandlerMap.get(data.cmdType);
            if (handle) {
                const rsq: string = await handle(data);
                // 发送消息给客户端
                wss.ws.send(new WsData(data.cmdType, rsq).encode());
            } else {
                console.log("没有匹配到路由")
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
        setTimeout(() => {
            if (wss.status === 0) {
                wss.ws.close();
            }
        }, 1000 * 10)
    }

}

export class WsServer {
    private _wss;

    constructor(wss: WebSocket.Server) {
        this._wss = wss;
    }

    public start() {
        // 监听客户端连接事件
        this._wss.on('connection', function connection(ws: WebSocket) {
            routerHandlerMap.get(CmdType.connection)!(ws);
        });
    }
}
