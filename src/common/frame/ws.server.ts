import WebSocket from "ws";
import {msg, otherRouterHandlerMap, routerHandlerMap} from "./router";
import {CmdType, protocolIsProto2, WsConnectType, WsData} from "./WsData";
import {RCode} from "../Result.pojo";
import {generateRandomHash} from "../StringUtil";
import {heart_interval, max_heart_interval} from "./constant";

const url = require('url');


const allWssSet = new Set<Wss>;

// 连接期间内一直存在
export class Wss {

    private _ws: WebSocket;
    // 0 是未验证,1是验证过的 目前不需要心跳
    // public status = 0;

    public dataMap = new Map();
    public id: string;
    public _close: Function[] = [];
    public token:string;
    public heart_time_stamp:number = Date.now();
    public heart_interval:NodeJS.Timeout;

    constructor(ws: WebSocket) {
        this._ws = ws;
        this.id = `${Date.now().toString()}_${generateRandomHash(4)}`;
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

    send(cmdType:CmdType,data:any) {
        const result = new WsData<any>(cmdType);
        result.context = data;
        this._ws.send(result.encode());
    }

    // 发送给所有在线的客户端
    public static sendToAllClient(cmdType:CmdType,data:any,wss_set?:Set<Wss>) {
        const result = new WsData<any>(cmdType);
        result.context = data;
        const encode_data = result.encode()
        for (const wss of (wss_set ?? allWssSet).values()) {
            wss.sendData(encode_data);
        }
    }

    /**
     * 暂时有不少 通过 on('close', 设置的函数没有使用这里 只执行一次函数然后被删除
     * @param close
     */
    public setClose(close: Function) {
        this._close.push(close);
    }
}


export class WsServer {
    private _wss;

    constructor(wss: WebSocket.Server) {
        this._wss = wss;
    }

    public start(check: (token?:string) => Promise<boolean>) {
        // 监听客户端连接事件
        this._wss.on('connection', async function connection(ws: WebSocket,request) {
            try {
                // 解析查询参数
                const parsedUrl = url.parse(request.url, true); // 使用 'true' 参数解析查询字符串
                const { query } = parsedUrl; // 解析后的查询参数对象
                const token = query['token']
                if (!await check(token)) {
                    ws.close();
                    console.log('未验证的ws请求')
                    return;
                }
                if (query['type'] === `${WsConnectType.data}`) {
                    // routerHandlerMap.get(CmdType.connection)!(ws,token);
                    const wss = new Wss(ws);
                    allWssSet.add(wss);
                    wss.token = token;
                    let closed = false;
                    const close = ()=>{
                        if(closed) return
                        closed = true;
                        allWssSet.delete(wss);
                        ws.close()
                        for (const fn  of wss._close??[]) {
                            try {
                                fn ();
                            } catch (e) {
                                console.error('关闭函数', e)
                            }
                        }
                        clearInterval(wss.heart_interval)
                    }
                    wss.heart_interval = setInterval(() => {
                        if(Date.now() -wss.heart_time_stamp > max_heart_interval) {
                            console.log('ws心跳断开')
                            close()
                        }
                    },heart_interval)
                    // 监听客户端发送的消息
                    ws.on('message', async function incoming(message: WebSocket.Data) {
                        const data = WsData.decode(message);
                        data.wss = wss;
                        wss.heart_time_stamp = Date.now();
                        if(data.cmdType === CmdType.heart) {
                            wss.sendData(new WsData(data.cmdType, {},undefined,data.random_id).encode());
                            return;
                        }
                        const handle = routerHandlerMap.get(data.cmdType);
                        if (handle) {
                            try {
                                const rsq: string = await handle(data);
                                // 发送消息给客户端
                                wss.sendData(new WsData(data.cmdType, rsq,undefined,data.random_id).encode());
                            } catch (e) {
                                console.log(e)
                                const p = new WsData(data.cmdType);
                                p.code = RCode.Fail;
                                p.message = JSON.stringify(e)
                                p.random_id = data.random_id;
                                wss.sendData(p.encode());
                            }
                        } else {
                            console.log("没有匹配到路由")
                        }

                    });
                    // 监听客户端断开连接事件
                    wss.ws.on('close',()=> {
                        // console.log('ws客户端断开');
                        close()
                    });

                } else if (query['type'] === `${WsConnectType.other}`) {
                    const handler = otherRouterHandlerMap.get(parseInt(query['code']));
                    if (handler) {
                        handler(ws,query); // query中有token了
                    }else {
                        console.log('没找到对应路径')
                    }
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
