import {CmdType, WsConnectType, WsData} from "./WsData";
import {RCode} from "../Result.pojo";
import {NotyFail} from "../../web/project/util/noty";
import {EventEmitter} from "../event";
import {WsConnection} from "./ws.connection";

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

/**
 * WebSocket 客户端：负责消息订阅分发和「当前用哪条连接」。
 *
 * 连接本身（socket、心跳、待响应请求）全部由 WsConnection 独占管理。
 * 重建连接就是：销毁旧的 WsConnection，新建一个。
 * 这样旧连接的任何迟到回调都只会在自己的对象上执行，不会污染新连接。
 */
export class WsClient {

    private name;
    // 外部传进来的函数，每次都会变 变了就重新请求
    private _url: string | (() => string);

    private _msg_event: EventEmitter = new EventEmitter();
    /** 当前生效的连接；重建时整体替换 */
    private _conn: WsConnection | null = null;
    /** 当前连接对应的完整地址，用于判断是否需要重建 */
    private _conn_url = "";
    /** 正在建立的连接的地址与 Promise，并发 connect 共用同一个过程 */
    private _connecting_url = "";
    private _connecting: Promise<WsConnection> | null = null;


    constructor(url: string | (() => string), name?: string) {
        this._url = url;
        this.name = name;
    }

    private get_url(): string {
        return typeof this._url === 'function' ? this._url() : this._url;
    }

    /** 拼出带 token 的完整地址，地址变化即代表需要重建连接 */
    private build_target_url(): string {
        // url 可能已带 query（如挂载转发带 tcp_client_num_id），需用 & 续接
        const connect_path = this.get_url();
        const separator = connect_path.includes('?') ? '&' : '?';
        const token = localStorage.getItem("token");
        return `${protocol}//${connect_path}${separator}token=${token}&type=${WsConnectType.data}`;
    }

    public async connect(): Promise<boolean> {
        try {
            await this.ensure_conn();
            return true;
        } catch (e) {
            return false;
        }
    }

    /** 拿到一条可用连接，必要时新建 */
    private ensure_conn(): Promise<WsConnection> {
        const target_url = this.build_target_url();
        // 地址没变且连接还活着，直接复用
        if (this._conn && !this._conn.closed && this._conn_url === target_url) {
            return Promise.resolve(this._conn);
        }
        // 同一地址正在建立中，复用同一个 Promise。
        // 这里必须用独立的 _connecting_url 判断：_conn_url 会被 drop_conn 清空，
        // 用它判断会导致后到的调用误以为要重建，把正在建立的连接丢掉
        if (this._connecting && this._connecting_url === target_url) {
            return this._connecting;
        }
        // 地址变了或者连接已死，丢弃旧的建新的
        this.drop_conn();
        this._connecting_url = target_url;
        this._connecting = this.create_conn(target_url).finally(() => {
            this._connecting = null;
            this._connecting_url = "";
        });
        return this._connecting;
    }

    private async create_conn(target_url: string): Promise<WsConnection> {
        const conn = new WsConnection(
            target_url,
            (c, data) => this.dispatch(c, data),
            (c) => this.handle_conn_close(c),
        );
        try {
            await conn.wait_open();
        } catch (e) {
            conn.destroy("open failed");
            throw e;
        }
        // 打开成功后才登记为当前连接，避免建立过程中被并发调用 drop_conn 销毁
        this._conn = conn;
        this._conn_url = target_url;
        return conn;
    }

    /** 丢弃当前连接（不影响新建中的连接 Promise） */
    private drop_conn() {
        const old = this._conn;
        this._conn = null;
        this._conn_url = "";
        if (old && !old.closed) {
            old.destroy("replaced");
        }
    }

    /** 连接被动断开（服务端关闭、心跳超时、网络错误） */
    private handle_conn_close(conn: WsConnection) {
        // 只有当前连接断开才需要通知外部并清空；旧连接迟到的 close 直接忽略
        if (this._conn !== conn) {
            return;
        }
        this._conn = null;
        this._conn_url = "";
        this.emit_message('close');
    }

    /** 收到服务端数据：先兑现等待中的请求，再广播给订阅者 */
    private dispatch(conn: WsConnection, data: WsData<any>) {
        if (data.code === RCode.Fail) {
            NotyFail(data.message);
        }
        this.emit_message('message', data);
        this.emit_message(`message_${data.cmdType}`, data);
    }


    public async sendData(cmdType: CmdType, context: any, set_random_id?: boolean) {
        const wsData = new WsData(cmdType);
        wsData.context = context;
        if (set_random_id) {
            wsData.random_id = generateRandomHash(9);
        }
        return this.send(wsData);
    };

    /**
     * 单向发送：只把消息发出去，不等待服务端回包。
     * 用于通知类消息（如取消操作），这类请求后端不会回包，
     * 走 send() 只会白白等满超时。
     */
    public async sendNotify(cmdType: CmdType, context: any) {
        const wsData = new WsData(cmdType);
        wsData.context = context;
        wsData.random_id = generateRandomHash(9);
        // 同 send：连接可能在 ensure_conn 之后立刻断开，重试一次
        for (let attempt = 0; ; attempt++) {
            const conn = await this.ensure_conn();
            try {
                conn.send_raw(wsData.encode());
                return;
            } catch (e) {
                if (attempt === 0 && !conn.alive) {
                    continue;
                }
                throw e;
            }
        }
    }


    /**
     * 发请求并等待同 random_id 的回包。
     *
     * ensure_conn 返回后连接仍可能在这两步之间断开（例如切换目录导致
     * WS 地址变化、连接被重建），此时直接发会抛「WS 未连接」。
     * 这类失败统一重试一次：重试时 ensure_conn 会建一条新连接。
     */
    public async send<T = any>(message: WsData<any>): Promise<WsData<T>> {
        message.random_id = generateRandomHash(9);
        for (let attempt = 0; ; attempt++) {
            const conn = await this.ensure_conn();
            try {
                return await conn.request(message) as WsData<T>;
            } catch (e: any) {
                // 连接在发送瞬间已断开，且还有重试机会 → 重建后重发
                if (attempt === 0 && !conn.alive) {
                    continue;
                }
                throw e;
            }
        }
    }


    public subscribeUnconnect(handle: () => void) {
        this.on_message('close', handle)
    }

    // 没有必要手动关闭 刷新页面就关闭了
    /** 手动关闭 WS，不触发自动重连 */
    public async close() {
        this.drop_conn();
    }

    /** 地址或 token 变化后重建连接（如切换挂载目录、开启转发到对端） */
    public async reconnect() {
        this.drop_conn();
        return this.connect();
    }

    // 多次add相同的 key 只会add一次
    public async addMsg<T>(cmdType: CmdType, handler: (wsData: WsData<T>) => void) {
        // 先注册监听再建连接，避免推送先于监听到达被丢弃
        this.on_message(`message_${cmdType}`, handler)
        await this.connect();
    }

    public removeMsg<T>(cmdType: CmdType) {
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
