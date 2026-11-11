import {CmdType, WsData} from "./WsData";
import {RCode} from "../Result.pojo";
import {heart_interval} from "./constant";

/** 心跳多久没收到服务端任何消息就认为连接已死 */
const HEART_DEAD_MS = heart_interval * 2;

/**
 * 一条 WebSocket 连接的完整生命周期。
 *
 * 连接状态、socket、心跳定时器、待响应请求都归它独占管理：
 * 销毁后该对象不再持有任何定时器或监听，也不会再改动外部状态。
 * WsClient 只负责「当前用哪个 WsConnection」，重建时直接丢弃旧的建新的，
 * 不再靠一堆 if 判断哪个回调属于哪条连接。
 */
export class WsConnection {
    readonly socket: WebSocket;
    /** 本条连接专用的待响应请求，连接销毁时统一失败，不会污染下一条连接 */
    private _pending = new Map<string, {resolve: (v: any) => void; reject: (e: any) => void; timer: any}>();
    private _heart_timer: any = null;
    /** 最近一次收到服务端消息的时间，用于判断心跳是否已死 */
    private _last_recv_at = Date.now();
    private _closed = false;

    constructor(url: string,
                private _on_message: (conn: WsConnection, data: WsData<any>) => void,
                private _on_close: (conn: WsConnection) => void) {
        this.socket = new WebSocket(url);
        this.socket.binaryType = "arraybuffer";
        this.socket.addEventListener("message", (event) => this.handle_raw(event.data));
        this.socket.addEventListener("open", () => this.start_heart());
        this.socket.addEventListener("close", (e) => this.handle_close(e));
        this.socket.addEventListener("error", () => {
            // 交给 close 统一处理，这里只记录
            console.error("WS 错误", url);
        });
    }

    /** 是否可用（已打开且未销毁） */
    get alive() {
        return !this._closed && this.socket.readyState === WebSocket.OPEN;
    }

    get closed() {
        return this._closed;
    }

    /** 等待连接打开，已打开立即返回 */
    wait_open(timeout_ms = 8000): Promise<void> {
        if (this.alive) {
            return Promise.resolve();
        }
        if (this._closed) {
            return Promise.reject(new Error("WS 连接已关闭"));
        }
        return new Promise((resolve, reject) => {
            const done = (fn: () => void) => {
                clearTimeout(timer);
                this.socket.removeEventListener("open", on_open);
                this.socket.removeEventListener("close", on_close);
                fn();
            };
            const on_open = () => done(resolve);
            const on_close = () => done(() => reject(new Error("WS 连接失败")));
            const timer = setTimeout(() => {
                done(() => reject(new Error("WS 连接超时")));
            }, timeout_ms);
            this.socket.addEventListener("open", on_open);
            this.socket.addEventListener("close", on_close);
        });
    }

    /** 发送原始数据，未打开时直接失败，不排队也不触发重连 */
    send_raw(data: any) {
        if (!this.alive) {
            throw new Error("WS 未连接");
        }
        this.socket.send(data);
    }

    /** 发一条带 random_id 的请求并等待服务端同 id 的响应 */
    request(message: WsData<any>, timeout_ms = 6000): Promise<WsData<any>> {
        return new Promise((resolve, reject) => {
            try {
                const key = message.random_id;
                const timer = setTimeout(() => {
                    this._pending.delete(key);
                    reject(new Error(`WS 请求超时: ${message.cmdType}`));
                }, timeout_ms);
                this._pending.set(key, {resolve, reject, timer});
                this.send_raw(message.encode());
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 服务端响应到达时，按 random_id 兑现等待中的请求 */
    resolve_pending(random_id: string, data: WsData<any>) {
        const item = this._pending.get(random_id);
        if (!item) {
            return;
        }
        clearTimeout(item.timer);
        this._pending.delete(random_id);
        item.resolve(data);
    }

    /** 主动销毁：清理心跳、失败所有挂起请求、关闭 socket */
    destroy(reason = "closed") {
        if (this._closed) {
            return;
        }
        this._closed = true;
        this.stop_heart();
        for (const [, item] of this._pending) {
            clearTimeout(item.timer);
            item.reject(new Error(`WS 连接关闭: ${reason}`));
        }
        this._pending.clear();
        try {
            this.socket.close();
        } catch (e) {
            // 已关闭，忽略
        }
    }

    private start_heart() {
        this.stop_heart();
        this._last_recv_at = Date.now();
        this._heart_timer = setInterval(() => {
            if (!this.alive) {
                return;
            }
            // 超过两倍心跳间隔没收到任何消息，认为连接已死，交给 close 事件重连
            if (Date.now() - this._last_recv_at > HEART_DEAD_MS) {
                console.warn("WS 心跳超时，主动断开");
                this.destroy("heart timeout");
                this._on_close(this);
                return;
            }
            try {
                const data = new WsData(CmdType.heart);
                data.context = {};
                this.send_raw(data.encode());
            } catch (e) {
                // 发送失败交给 close 事件
            }
        }, heart_interval);
    }

    private stop_heart() {
        if (this._heart_timer !== null) {
            clearInterval(this._heart_timer);
            this._heart_timer = null;
        }
    }

    private async handle_raw(raw: any) {
        try {
            let event_data = raw;
            if (event_data instanceof Blob) {
                event_data = new Uint8Array(await event_data.arrayBuffer());
            } else if (event_data instanceof ArrayBuffer) {
                event_data = new Uint8Array(event_data);
            }
            if (this._closed) {
                return;
            }
            this._last_recv_at = Date.now();
            const data = WsData.decode(event_data);
            data.client_wss = this.socket as any;
            if (data.code === RCode.Fail) {
                this._on_message(this, data);
                return;
            }
            this.resolve_pending(data.random_id, data);
            this._on_message(this, data);
        } catch (err: any) {
            console.error("WS 消息错误", err?.message ?? err);
        }
    }

    private handle_close(event: CloseEvent) {
        const was_closed = this._closed;
        this._closed = true;
        this.stop_heart();
        for (const [, item] of this._pending) {
            clearTimeout(item.timer);
            item.reject(new Error("WS 连接已断开"));
        }
        this._pending.clear();
        if (!was_closed) {
            this._on_close(this);
        }
    }
}
