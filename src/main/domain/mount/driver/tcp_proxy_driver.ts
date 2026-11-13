import http from "http";
import {Readable, PassThrough} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_basename} from "./file_driver_type";
import {relative_path} from "../mount.pojo";
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
    /** 对端 FileCat 的 base_url 前缀（如 /pre）；为空表示对端没配 */
    base_url?: string;
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
    /** 对端 base_url 前缀，已规范成「无尾斜杠、为空表示无前缀」 */
    private readonly base_url: string;
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
        // 对端可能配了 base_url（接口在 /pre/api 下），统一规范成 /pre 形式
        this.base_url = String(config?.base_url ?? "").trim().replace(/^[/\\]+|[/\\]+$/g, "");
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

    /** 对端下载接口 URL（原始字节，不经过文本预览） */
    private download_url(remote: string, token: string): string {
        return `/api/download?file=${encodeURIComponent(remote)}&token=${encodeURIComponent(token)}`;
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
     *
     * url_path 一律传对端「不带 base_url 前缀」的路径（如 /api/user/login），
     * 前缀在这里统一补，避免每个调用点都要拼一次。
     */
    private async request(
        method: string,
        url_path: string,
        options?: {body?: any; stream?: Readable; headers?: Record<string, string>; timeout?: number},
    ): Promise<{status: number; headers: http.IncomingHttpHeaders; body: Buffer}> {
        // 对端开了 base_url 时，接口实际在 /pre/api/... 下
        if (this.base_url) {
            url_path = `/${this.base_url}${url_path}`;
        }
        const client = this.get_client();
        const socket_id = tcpForwardService.get_socket_id();
        const tunnelStream = new TunnelDuplexStream(client, socket_id);

        const client_fig = tcpForwardService.server_client_get_by_id(this.client_num_id);
        const host_port = client_fig?.filecat_proxy_host_port;
        const target_port = host_port && host_port.includes(":")
            ? Number(host_port.split(":")[1]) || Env.port
            : Env.port;

        // 订阅隧道回传数据，按 socket_id 分发给本流
        let cleaned = false;
        const cleanup = () => {
            // 三个出口（响应结束 / 出错 / 隧道被对端关闭）都可能触发，
            // 这里保证只解绑一次，避免同一 handle 重复 filter 造成无谓开销
            if (cleaned) {
                return;
            }
            cleaned = true;
            client.client_util.get_client().delete_on_data(on_data);
            if (!tunnelStream.writableEnded) {
                tunnelStream.destroy();
            }
        };
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
                // 对端关掉这条 tunnel socket 后不会再有响应回来，
                // 必须在这里就解绑，否则 on_data 会永久留在 client 的监听器数组里，
                // 每次请求泄漏一个闭包（连带 tunnelStream 和 client 引用）
                cleanup();
                tunnelStream.push(null);
            }
        };
        client.client_util.get_client().add_on_data(on_data);

        try {
            // 通知客户端连到它自己的 FileCat HTTP 端口。
            // 配了 filecat_proxy_host_port 就按配置的地址连（和 FilecatProxy 的浏览器转发保持一致），
            // 否则退回 is_filecat，由客户端连自己的 Env.port
            const create_option: Record<string, unknown> = {socket_id};
            if (host_port && host_port.includes(":")) {
                const host_port_list = host_port.split(":");
                create_option.client_proxy_host = host_port_list[0];
                create_option.client_proxy_port = Number(host_port_list[1]);
            } else {
                create_option.is_filecat = true;
            }
            await client.client_util.send_data_async(
                NetMsgType.tcp_client_create_socket_for_server,
                Buffer.from(JSON.stringify(create_option)),
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
                // 兜底超时：隧道断在半路时 socket 不会报错也没有响应，
                // 不设超时这个 Promise 会永久挂起，cleanup 永不执行，
                // on_data / tunnelStream / 上传流全部泄漏。调用方传的 timeout 优先
                req.setTimeout(options?.timeout ?? 120000, () => {
                    req.destroy(new Error("请求超时"));
                });
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
    /**
     * git 接口转发到对端 FileCat 执行。
     *
     * 挂载点内相对路径用 remote_path 换算成对端路径，和文件操作完全一致，
     * 对端没有「挂载」这一层，仓库就是它自己根目录下的同名目录。
     *
     * 用 request 而不是 request_json：后者会把 Result 拆成 data 并在失败时抛错，
     * 这里要把下游接口完整的 {code, message, data} 交给上层。
     */
    async git_request(inner: string, route: string, body: any): Promise<any> {
        const remote_path = this.remote_path(inner);
        return await this.with_auth<any>(
            async (token) => {
                const res = await this.request("POST", `/api/git/${route}`, {
                    body: {...body, path: remote_path},
                    headers: {Authorization: token},
                    timeout: 60000,
                });
                try {
                    return JSON.parse(res.body.toString("utf8"));
                } catch (e) {
                    throw new Error(`对端返回异常（HTTP ${res.status}）`);
                }
            },
            (r: any) => r?.code !== 0 && is_auth_expired(r?.code),
        );
    }
    public async get_forward_token(): Promise<string> {
        return this.get_token();
    }

    /**
     * workflow act 控制转发到对端执行。
     *
     * 和 git_request 同理：挂载点内相对路径用 remote_path 换成对端视角的路径，
     * 对端拿到的就是它自己根目录下的绝对路径，不需要知道「挂载」这层概念。
     */
    async act_request(inner: string, act: "start" | "restart" | "stop"): Promise<any> {
        const remote_path = this.remote_path(inner);
        return await this.with_auth<any>(
            async (token) => {
                const res = await this.request("POST", "/api/file/workflow/act", {
                    body: {act, path: remote_path},
                    headers: {Authorization: token},
                    timeout: 60000,
                });
                try {
                    return JSON.parse(res.body.toString("utf8"));
                } catch (e) {
                    throw new Error(`The remote endpoint returned an error.（HTTP ${res.status}）`);
                }
            },
            (r: any) => r?.code !== 0 && is_auth_expired(r?.code),
        );
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

    /**
     * 把 AI 聊天相关的接口调用转给对端执行。
     *
     * AI 的接口参数里没有目录路径（只有 session_id 之类），所以由前端把当前
     * 所在挂载的绝对路径放进 mount_path 头，中间件解析出挂载后调到这里。
     * route 是接口名（如 session、sessions、audio/speech），
     * 返回对端接口的完整响应（{code, message, data} 或二进制）。
     */
    async ai_request(route: string, method: string, body: any, base_path?: string, dir_path?: string): Promise<{content_type: string; session_id: string; body: Buffer}> {
        // 会话按目录定位，file_cwd_path 是本机绝对路径，
        // 对端不认识本机的挂载这一层，换成它对端的路径（与文件操作同一套换算）
        const cwd = body?.file_cwd_path;
        // 当前目录在挂载内的相对路径，用来把对端返回的绝对路径换回本机视角
        let inner_dir = "";
        if (dir_path && base_path) {
            inner_dir = relative_path(dir_path, base_path) ?? "";
        }
        if (typeof cwd === "string" && cwd && base_path) {
            const rel = relative_path(cwd, base_path);
            if (rel !== null) {
                body = {...body, file_cwd_path: this.remote_path(rel)};
            }
        }
        const rsp = await this.with_auth(
            async (token) => {
                const res = await this.request(method, `/api/ai_agent/${route}`, {
                    body,
                    headers: {Authorization: token},
                    timeout: 300000,
                });
                return {
                    content_type: String(res.headers["content-type"] ?? ""),
                    session_id: String(res.headers["x-session-id"] ?? ""),
                    body: res.body,
                };
            },
            // 只有 JSON 响应才可能承载鉴权失败码；二进制（音频）不参与判断
            (r) => {
                if (!r.content_type.includes("application/json")) {
                    return false;
                }
                try {
                    return is_auth_expired(JSON.parse(r.body.toString("utf8")).code);
                } catch {
                    return false;
                }
            },
        );
        // 对端返回的 file_cwd_path 是它对端的绝对路径（对端根 + 挂载内相对路径），
        // 直接给前端会跟本机目录永远对不上，导致每次打开都新建会话。
        // 这里按「挂载内相对路径」把它换算回本机绝对路径。
        if (rsp.content_type.includes("application/json") && base_path) {
            return {...rsp, body: this.localize_cwd(rsp.body, base_path, inner_dir)};
        }
        return rsp;
    }

    /**
     * 把响应体里的 file_cwd_path 从对端绝对路径换算成本机绝对路径。
     *
     * 对端路径 = 对端用户根 + 挂载内相对路径，本机知道后者（inner_dir 是当前目录的，
     * 其它会话的层级不同），所以用「以挂载内相对路径结尾」的项反推出对端根，
     * 再用这个前缀做全局替换。
     */
    private localize_cwd(body: Buffer, base_path: string, inner_dir: string): Buffer {
        let parsed: any;
        try {
            parsed = JSON.parse(body.toString("utf8"));
        } catch {
            return body;
        }
        const items: any[] = Array.isArray(parsed?.data) ? parsed.data : [parsed?.data];
        // 用当前目录那条反推对端根：对端路径应该以当前目录的挂载内相对路径结尾
        const suffix = inner_dir ? `/${inner_dir.replace(/^\/+|\/+$/g, "")}` : "";
        let remote_root: string | null = null;
        if (suffix) {
            for (const it of items) {
                const p = it?.file_cwd_path;
                if (typeof p === "string" && p.endsWith(suffix)) {
                    remote_root = p.slice(0, p.length - suffix.length);
                    break;
                }
            }
        }
        if (!remote_root) {
            return body;
        }
        const local_root = norm_mount_path(base_path).replace(/\/+$/, "");
        const convert = (p: any) => {
            if (typeof p !== "string" || !p.startsWith(remote_root as string)) {
                return p;
            }
            const rest = p.slice((remote_root as string).length);
            return norm_mount_path(`${local_root}${rest}`);
        };
        for (const it of items) {
            if (it && typeof it === "object") {
                it.file_cwd_path = convert(it.file_cwd_path);
            }
        }
        return Buffer.from(JSON.stringify(parsed), "utf8");
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
        // 必须走 /api/download 拿原始字节。
        // /api/file/ 是「文本预览」接口，服务端会把内容 toString("utf8") 塞进 JSON，
        // 二进制（xlsx/图片/压缩包）经这一趟无法还原，字节会被 U+FFFD 替换掉。
        const res = await this.with_auth(
            (token) => this.request("GET", this.download_url(remote, token), {
                headers: extra_headers,
            }),
            // token 过期时会以 200 + AuthFail 的 JSON 返回，需要重登再试
            (r) => r.status < 400 && this.body_is_auth_fail(r.body),
        );
        if (res.status >= 400) {
            throw new Error(`读取对端文件失败（HTTP ${res.status}）`);
        }
        // 鉴权失败是 JSON 错误体，正常下载则是文件本身，用 Content-Type 区分
        const ctype = String(res.headers["content-type"] ?? "");
        if (ctype.includes("application/json")) {
            let parsed: FileCatResult | undefined;
            try {
                parsed = JSON.parse(res.body.toString("utf8"));
            } catch (e) {
                // 不是 JSON，按原始字节返回
            }
            if (parsed && parsed.code !== 0) {
                throw new Error(this.readable_error(parsed));
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

        // 头尾之外的部分直接流式转发，避免整个文件进内存。
        // 用 PassThrough 做中转：数据通过 pipe 流进来，Node 会自动在背压时
        // pause 源流、缓冲区腾空时 resume，不需要自己维护 push/pause 状态机。
        const body_stream = new PassThrough();
        const on_data_end = () => body_stream.end(tail);
        const on_data_error = (e: Error) => body_stream.destroy(e);
        try {
            body_stream.write(head);
            data.pipe(body_stream, {end: false});
            data.on("end", on_data_end);
            data.on("error", on_data_error);

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
        } finally {
            // 无论成功失败都要解绑并释放：否则登录失败等提前抛错的分支
            // 会把监听器留在上传流上，源流既不被消费也不结束，句柄与缓冲一直占着
            data.off("end", on_data_end);
            data.off("error", on_data_error);
            data.unpipe(body_stream);
            if (!body_stream.destroyed) {
                body_stream.destroy();
            }
            if (!data.destroyed) {
                data.destroy();
            }
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
        const from_remote = this.remote_path(from);
        const to_remote = this.remote_path(to);
        const to_dir = this.parent_dir(to_remote);

        // 同目录内移动就是改名，对端 rename 一步到位
        if (this.parent_dir(from_remote) === to_dir) {
            await this.request_json("POST", "/api/file/rename", {
                name: from_remote,
                newName: to_remote,
            });
            return;
        }

        // 跨目录移动：cut 只能把文件挪进目标目录，文件名保持不变
        await this.request_json("POST", "/api/file/cut", {
            files: [from_remote],
            to: to_dir,
        });

        // 目标文件名和原文件名不同时，搬过去之后再改一次名
        const moved_remote = to_dir ? `${to_dir}/${mount_basename(from_remote)}` : mount_basename(from_remote);
        if (moved_remote !== to_remote) {
            await this.request_json("POST", "/api/file/rename", {
                name: moved_remote,
                newName: to_remote,
            });
        }
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
