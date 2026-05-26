import { tcp_client_options } from "./type";
import net from "net";
import { tcp_stream_util } from "./tcp_stream_util";
import { msgClientMap, NetMsgType, NetUtil } from "./NetUtil";
import { net_timeout, NetClientUtil } from "./NetClientUtil";
import { withLock } from "../../../../common/fun.util";
import { CommonUtil } from "../../../../common/common.util";

export class tcp_raw_socket {
    protected client: tcp_stream_util;
    protected is_connected = false;

    public data_map: {
        [key: string]: any,
        server_port?: number;
        server_ip?: string;
    } = {};

    constructor(socket?: net.Socket) {
        this.client = new tcp_stream_util(socket ?? new net.Socket());
        if (socket) {
            this.is_connected = true;
        }
        this.client.set_on_close(() => {
            this.is_connected = false;
        });
        this.client.get_socket().on("close", () => {
            this.is_connected = false;
        });
        this.client.get_socket().on("connect", () => {
            this.is_connected = true;
        });
        this.send_data = this.client.send_data.bind(this.client);
        this.send_data_call = (tag_id: number, buffer: Buffer) => {
            this.client.send_data(NetMsgType.default, buffer, tag_id);
        };
        this.send_data_async = this.client.send_data_async.bind(this.client);
    }

    get_client() {
        return this.client;
    }

    get connected() {
        if (!this.client?.get_socket()) {
            return false;
        }
        return this.is_connected;
    }

    on_close(fun: () => void) {
        this.client.set_on_close(() => {
            try {
                fun();
            } catch (e) {
                console.error(`函数错误 ${e?.message ?? e}`);
            }
        });
    }

    remove_on_close(fun: () => void) {
        this.client.remove_on_close(fun);
    }

    on_connect(fun: () => void) {
        this.client.get_socket().on("connect", () => {
            try {
                fun();
            } catch (e) {
                console.error(`函数错误 ${e?.message ?? e}`);
            }
        });
    }

    send_data: (code_type: NetMsgType, buffer: Buffer, tag_id?: number) => boolean;
    send_data_call: (tag_id: number, buffer: Buffer) => void;
    send_data_async: (code_type: NetMsgType, buffer: Buffer) => Promise<{ code: NetMsgType, tcpBuffer: Buffer }>;
}

export class tcp_raw_client extends tcp_raw_socket {
    private options: tcp_client_options;
    private closed = false;

    constructor(options: tcp_client_options) {
        super();
        this.options = options;
        this.data_map.server_port = options.server_port;
        this.data_map.server_ip = options.server_host;

        // ⭐ 移除底层的自动重连机制，让上层统一调度控制
    }

    close() {
        this.closed = true;
        this.is_connected = false;
        this.client?.close();
    }

    private async raw_connect() {
        if (this.is_connected) return;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`tcp 客户端 连接超时 ${this.options.server_host}  ${this.options.server_port}`));
            }, 5_000);

            this.client.get_socket().connect(this.options.server_port, this.options.server_host, () => {
                clearTimeout(timeout);
                this.is_connected = true;
                resolve(true);
            });

            // 监听错误，防止未连接前发生 Error 崩溃
            this.client.get_socket().once("error", (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    async connect() {
        try {
            await this.raw_connect();
        } catch (e) {
            this.close();
            throw e;
        }
    }
}

export class tcp_client {
    private client: tcp_raw_client;
    private heart_fun: NodeJS.Timeout;
    private reconnect_timeout: NodeJS.Timeout; // ⭐ 由上层接管重连句柄
    private call_resolve_map: { [key: number]: any } = {};
    private call_resolve_timeout_map: { [key: number]: any } = {};
    private options: tcp_client_options;
    private register: () => any;
    private msg_map: Partial<{
        [M in NetMsgType]: (data: Buffer, util: tcp_raw_socket, tag_id?: number) => void
    }>;
    private is_manually_closed = false; // 用户是否主动调用了 close

    constructor(options: tcp_client_options, register: () => any) {
        this.msg_map = {
            ...msgClientMap,
            ...options.msg_map
        };
        this.register = register;
        this.options = options;
    }

    public get_raw_client() {
        return this.client;
    }

    public send_data(code_type: NetMsgType, buffer: Buffer, tag_id?: number): boolean {
        if (!this.client || !this.client.connected) {
            return false;
        }
        return this.client.send_data(code_type, buffer, tag_id);
    }

    close() {
        this.is_manually_closed = true;
        clearInterval(this.heart_fun);
        clearTimeout(this.reconnect_timeout);
        this.reconnect_timeout = null;
        this.client?.close();
    }

    // ⭐ 统一且唯一的调度重连入口
    private scheduleReconnect() {
        if (this.options.not_reconnect_attempt || this.is_manually_closed) {
            return;
        }
        if (this.reconnect_timeout) {
            return; // 已经在等待重连中，不再挂载重复定时器
        }

        // console.log("TCP 链路已断开，3秒后尝试建立新连接并重新注册...");
        this.reconnect_timeout = setTimeout(async () => {
            this.reconnect_timeout = undefined;
            if (this.is_manually_closed) return;

            try {
                await this.raw_connect();
            } catch (e) {
                // console.error(`重连或注册失败，继续等待下次重试: ${e?.message ?? e}`);
                this.scheduleReconnect(); // 失败进入下一次循环
            }
        }, 3 * 1000);
    }

    private async raw_connect() {
        if (this.client?.connected) return;

        // 清理老旧实例
        if (this.client) {
            this.client.close();
        }

        this.client = new tcp_raw_client(this.options);

        // ⭐ 监听连接被服务器主动踢掉、或者网络突发故障断开的情况
        this.client.on_close(() => {
            console.log(`tcp 被服务器踢掉 ${this.options.server_host}  ${this.options.server_port}`);
            this.scheduleReconnect();
        });

        await this.client.connect();
        const client = this.client;

        client.get_client().add_on_data(async (data, tag_id) => {
            const { code, tcpBuffer } = NetUtil.getTcpData(data);
            if (this.call_resolve_map[tag_id]) {
                this.call_resolve_map[tag_id](tcpBuffer);
                clearTimeout(this.call_resolve_timeout_map[tag_id]);
                delete this.call_resolve_timeout_map[tag_id];
                delete this.call_resolve_map[tag_id];
                return;
            }
            const fun = this.msg_map[code];
            if (!fun) return;
            try {
                await fun(tcpBuffer, client, tag_id);
            } catch (e) {
                console.error(`tcp客户端接受函数报错 ${e?.message ?? e}`);
            }
        });

        // ⭐ 核心重点：每次物理重连成功后，都必须要执行注册业务，恢复远端路由信息
        await this.register();
        // console.log("TCP 物理连接完成，业务注册成功！");
    }

    async connect() {
        this.is_manually_closed = false;
        if (this.client) {
            this.close();
        }

        await this.raw_connect();

        // 维持原有的心跳带锁检测机制
        const heart_fun = withLock(async () => {
            try {
                await this.send_data_async(NetMsgType.heart, Buffer.alloc(0));
            } catch (e) {
                if (this.options.not_reconnect_attempt) {
                    return;
                }
                console.log(`心跳超时，主动斩断当前失效连接，触发重连机制...`);
                this.client?.close(); // 这里 close 会触发绑定的 on_close() 进而调用 scheduleReconnect
            }
        }, -1);

        clearInterval(this.heart_fun);
        this.heart_fun = setInterval(heart_fun, 10_000);
    }

    async send_data_async(code_type: NetMsgType, buffer: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (!this.client || !this.client.connected) {
                return reject(new Error("TCP 客户端当前未连接，无法发送异步包"));
            }
            const tag_id = NetUtil.next_tag_id();
            this.call_resolve_map[tag_id] = resolve;
            this.call_resolve_timeout_map[tag_id] = setTimeout(() => {
                reject(new Error(`超时:${code_type}`));
                delete this.call_resolve_map[tag_id];
                delete this.call_resolve_timeout_map[tag_id];
            }, net_timeout);
            this.client.send_data(code_type, buffer, tag_id);
        });
    }
}