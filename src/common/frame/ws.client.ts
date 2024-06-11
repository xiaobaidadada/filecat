import {CmdType, WsData} from "./WsData";


export class WsClient {
    private  _socket;
    private _url;
    // 0 是未连接
    private  _status = 0;
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
            const unConnect =()=> {
                this._status = 0;
                if (this._subscribeUnconnect) {
                    this._subscribeUnconnect();
                }
            }
            const open = async (event) => {
                resolve(true);
                console.log('ws连接成功');
                // 身份验证发送
                if (this._authHandle) {
                    this._authHandle(this._socket)
                }
                this._status = 1;
            }
            const message = (event:MessageEvent)=>{
                const data = WsData.decode(event.data.toString());
                data.wss = this._socket;
                const fun = this._msgHandlerMap.get(data.cmdType)
                if (fun) {
                    fun(data);
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
        this._socket!.send(wsData.encode())
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
            this._socket.close();
        }
        this._status = 0;
    }

    public async  addMsg<T>(cmdType: CmdType,handler:(wsData:WsData<T>)=>void) {
        this._msgHandlerMap.set(cmdType,handler)
    }

}
