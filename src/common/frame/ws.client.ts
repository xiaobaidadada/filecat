import {CmdType, protocolIsProto2, WsConnectType, WsData} from "./WsData";
import * as parser from "socket.io-parser"
import {RCode} from "../Result.pojo";
import {NotyFail} from "../../web/project/util/noty";

const decoder = new parser.Decoder();

export class WsClient {
    private  _socket;
    private _url;
    // 0 是未连接
    private  _status = 0;
    private _self_close  = false;
    private _authHandle;
    private _subscribeUnconnect;
    private _promise;

    private _msgHandlerMap = new Map();
    private _msgResolveMap = new Map();
    private _msgResolveTimeoutMap = new Map();

    handMsg(cmdType: CmdType,data : WsData<any>) {
        // console.log(data)
        if(data.code === RCode.Fail) {
            NotyFail(data.message);
        }
        const resolve = this._msgResolveMap.get(data.cmdType)
        if (resolve) {
            resolve(data);
            this._msgResolveMap.delete(data.cmdType)
        }
        const timeout = this._msgResolveTimeoutMap.get(cmdType);
        if(timeout) {
            clearTimeout(timeout);
            this._msgResolveTimeoutMap.delete(cmdType);
        }
        const fun = this._msgHandlerMap.get(data.cmdType)
        if (fun) {
            fun(data);
        }

    }

    constructor(url:string,authHandle:(socket:WebSocket)=>void) {
        this._url = url;
        this._authHandle = authHandle;
    }



    public async connect():Promise<boolean> {
        const handle = (resolve)=>{
            if (this._status !==0) {
                resolve(true);
                return;
            }
            const unConnect =()=> {
                this._status = 0;
                decoder.removeAllListeners();
                decoder.destroy();
                if (this._subscribeUnconnect && !this._self_close) {
                    this._subscribeUnconnect();
                }
                this._self_close = false;
            }
            const open = async (event) => {
                console.log('ws连接成功');
                // 身份验证发送
                if (this._authHandle) {
                    this._authHandle(this._socket)
                }
                this._status = 1;
                resolve(true);
                decoder.on("decoded",(d)=>{
                    const data = new WsData(d.data[0],d.data[1]);
                    data.code = d.data[2];
                    data.message = d.data[3];
                    data.wss = this._socket;
                    this.handMsg(data.cmdType,data);
                })
            }
            let dataList = [];
            let processing = false;
            const handleData = async (rowData)=>{
                if (protocolIsProto2) {
                    const data = WsData.decode(rowData);
                    data.wss = this._socket;
                    this.handMsg(data.cmdType,data);
                } else {
                    decoder.add(rowData);
                }
                handle();
            }
            const handle = ()=>{
                if (dataList.length === 0) {
                    processing = false;
                    return;
                }
                processing = true;
                const data = dataList.shift();
                if (data instanceof ArrayBuffer) {
                    // 处理 ArrayBuffer 数据
                    handleData(new Uint8Array(data))
                } else if (data instanceof Blob) {
                    // 处理 Blob 数据
                    // 例如，将 Blob 转换为 ArrayBuffer
                    const reader = new FileReader();
                    reader.onload = async function() {
                        handleData(new Uint8Array(reader.result as ArrayBuffer ));
                    };
                    reader.readAsArrayBuffer(data);
                } else {
                    // 处理其他类型的数据，例如字符串
                    handleData(data)
                }
            }
            const message = async (event:MessageEvent)=>{
                dataList.push(event.data);
                if (!processing) {
                    handle();
                }
            }
            if (!this.isAilive()) {
                // 创建 WebSocket 连接
                const socket = new WebSocket(`ws://${this._url}?token=${localStorage.getItem("token")}&type=${WsConnectType.data}`);
                // 监听连接成功事件
                socket.addEventListener('open', open);

                // 监听接收消息事件
                socket.addEventListener('message', message);

                // 监听连接关闭事件
                socket.addEventListener('close', async function (event) {
                    console.log('Disconnected from WebSocket server');
                    await unConnect()
                });

                // 监听连接错误事件
                socket.addEventListener('error', function (event) {
                    console.error('WebSocket error:', event);
                    unConnect();
                });
                this._socket = socket;
            } else {
                resolve(true);
            }
        }
        return new Promise<boolean>(handle);

    }

    public async sendData(cmdType: CmdType,context: any) {
        const wsData = new WsData(cmdType);
        wsData.context = context;
        return this.send(wsData);
    };


    public async send(wsData:WsData<any>):Promise<WsData<any>> {
        if (this._promise) {
            await this._promise;
            this._promise = null;
        }
        await this.connect()
        const data = wsData.encode();
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                this._socket!.send(data[i]);
            }
        } else {
            this._socket!.send(data);
        }
        return new Promise((resolve,reject)=>{
            const timeout = setTimeout(()=>{
                resolve(null);
                console.log('ws超时',wsData.cmdType)
            },1000 * 6);
            this._msgResolveMap.set(wsData.cmdType,resolve);
            this._msgResolveTimeoutMap.set(wsData.cmdType,timeout);
        })
    }
    // 可以作为锁，控制两个路由之前的跳转处理函数的先后顺序
    public setPromise(fun:(resolve)=>void) {
        this._promise = new Promise(async (resolve)=>{
            await fun(resolve);
        })
    }

    public isAilive() {
        if (this._status === 1 && !!this._socket && this._socket.readyState===WebSocket.OPEN) {
            return true;
        }
        return false;
    }

    public subscribeUnconnect(handle:()=>void) {
        this._subscribeUnconnect = handle;
    }
    public unSubscribeUnconnect() {
        this._subscribeUnconnect = null;
    }
    public async unConnect() {
        if (this.isAilive()) {
            console.log('主动关闭客户端')
            this._self_close = true;
            this._socket.close();
        }
        this._status = 0;
    }

    // 多次add相同的 key 只会add一次
    public async  addMsg<T>(cmdType: CmdType,handler:(wsData:WsData<T>)=>void) {
        this._msgHandlerMap.set(cmdType,handler)
    }

    public removeMsg<T>(cmdType: CmdType) {
        this._msgHandlerMap.delete(cmdType)
    }

    public static getOtherWebSocket(code:CmdType) {
        return new WebSocket(`ws://${window.location.host}?token=${localStorage.getItem("token")}&type=${WsConnectType.other}&code=${code}`);
    }

    public static getOtherWebSocketUrl(code:CmdType,query:{[key: string]: string}) {
        let url  = `ws://${window.location.host}?token=${localStorage.getItem("token")}&type=${WsConnectType.other}&code=${code}`;
        for (const key of Object.keys(query)) {
            url += `&${key}=${encodeURIComponent(query[key])}`;
        }
        return url;
    }
}
