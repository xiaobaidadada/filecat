import {CmdType, protocolIsProto2, WsConnectType, WsData} from "./WsData";
import {RCode} from "../Result.pojo";
import {NotyFail} from "../../web/project/util/noty";
// import WebSocket from 'ws'; // 前端不能导入，直接使用就行 这只能nodejs用
import {EventEmitter} from "../event";
import {heart_interval} from "./constant";
import {CommonUtil} from "../common.util";

function generateRandomHash(length = 16) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let hash = '';
    for (let i = 0; i < length; i++) {
        hash += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return hash;
}

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

interface WsClientEvents {
    // {1} 是 cmdType 类型
    [key: `message_${number}`]: (data: WsData<any>) => void;

    // 所有类型的事件
    message: (data: WsData<any>) => void;
    close: () => void;
}

export class WsClient {

    private name;
    private _socket: WebSocket;
    // 外部传进来的函数，每次都会变 变了就重新请求
    private _url: string | (() => string);
    /** 当前连接的完整地址，用于判断地址变化后是否需要重建 */
    private _connected_url = "";

    private _msg_event: EventEmitter = new EventEmitter();
    private _msgResolveMap = new Map();
    private _msgResolveTimeoutMap = new Map();
    private _heart_interval: any;


    constructor(url: string | (() => string), name?: string) {
        this._url = url;
        this.name = name;
    }

    private get_url(): string {
        return typeof this._url === 'function' ? this._url() : this._url;
    }


    private _connecting: Promise<boolean> | null = null;

    public async connect(): Promise<boolean> {
        // url 可能已带 query（如挂载转发带 tcp_client_num_id），需用 & 续接
        const connect_path = this.get_url();
        const separator = connect_path.includes('?') ? '&' : '?';
        const token = localStorage.getItem("token");
        const target_url = `${protocol}//${connect_path}${separator}token=${token}&type=${WsConnectType.data}`;
        // 地址变了（如切换到转发到对端的挂载目录）就丢弃旧连接重建
        if (this._socket && this._connected_url !== target_url) {
            const old = this._socket;
            this._socket = null;
            this._connected_url = "";
            this._connecting = null;
            try {
                old.close();
            } catch (e) {
            }
        }
        if (this._socket?.readyState === WebSocket.OPEN) {
            return true;
        }
        // 同一地址正在连接中，复用同一个 Promise，避免并发 connect 互相掐断
        if (this._connecting && this._connected_url === target_url) {
            return this._connecting;
        }
        this._connected_url = target_url;
        this._connecting = this.open_socket(target_url);
        return this._connecting;
    }

    private open_socket(target_url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new WebSocket(target_url);
            this._socket = socket;
            socket.binaryType = "arraybuffer";

            socket.addEventListener('open', () => {
                resolve(true);
                this.start_heart_interval()
            });
            const hand_data = (event_data: any) => {
                const data = WsData.decode(event_data);
                data.client_wss = socket
                if (data.code === RCode.Fail) {
                    NotyFail(data.message);
                }
                if (this._msgResolveMap.has(data.random_id)) {
                    clearTimeout(this._msgResolveTimeoutMap.get(data.random_id));
                    this._msgResolveTimeoutMap.delete(data.random_id);
                    this._msgResolveMap.get(data.random_id)(data);
                    this._msgResolveMap.delete(data.random_id);
                }

                this.emit_message('message', data);
                this.emit_message(`message_${data.cmdType}`, data);
            }
            socket.addEventListener('message', async (event) => {
                try {
                    let event_data = event.data;
                     if (event_data instanceof Blob) {
                        // 处理 Blob 数据
                        // 例如，将 Blob 转换为 ArrayBuffer
                        event_data = await event_data.arrayBuffer()
                        event_data = new Uint8Array(event_data)
                    } else if (event_data instanceof ArrayBuffer) {
                         // 处理 ArrayBuffer 数据
                         event_data = new Uint8Array(event_data)
                     }
                    hand_data(event_data)
                } catch (err: any) {
                    console.error('WS 消息错误', err?.message ?? err);
                }
            });

            socket.addEventListener('close', (event) => {
                console.log(`WS 已断开: ${this.get_url()}`, event.code, event.reason);
                // 只在当前连接就是自己时清空，避免旧连接的 close 把新连接清掉
                if (this._socket === socket) {
                    this._socket = null;
                    this._connected_url = "";
                    this._connecting = null;
                    this.stop_heart_interval()
                }
                resolve(false);
                this.emit_message('close');
            });

            socket.addEventListener('error', (event) => {
                console.error('WS 错误', event);
            });
        });
    }

    private start_heart_interval() {
        this._heart_interval = setInterval(() => {
            this.sendData(CmdType.heart,{})
        },heart_interval)
    }
    private stop_heart_interval() {
        clearInterval(this._heart_interval)
    }


    public async sendData(cmdType: CmdType, context: any, set_random_id?: boolean) {
        const wsData = new WsData(cmdType);
        wsData.context = context;
        if (set_random_id) {
            wsData.random_id = generateRandomHash(9);
        }
        return this.send(wsData);
    };


    public async send<T = any>(message: WsData<any>): Promise<WsData<T>> {
        if (!this._socket) {
            await this.connect();
        }
        if (this._socket.readyState !== WebSocket.OPEN) {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('WS 连接超时')), 5000);
                const handleOpen = () => {
                    clearTimeout(timeout);
                    this._socket!.removeEventListener('open', handleOpen);
                    resolve();
                };
                this._socket!.addEventListener('open', handleOpen);
            });
        }
        return new Promise<any>((resolve, reject) => {
            try {
                message.random_id = generateRandomHash(9)
                const key = message.random_id;
                const timeout = setTimeout(() => {
                    reject(false);
                    console.info('ws超时', message.cmdType)
                    this._msgResolveMap.delete(key);
                }, 1000 * 6);
                this._msgResolveMap.set(key, resolve);
                this._msgResolveTimeoutMap.set(key, timeout);
                this._socket.send(message.encode());
            } catch (err) {
                reject(err);
            }
        })
    }


    public subscribeUnconnect(handle: () => void) {
        this.on_message('close', handle)
    }

    // 没有必要手动关闭 刷新页面就关闭了
    /** 手动关闭 WS，不触发自动重连 */
    public async close() {
        if (!this._socket) return;
        const socket = this._socket;
        this._socket = null;
        this._connected_url = "";
        this._connecting = null;
        this.stop_heart_interval()
        socket.close();
        // this.stop_heartbeat()
    }

    /** 地址或 token 变化后重建连接（如切换挂载目录、开启转发到对端） */
    public async reconnect() {
        await this.close();
        return this.connect();
    }

    // 多次add相同的 key 只会add一次
    public async addMsg<T>(cmdType: CmdType, handler: (wsData: WsData<T>) => void) {
        await this.connect();
        // this._msgHandlerMap.set(cmdType,handler)
        this.on_message(`message_${cmdType}`, handler)
    }

    public removeMsg<T>(cmdType: CmdType) {
        // this._msgHandlerMap.delete(cmdType)
        this._msg_event.off_all(`message_${cmdType}`);
    }

    public on_message<K extends keyof WsClientEvents>(message: K, listener: WsClientEvents[K]) {
        this._msg_event.on(message, listener)
    }

    public on_once_message<K extends keyof WsClientEvents>(message: K, listener: WsClientEvents[K]) {
        this._msg_event.once(message, listener)
    }

    public off_message<K extends keyof WsClientEvents>(message: K, listener: WsClientEvents[K]) {
        this._msg_event.off(message, listener)
    }

    private emit_message<K extends keyof WsClientEvents>(
        message: K,
        ...args: Parameters<WsClientEvents[K]>
    ) {
        // 举例：调用 EventEmitter
        this._msg_event.emit(message, ...args);
    }

    public static getOtherWebSocket(code: CmdType) {
        return new WebSocket(`${protocol}//${window.location.host + window.location.pathname}?token=${localStorage.getItem("token")}&type=${WsConnectType.other}&code=${code}`);
    }

    public static getOtherWebSocketUrl(code: CmdType, query: { [key: string]: string }) {
        let url = `${protocol}//${window.location.host + window.location.pathname}?token=${localStorage.getItem("token")}&type=${WsConnectType.other}&code=${code}`;
        for (const key of Object.keys(query)) {
            url += `&${key}=${encodeURIComponent(query[key])}`;
        }
        return url;
    }
}
