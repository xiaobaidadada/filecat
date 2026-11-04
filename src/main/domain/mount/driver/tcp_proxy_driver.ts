import http from "http";
import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_basename} from "./file_driver_type";
import {TunnelDuplexStream} from "../../../other/middleware/FilecatProxy";
import {NetMsgType, NetUtil} from "../../net/util/NetUtil";
import {tcpForwardService} from "../../net/tcp.forward.server.service";
import {Env} from "../../../../common/node/Env";
import {RCode} from "../../../../common/Result.pojo";

/**
 * 内网穿透客户端驱动。
 *
 * 用途：把「穿透列表中某个客户端的 FileCat」当作挂载源，
 * 从而在当前 FileCat 上直接浏览/读写另一台机器（经内网穿透连上来的那台）的文件。
 *
 * 原理：
 *   复用 FilecatProxy 已有的隧道能力，向客户端发 tcp_client_create_socket_for_server，
 *   让它连到对端 FileCat 的 HTTP 端口，得到一条原始 TCP 双向流，
 *   再在这条流上跑标准 HTTP，调用对端 /api/file/... 接口。
 *
 * 鉴权：对端 FileCat 的接口需要 Authorization，所以凭据里要保存对端账号密码，
 * 这里用它在对端登录换 token 并缓存，过期/失效时自动重新登录。
 */
export interface TcpProxyDriverConfig {
    /** 穿透客户端的 client_num_id（来自凭据 config.client_num_id） */
    client_num_id: number | string;
    /** 对端 FileCat 的登录账号 */
    username?: string;
    /** 对端 FileCat 的登录密码 */
    password?: string;
    /** 起始目录（挂载自己配置，相对对端根目录；为空表示整个根） */
    root?: string;
}

/** 对端 FileCat 返回的统一结果体 */
interface FileCatResult {
    code?: number;
    data?: any;
    msg?: string;
}

/** 对端 token 缓存：同一客户端 + 同一账号密码共用，避免每次文件操作都登录 */
const token_cache = new Map<number, {token: string; fingerprint: string}>();

/** 账号密码指纹：密码一改缓存自然失效，不依赖调用方记得清理 */
function account_fingerprint(username: string, password: string): string {
    return `${username}\u0000${password}`;
}

/**
 * 判断对端返回是不是「登录态失效」，需要重新登录再试一次。
 *
 * 实测依据：FileCat 的 token 失效（过期 / 对端重启清空内存 / token 不存在）
 * 时，AuthMiddleware 统一返回 {code: RCode.AuthFail(=2), message: "失败"}，
 * 不会把 "out of date"、"token is invalid" 这类内部原因透给客户端。
 * 所以这里只认 code，不猜 message 文案。
 */
function is_auth_expired(code: number | undefined): boolean {
    return code === RCode.AuthFail;
}

/** 清掉某个客户端的登录缓存（账号/密码变更后主动调用） */
export function clear_tcp_proxy_token(client_num_id: number | string) {
    token_cache.delete(Number(client_num_id));
}

export class TcpProxyDriver implements FileDriver {
    readonly type = MountDriverType.tcp_proxy;
    readonly display_name = "内网穿透 FileCat";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        copy: true,
        direct_url: false,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    /** 对端客户端 id */
    private readonly client_num_id: number;
    /** 对端登录账号 */
    private readonly username: string;
    /** 对端登录密码 */
    private readonly password: string;
    /** 起始目录前缀（不带前后斜杠，空表示根） */
    private readonly root: string;

    constructor(config: TcpProxyDriverConfig) {
        const id = Number(config?.client_num_id);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error("内网穿透挂载缺少客户端");
        }
        this.client_num_id = id;
        this.username = String(config?.username ?? "").trim();
        this.password = String(config?.password ?? "");
        if (!this.username || !this.password) {
            throw new Error("内网穿透挂载需要填写对端 FileCat 的账号密码");
        }
        this.root = String(config?.root ?? "").trim().replace(/^[/\\]+|[/\\]+$/g, "");
    }

    /**
     * 挂载点内相对路径 → 发给对端的路径。
     *
     * 关键：对端 getFile 用 isAbsolutePath 判断，以 / 开头会被当成「系统绝对路径」，
     * 直接绕过它的用户根目录。所以这里必须发相对路径（不带前导 /），
     * 让对端自己拼到它配置的根目录上，这才是「对方当前工作目录」的语义。
     */
    private remote_path(inner: string): string {
        const rel = norm_mount_path(inner).replace(/^\/+/, "");
        const parts = [this.root, rel].filter(Boolean);
        return parts.join("/");
    }

    /** 对端文件接口 URL；路径为空表示对端根目录 */
    private file_url(remote: string): string {
        return remote ? `/api/file/${encodeURI(remote)}` : "/api/file/";
    }

    /** 当前在线的隧道客户端；不在线直接报错，避免请求挂死 */
    private get_client() {
        const client = tcpForwardService.client_num_map[this.client_num_id];
        if (!client?.client_util) {
            throw new Error("内网穿透客户端不在线");
        }
        return client;
    }

    /**
     * 通过隧道发起一次 HTTP 请求。
     * 隧道是原始 TCP 流，这里直接在上面跑标准 HTTP 协议。
     */
    private async request(
        method: string,
        url_path: string,
        options?: {body?: any; stream?: Readable; headers?: Record<string, string>; timeout?: number},
    ): Promise<{status: number; headers: http.IncomingHttpHeaders; body: Buffer}> {
        const client = this.get_client();
        const socket_id = tcpForwardService.get_socket_id();
        const tunnelStream = new TunnelDuplexStream(client, socket_id);

        // 对端 FileCat 端口：客户端用 is_filecat 时连的是它自己的 Env.port，
        // 服务端没有记录这个值，只有配置了 filecat_proxy_host_port 才拿得到；
        // 取不到就退回本机端口（两端端口一致时正确）
        const client_fig = tcpForwardService.server_client_get()
            .find(v => v.client_num_id === this.client_num_id);
        const host_port = client_fig?.filecat_proxy_host_port;
        const target_port = host_port && host_port.includes(":")
            ? Number(host_port.split(":")[1]) || Env.port
            : Env.port;

        // 订阅隧道回传数据，按 socket_id 分发给本流
        const on_data = (data: Buffer) => {
            const {code, tcpBuffer} = NetUtil.getTcpData(data);
            if (code === NetMsgType.tcp_socket_data) {
                if (NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2)) !== socket_id) {
                    return;
                }
                tunnelStream.receiveFromTunnel(tcpBuffer.subarray(2));
            } else if (code === NetMsgType.tcp_socket_close) {
                if (NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2)) !== socket_id) {
                    return;
                }
                tunnelStream.push(null);
            }
        };
        client.client_util.get_client().add_on_data(on_data);

        const cleanup = () => {
            client.client_util.get_client().delete_on_data(on_data);
            if (!tunnelStream.writableEnded) {
                tunnelStream.destroy();
            }
        };

        try {
            // 通知客户端连到它自己的 FileCat HTTP 端口
            await client.client_util.send_data_async(
                NetMsgType.tcp_client_create_socket_for_server,
                Buffer.from(JSON.stringify({socket_id, is_filecat: true})),
            );

            // 用「直连 Socket 的 Agent」把 HTTP 请求跑在这条隧道上
            const agent = new (class extends http.Agent {
                createConnection(_options: any, callback: any) {
                    callback(null, tunnelStream);
                    return tunnelStream;
                }
            })();

            const body_buffer = options?.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));

            return await new Promise((resolve, reject) => {
                const req = http.request({
                    host: "127.0.0.1",
                    port: target_port,
                    method,
                    path: url_path,
                    agent,
                    headers: {
                        "Content-Type": "application/json",
                        // 对端是它自己的 FileCat，指向本机回环即可
                        "Host": `127.0.0.1:${target_port}`,
                        ...(body_buffer ? {"Content-Length": String(body_buffer.length)} : {}),
                        ...(options?.headers ?? {}),
                    },
                }, (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (c: Buffer) => chunks.push(c));
                    res.on("end", () => {
                        cleanup();
                        resolve({status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks)});
                    });
                    res.on("error", (e) => {
                        cleanup();
                        reject(e);
                    });
                });
                req.on("error", (e) => {
                    cleanup();
                    reject(e);
                });
                if (options?.timeout) {
                    req.setTimeout(options.timeout, () => {
                        req.destroy(new Error("请求超时"));
                    });
                }
                if (options?.stream) {
                    // 流式上传：直接 pipe 进请求体
                    options.stream.pipe(req);
                    options.stream.on("error", (e: Error) => {
                        req.destroy(e);
                    });
                } else {
                    if (body_buffer) {
                        req.write(body_buffer);
                    }
                    req.end();
                }
            });
        } catch (e) {
            cleanup();
            throw e;
        }
    }

    /** 登录对端 FileCat 换 token */
    private async login(): Promise<string> {
        const res = await this.request("POST", "/api/user/login", {
            body: {username: this.username, password: this.password},
            timeout: 15000,
        });
        let parsed: FileCatResult;
        try {
            parsed = JSON.parse(res.body.toString("utf8"));
        } catch (e) {
            throw new Error(`对端登录返回异常（HTTP ${res.status}）`);
        }
        if (parsed.code !== 0 || !parsed.data) {
            throw new Error(`对端登录失败：${parsed.msg ?? parsed.code}`);
        }
        const token = String(parsed.data);
        token_cache.set(this.client_num_id, {
            token,
            fingerprint: account_fingerprint(this.username, this.password),
        });
        return token;
    }

    /** 取可用 token；账号密码变了或缓存失效（登录态丢失）时自动重登一次 */
    private async get_token(force_login = false): Promise<string> {
        const fingerprint = account_fingerprint(this.username, this.password);
        if (!force_login) {
            const cached = token_cache.get(this.client_num_id);
            // 指纹不一致说明账号或密码被改过，旧 token 不能再用
            if (cached && cached.fingerprint === fingerprint) {
                return cached.token;
            }
        }
        return this.login();
    }

    /** WS 透传到对端时，本机 token 对端不认，需要用对端自己的 token 发握手 */
    public async get_forward_token(): Promise<string> {
        return this.get_token();
    }

    /**
     * 带登录态自动重试的统一入口。
     *
     * 所有对端请求都从这里走：
     *   1. 先用缓存的 token（按账号密码指纹判断是否可用）
     *   2. 若对端说登录态失效（token 过期/对端重启/权限变化），清缓存、重登、再试一次
     *   3. 仍失败则抛出可读错误
     *
     * 这样 read/write/remove 这些流式方法也不会再因为 token 过期而直接报错。
     */
    private async with_auth<T>(run: (token: string) => Promise<T>,
                               is_auth_error: (r: T) => boolean): Promise<T> {
        let token = await this.get_token();
        let result = await run(token);
        if (is_auth_error(result)) {
            // 登录态失效：清掉旧 token 重新登录，再试一次
            token_cache.delete(this.client_num_id);
            token = await this.get_token(true);
            result = await run(token);
        }
        return result;
    }

    /**
     * 通用转发：把接口请求原样发到对端 FileCat 执行，返回对端统一结果体。
     * 用于挂载开启「转发到对端」时，让 workflow 等接口在对端跑而不是读本地文件。
     */
    public async forward_api(url_path: string, body?: any): Promise<FileCatResult> {
        const parsed = await this.with_auth<FileCatResult>(
            async (token) => {
                const res = await this.request("POST", url_path, {
                    body,
                    headers: {Authorization: token},
                    timeout: 30000,
                });
                try {
                    return JSON.parse(res.body.toString("utf8"));
                } catch (e) {
                    throw new Error(`对端返回异常（HTTP ${res.status}）`);
                }
            },
            (r) => r.code !== 0 && is_auth_expired(r.code),
        );
        return parsed;
    }

    /**
     * 请求并解析对端统一结果体，失败抛错。
     * 登录态失效会自动重登重试一次。
     */
    private async request_json(method: string, url_path: string, body?: any): Promise<any> {
        const parsed = await this.with_auth<FileCatResult>(
            async (token) => {
                const res = await this.request(method, url_path, {
                    body,
                    headers: {Authorization: token},
                    timeout: 30000,
                });
                try {
                    return JSON.parse(res.body.toString("utf8"));
                } catch (e) {
                    throw new Error(`对端返回异常（HTTP ${res.status}）`);
                }
            },
            (r) => r.code !== 0 && is_auth_expired(r.code),
        );
        if (parsed.code !== 0) {
            throw new Error(this.readable_error(parsed));
        }
        return parsed.data;
    }

    /** 把对端返回码翻成用户能看懂、知道该去改什么的提示 */
    private readable_error(parsed: FileCatResult): string {
        if (is_auth_expired(parsed.code)) {
            return "对端登录失败：账号或密码不正确（请在 设置 → 网盘挂载 → 凭证管理 中检查）";
        }
        return parsed.msg || `对端返回失败（code=${parsed.code}）`;
    }

    async list(dir: string): Promise<FileItemData[]> {
        const remote = this.remote_path(dir);
        const data = await this.request_json("GET", this.file_url(remote));
        // 对端返回 {files:[], folders:[]}，条目字段是 type/name/size/mtime/isLink
        const base_inner = norm_mount_path(dir);
        const to_item = (it: any): FileItemData => {
            const name = it.name ?? "";
            // 挂载点内路径：根目录下是 /name，其余是 /父/name
            const inner = base_inner === "/" ? `/${name}` : `${base_inner}/${name}`;
            return driver_item_to_file_item({
                name,
                path: inner,
                is_dir: it.type === "folder",
                size: it.size,
                mtime: it.mtime,
                is_link: it.isLink,
            }, getFileFormat);
        };
        const items: FileItemData[] = [];
        for (const f of data?.folders ?? []) {
            items.push(to_item(f));
        }
        for (const f of data?.files ?? []) {
            items.push(to_item(f));
        }
        return items;
    }

    async stat(inner: string): Promise<FileItemData | null> {
        const normalized = norm_mount_path(inner);
        const remote = this.remote_path(inner);
        // 根目录没有父目录可列，直接按目录返回（能落到这里说明挂载点本身有效）
        if (normalized === "/" || !remote) {
            return driver_item_to_file_item({
                name: mount_basename(normalized) || "/",
                path: "/",
                is_dir: true,
            }, getFileFormat);
        }
        // 对端没有单文件 stat 接口，用父目录列表匹配
        const idx = remote.lastIndexOf("/");
        const parent = idx <= 0 ? "" : remote.substring(0, idx);
        const name = remote.substring(idx + 1);
        let data;
        try {
            data = await this.request_json("GET", this.file_url(parent));
        } catch (e) {
            return null;
        }
        const all = [...(data?.folders ?? []), ...(data?.files ?? [])];
        const hit = all.find((v: any) => v?.name === name);
        if (!hit) {
            return null;
        }
        return driver_item_to_file_item({
            name: hit.name,
            path: norm_mount_path(inner),
            is_dir: hit.type === "folder",
            size: hit.size,
            mtime: hit.mtime,
            is_link: hit.isLink,
        }, getFileFormat);
    }

    async read(inner: string, range?: [number, number]): Promise<Readable> {
        const remote = this.remote_path(inner);
        const extra_headers: Record<string, string> = {};
        if (range) {
            const end = range[1] === undefined || range[1] === null ? "" : String(range[1]);
            extra_headers["Range"] = `bytes=${range[0]}-${end}`;
        }
        // 对端对「文本文件」返回统一结果体 {code,data:"内容"}，对「二进制」才直出字节
        const res = await this.with_auth(
            (token) => this.request("GET", this.file_url(remote), {
                headers: {Authorization: token, ...extra_headers},
            }),
            // token 过期时会以 200 + AuthFail 返回，需要重登再取
            (r) => r.status < 400 && this.body_is_auth_fail(r.body),
        );
        if (res.status >= 400) {
            throw new Error(`读取对端文件失败（HTTP ${res.status}）`);
        }
        const text = res.body.toString("utf8");
        if (text.startsWith("{\"code\"")) {
            let parsed: FileCatResult | undefined;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                // 不是 JSON，按原始字节返回
            }
            if (parsed) {
                if (is_auth_expired(parsed.code)) {
                    throw new Error(this.readable_error(parsed));
                }
                // 只有 PreFile(=5) 才代表「这是文本文件内容」，其余是错误或其它结构
                if (parsed.code === RCode.PreFile && typeof parsed.data === "string") {
                    return Readable.from([Buffer.from(parsed.data, "utf8")]);
                }
            }
        }
        return Readable.from([res.body]);
    }

    /** 响应体是否是一个 AuthFail 结果（用于流式响应里识别登录态失效） */
    private body_is_auth_fail(body: Buffer): boolean {
        if (body.length > 200) {
            return false;
        }
        const text = body.toString("utf8");
        if (!text.startsWith("{\"code\"")) {
            return false;
        }
        try {
            return is_auth_expired(JSON.parse(text).code);
        } catch (e) {
            return false;
        }
    }

    async write(inner: string, data: Readable, size?: number): Promise<void> {
        const remote = this.remote_path(inner);
        // 对端上传接口收 multipart 表单（字段名 file），不是裸流，这里手工组包
        const boundary = `----filecat${Date.now().toString(16)}`;
        const name = remote.substring(remote.lastIndexOf("/") + 1) || "file";

        const head = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${encodeURIComponent(name)}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`,
        );
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

        // 头尾之外的部分直接流式转发，避免整个文件进内存
        const body_stream = new (class extends Readable {
            private step = 0;

            _read() {
                if (this.step === 0) {
                    this.step = 1;
                    this.push(head);
                    return;
                }
                if (this.step === 1) {
                    this.step = 2;
                    data.on("data", (c: Buffer) => {
                        if (!this.push(c)) data.pause();
                    });
                    data.on("end", () => {
                        this.push(tail);
                        this.push(null);
                    });
                    data.on("error", (e: Error) => this.destroy(e));
                    this.on("drain", () => data.resume());
                    return;
                }
            }
        })();

        const headers: Record<string, string> = {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
        };
        if (size !== undefined && size !== null) {
            // multipart 总长 = 头 + 文件 + 尾
            headers["Content-Length"] = String(head.length + size + tail.length);
        }
        // 上传的请求体是一次性流，token 失效时无法重放，
        // 所以这里不接受「重试」语义，直接带上当前 token 发出去；
        // 若对端确实说登录失效，外层会收到错误，下次操作自然会用新 token。
        const token = await this.get_token();
        const res = await this.request("PUT", this.file_url(remote), {
            stream: body_stream,
            headers: {...headers, Authorization: token},
        });
        if (res.status >= 400) {
            throw new Error(`写入对端文件失败（HTTP ${res.status}）`);
        }
        if (this.body_is_auth_fail(res.body)) {
            // 本次上传因登录态失效被拒，清缓存让下次重新登录
            token_cache.delete(this.client_num_id);
            throw new Error("对端登录已失效，请重试上传（账号或密码可能已被修改）");
        }
    }

    async remove(inner: string): Promise<void> {
        if (norm_mount_path(inner) === "/") {
            throw new Error("不能删除挂载根目录");
        }
        const remote = this.remote_path(inner);
        const res = await this.with_auth(
            (token) => this.request("DELETE", this.file_url(remote), {
                headers: {Authorization: token},
            }),
            (r) => r.status < 400 && this.body_is_auth_fail(r.body),
        );
        if (res.status >= 400) {
            throw new Error(`删除对端文件失败（HTTP ${res.status}）`);
        }
    }

    async mkdir(inner: string): Promise<void> {
        // 对端新建目录接口的 name 是「相对根目录的完整路径」
        const remote = this.remote_path(inner);
        await this.request_json("POST", "/api/file/new/dir", {name: remote});
    }

    async move(from: string, to: string): Promise<void> {
        // 对端 cut 接口：files 是源列表，to 是目标「目录」
        const from_remote = this.remote_path(from);
        const to_remote = this.remote_path(to);
        await this.request_json("POST", "/api/file/cut", {
            files: [from_remote],
            to: this.parent_dir(to_remote),
        });
    }

    async copy(from: string, to: string): Promise<void> {
        const from_remote = this.remote_path(from);
        const to_remote = this.remote_path(to);
        await this.request_json("POST", "/api/file/copy", {
            files: [from_remote],
            to: this.parent_dir(to_remote),
        });
    }

    /** 取对端路径的父目录；本身就在根下时返回空串（对端按自己的根目录处理） */
    private parent_dir(remote: string): string {
        const idx = remote.lastIndexOf("/");
        return idx < 0 ? "" : remote.substring(0, idx);
    }

    async getDirectUrl(): Promise<string | null> {
        // 穿透链路只在本进程内可用，无法给出浏览器可直连的地址
        return null;
    }

    async quota(): Promise<{used: number; total: number} | null> {
        return null;
    }
}
