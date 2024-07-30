import {CmdType, protocolIsProto2, WsData} from "./WsData";
import * as parser from "socket.io-parser"

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
                    data.wss = this._socket;
                    const fun = this._msgHandlerMap.get(data.cmdType)
                    if (fun) {
                        fun(data);
                    }
                })
            }
            let dataList = [];
            let processing = false;
            const handleData = async (rowData)=>{
                if (protocolIsProto2) {
                    const data = WsData.decode(rowData);
                    data.wss = this._socket;
                    const fun = this._msgHandlerMap.get(data.cmdType)
                    if (fun) {
                        fun(data);
                    }
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
                const socket = new WebSocket(`ws://${this._url}`);
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
                    unConnect()
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


    public async send(wsData:WsData<any>) {
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
        new Promise((resolve)=>{
            this._msgHandlerMap.set(wsData.cmdType,resolve);
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
            this._self_close = true;
            this._socket.close();
        }
        this._status = 0;
    }

    public async  addMsg<T>(cmdType: CmdType,handler:(wsData:WsData<T>)=>void) {
        this._msgHandlerMap.set(cmdType,handler)
    }

}
