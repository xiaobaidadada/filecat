import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import readline from "readline";
import {Env} from "../../../common/node/Env";
import {SystemUtil} from "../sys/sys.utl";
import {ai_mcp_server_item} from "../../../common/req/filecat.ai.pojo";
import {ai_agent_params_type} from "./tools/ai_agent.constant";
import {
    buildClientInfo,
    classifyDiscoverResult,
    DiscoverProbeResult,
    isMethodNotFoundError,
    LEGACY_PROTOCOL_VERSION,
    PROBE_TIMEOUT_MS,
} from "./mcp.protocol";
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    /** 普通请求用数字 id；协议探测用字符串 id（官方约定，不占用正常 id 序列） */
    id: number | string;
    method: string;
    params?: any;
}

export interface JsonRpcResponse {
    jsonrpc?: "2.0";
    id?: number | string;
    result?: any;
    error?: {
        code?: number;
        message?: string;
        data?: any;
    };
}

export type McpToolDefinition  = ai_agent_params_type

export interface McpRuntimeToolInfo {
    server_name: string;
    server_label: string;
    tool_name: string;
    display_name: string;
    description?: string;
    input_schema?: any;
}

export function sanitizeName(name: string) {
    return (name || "")
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function parseArgString(argStr?: string): string[] {
    if (!argStr) return [];
    const raw = argStr.trim();
    if (!raw) return [];

    if (raw.startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map(v => String(v));
            }
        } catch {}
    }

    const result: string[] = [];
    let buf = "";
    let inSingle = false;
    let inDouble = false;
    let escape = false;

    const flush = () => {
        const v = buf.trim();
        if (v) {
            result.push(v);
        }
        buf = "";
    };

    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (escape) {
            buf += c;
            escape = false;
            continue;
        }
        if (c === "\\") {
            escape = true;
            continue;
        }
        if (c === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (c === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && /\s/.test(c)) {
            flush();
            continue;
        }
        buf += c;
    }

    flush();
    return result;
}

export function parseEnvText(envText?: string) {
    const env: Record<string, any> = {};
    if (!envText) return env;
    Env.load(envText, env);
    return env;
}

export function parseHeaderText(headerText?: string) {
    const headers = parseEnvText(headerText);
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (key) {
            result[key] = value == null ? "" : String(value);
        }
    }
    return result;
}

export function getToolTextContent(result: any) {
    if (result == null) return "";
    if (typeof result === "string") return result;
    if (typeof result === "number" || typeof result === "boolean") return String(result);
    if (Array.isArray(result)) return result.map(getToolTextContent).filter(Boolean).join("\n");
    if (result.content != null) {
        if (typeof result.content === "string") return result.content;
        if (Array.isArray(result.content)) {
            return result.content.map((item: any) => {
                if (typeof item === "string") return item;
                if (item?.type === "text") return item.text ?? "";
                if (item?.text) return item.text;
                return JSON.stringify(item);
            }).filter(Boolean).join("\n");
        }
    }
    if (result.text) return String(result.text);
    return JSON.stringify(result, null, 2);
}

export interface McpStreamChunk {
    type:
        | "chunk"
        | "done"
        | "error";

    delta?: string;

    data?: any;
}

export interface IMcpTransport {
    runtime_tools: McpRuntimeToolInfo[];

    start(): Promise<void>;

    close(): Promise<void>;

    request(
        method: string,
        params?: any,
        timeoutMs?: number
    ): Promise<any>;

    notify(
        method: string,
        params?: any
    ): Promise<void>;

    ensureStarted?:()=>Promise<void>
}

export class StdioMcpServerClient  implements IMcpTransport{
    private child: ChildProcessWithoutNullStreams | null = null;
    private pending = new Map<number | string, { resolve: (value: any) => void; reject: (error: any) => void; timeout?: NodeJS.Timeout }>();
    private nextId = 1;
    /** 是否正在主动关停：关停期间子进程退出的报错属于预期，不当作错误处理 */
    private closing = false;
    private rl: readline.Interface | null = null;
    private started = false;

    public readonly runtime_tools: McpRuntimeToolInfo[] = [];

    constructor(private readonly config: ai_mcp_server_item, private readonly serverLabel: string) {}

    public get label() {
        return this.config.name || this.config.note || this.serverLabel;
    }

    public get configName() {
        return this.config.name || this.config.note || this.serverLabel;
    }

    public async start() {
        if (this.started) return;
        if (this.config.transport && this.config.transport !== "stdio") {
            throw new Error(`当前仅支持 stdio MCP server: ${this.config.transport}`);
        }
        try {
            const args = parseArgString(this.config.args);
            const env = {
                ...process.env,
                ...parseEnvText(this.config.env)
            };
            this.child = spawn(this.config.command, args, {
                cwd: this.config.cwd || process.cwd(),
                env,
                stdio: ["pipe", "pipe", "pipe"],
                shell: process.platform === "win32"
            });

            this.child.on("error", (err) => {
                if (this.closing) {
                    return;
                }
                console.error(`[MCP ${this.configName}] spawn error`, err);
                this.failAll(err);
            });
            this.child.on("exit", (code, signal) => {
                this.started = false;
                // 主动关停（close() 里 kill 的）属于预期行为，不算错误，
                // 否则正常关闭会打出 SIGTERM 报错，还会把错误抛给并行加载中的请求。
                const was_closing = this.closing;
                this.closing = false;
                if (was_closing) {
                    this.failAll(new Error(`MCP ${this.configName} closed`), true);
                    return;
                }
                const err = new Error(`[MCP ${this.configName}] exited with code=${code} signal=${signal ?? ""}`);
                this.failAll(err);
            });
            this.child.stderr?.on("data", (chunk) => {
                const text = chunk.toString();
                if (text.trim()) {
                    console.warn(`[MCP ${this.configName}] ${text.trim()}`);
                }
            });

            // 将输出格式化 Stdio 是一行一个json
            this.rl = readline.createInterface({input: this.child.stdout});
            this.rl.on("line", (line) => this.handleLine(line));

            // 协议协商：先探测 server/discover，不认识就回退 initialize（双时代 Client）
            const probe = await this.probeModernProtocol();
            console.log(`[MCP ${this.configName}] 协议协商: ${probe.modern ? "现代" : "回退老版"} - ${probe.reason}`);

            if (!probe.modern) {
                // 老版握手
                await this.request("initialize", {
                    protocolVersion: LEGACY_PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: buildClientInfo()
                });
                await this.notify("initialized", {});
            }
            // 加载所有工具
            await this.reloadTools();
            this.started = true;
        } catch (err) {
            await this.close().catch(() => {});
            throw err;
        }
    }

    /**
     * 探测 server 是否支持新版协议（server/discover）。
     * 任何异常/不认识的返回都视为「不是现代协议」，交给上层回退 initialize。
     */
    private async probeModernProtocol(): Promise<DiscoverProbeResult> {
        try {
            const result = await this.request(
                "server/discover",
                {_meta: {clientInfo: buildClientInfo(), clientCapabilities: {}}},
                // 探测超时从短，本地管道沉默就当作老 server
                PROBE_TIMEOUT_MS,
                // 官方约定：探测用字符串 id，不消耗正常 id 序列
                "filecat-discover"
            );
            return classifyDiscoverResult(result);
        } catch (err: any) {
            // 方法不存在 / 超时 / 其它错误 → 一律当老 server 回退
            if (isMethodNotFoundError(err)) {
                return {modern: false, reason: `server 不认识 server/discover（${err.message}）`};
            }
            return {modern: false, reason: `discover 探测失败，回退老版（${err?.message ?? err}）`};
        }
    }

    public async reloadTools() {
        this.runtime_tools.length = 0;
        let cursor: string | undefined;
        do {
            // 请求mcp读取工具
            const res: any = await this.request("tools/list", cursor ? {cursor} : {});
            const tools = res?.tools ?? [];
            for (const tool of tools) {
                const toolName = String(tool?.name ?? "");
                if (!toolName) continue;
                this.runtime_tools.push({
                    server_name: this.configName,
                    server_label: this.label,
                    tool_name: toolName,
                    display_name: `${this.label}/${toolName}`,
                    description: tool?.description,
                    input_schema: tool?.inputSchema ?? {type: "object", properties: {}}
                });
            }
            cursor = res?.nextCursor;
        } while (cursor);
    }


    public async ensureStarted() {
        if (!this.started) {
            await this.start();
        }
    }

    public async close() {
        this.started = false;
        // 标记为主动关停：之后子进程的 exit/error 都不会被当成异常报错
        this.closing = true;
        const child = this.child;
        try {
            if (child && !child.killed) {
                try {
                    // 先礼貌 shutdown，让 server 自己退出（1 秒超时）
                    await this.request("shutdown", {}, 1000);
                } catch {
                }
                // 还没退出就终止。
                // Windows 上子进程是 shell 方式启动的（shell: true），
                // 直接 child.kill() 只杀掉 shell，真正干活的 node/python 会残留下来
                // （表现为 "Waiting for the debugger to disconnect..." 之类卡住），
                // 所以用项目统一的 SystemUtil.killProcess 按进程树强杀。
                if (!child.killed && child.pid) {
                    SystemUtil.killProcess(child.pid);
                }
            }
        } catch {}
        this.failAll(new Error(`MCP ${this.configName} closed`), true);
        this.rl?.close();
        this.rl = null;
        this.child = null;
        // 注意：不复位 closing。真正的复位在子进程 exit 事件里，
        // 因为 kill() 是异步的，exit 会在稍后触发，这里复位会让 exit 又走报错分支。
    }

    // 核心 等于是 消息接收函数 处理每一个请求的输出返回
    private handleLine(line: string) {
        if (!line) return;
        let msg: JsonRpcResponse | JsonRpcResponse[];
        try {
            msg = JSON.parse(line);
        } catch (err) {
            console.warn(`[MCP ${this.configName}] invalid json line`, line);
            return;
        }
        const list = Array.isArray(msg) ? msg : [msg];
        for (const item of list) {
            if (item?.id == null) {
                continue;
            }
            const pending = this.pending.get(item.id);
            if (!pending) continue;
            this.pending.delete(item.id);
            if (pending.timeout) clearTimeout(pending.timeout);
            if (item.error) {
                // 保留 code/data，协议协商需要靠 code 判断（如 -32601 方法不存在、-32022 版本调整）
                const err: any = new Error(item.error.message || `MCP error ${item.error.code ?? ""}`);
                err.code = item.error.code;
                err.data = item.error.data;
                pending.reject(err);
            } else {
                pending.resolve(item.result);
            }
        }
    }

    private failAll(err: any, silent = false) {
        for (const [, pending] of this.pending.entries()) {
            if (pending.timeout) clearTimeout(pending.timeout);
            pending.reject(err);
        }
        this.pending.clear();
        if (!silent) {
            console.error(`[MCP ${this.configName}]`, err);
        }
    }

    // 最关键的，向mcp服务发送数据
    // customId：协议探测时需要指定字符串 id；不传则用自增数字 id
    public request(method: string, params?: any, timeoutMs = this.config.timeout_ms ?? 1_000_000, customId?: string) {
        const child = this.child;
        if (!child || child.killed) {
            return Promise.reject(new Error(`MCP ${this.configName} not started`));
        }
        const id: number | string = customId ?? this.nextId++;
        const payload: JsonRpcRequest = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`MCP ${this.configName} request timeout: ${method}`));
            }, timeoutMs);
            this.pending.set(id, {resolve, reject, timeout});
            child.stdin.write(`${JSON.stringify(payload)}\n`);
        });
    }

    public async notify(method: string, params?: any) {
        const child = this.child;
        if (!child || child.killed) {
            return;
        }
        child.stdin.write(`${JSON.stringify({
            jsonrpc: "2.0",
            method,
            params
        })}\n`);
    }
}

export interface HttpMcpTransportOptions {
    endpoint: string;
    headers?: Record<string, string>;
    stream?: boolean;
    /** 请求超时（毫秒），不传用默认值 */
    timeout_ms?: number;
}

/** HTTP 请求默认超时 */
const HTTP_DEFAULT_TIMEOUT_MS = 30000;

export class HttpMcpTransport implements IMcpTransport {

    private nextId = 1;

    private started = false;

    // MCP Session ID
    private sessionId?: string;

    public readonly runtime_tools: McpRuntimeToolInfo[] = [];

    constructor(
        private readonly options: HttpMcpTransportOptions
    ) {}

    async start() {

        if (this.started) {
            return;
        }

        // 协议协商：先探测 server/discover，不认识就回退 initialize（双时代 Client）
        const probe = await this.probeModernProtocol();

        console.log(`[MCP ${this.options.endpoint}] 协议协商: ${probe.modern ? "现代" : "回退老版"} - ${probe.reason}`);

        if (!probe.modern) {

            // 老版握手（initialize 会创建 session）
            await this.request("initialize", {
                protocolVersion: LEGACY_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: buildClientInfo()
            }, undefined, "filecat-initialize");

            await this.notify("initialized", {});
        }

        await this.reloadTools();

        this.started = true;
    }

    /**
     * 探测 server 是否支持新版协议（server/discover）。
     *
     * 与 stdio 不同的地方：HTTP 上的沉默可能是服务异常，但按用户要求同样回退 initialize，
     * 比官方（直接报错）更宽容；401/403 也回退，让 initialize 去暴露真正的鉴权错误。
     */
    private async probeModernProtocol(): Promise<DiscoverProbeResult> {

        try {

            const result = await this.request(
                "server/discover",
                {_meta: {clientInfo: buildClientInfo(), clientCapabilities: {}}},
                // 探测超时从短，避免老 server 不认这个方法时长时间挂起
                PROBE_TIMEOUT_MS,
                "filecat-discover"
            );

            return classifyDiscoverResult(result);

        } catch (err: any) {

            // 方法不存在 → 明确是老 server；其它异常（超时/网络/鉴权）也回退，
            // 比官方（直接报错）更宽容，真正的错误会在随后的 initialize 中暴露
            if (isMethodNotFoundError(err)) {
                return {modern: false, reason: `server 不认识 server/discover（${err.message}）`};
            }

            return {
                modern: false,
                reason: `discover 探测失败，回退老版（${err?.message ?? err}）`
            };
        }
    }

    async close() {}

    async reloadTools() {

        this.runtime_tools.length = 0;

        let cursor: string | undefined;

        do {

            const res: any = await this.request(
                "tools/list",
                cursor ? { cursor } : {}
            );

            const tools = res?.tools ?? [];

            for (const tool of tools) {

                const toolName = String(tool?.name ?? "");

                if (!toolName) {
                    continue;
                }

                this.runtime_tools.push({
                    server_name: "http",
                    server_label: this.options.endpoint,
                    tool_name: toolName,
                    display_name: `${this.options.endpoint}/${toolName}`,
                    description: tool?.description,
                    input_schema: tool?.inputSchema ?? {
                        type: "object",
                        properties: {}
                    }
                });
            }

            cursor = res?.nextCursor;

        } while (cursor);
    }

    private buildHeaders() {

        return {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",

            // MCP Session
            ...(this.sessionId
                ? {
                    "mcp-session-id": this.sessionId
                }
                : {}),

            ...this.options.headers
        };
    }

    private saveSessionId(res: Response) {

        const sessionId =
            res.headers.get("mcp-session-id") ||
            res.headers.get("x-session-id");

        if (sessionId) {
            this.sessionId = sessionId;
        }
    }

    async notify(
        method: string,
        params?: any
    ): Promise<void> {

        const res = await fetch(this.options.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify({
                jsonrpc: "2.0",
                method,
                params
            })
        });

        this.saveSessionId(res);

        if (!res.ok) {

            let text = "";

            try {
                text = await res.text();
            } catch {}

            throw new Error(
                `HTTP ${res.status} ${text}`
            );
        }
    }

    async request(
        method: string,
        params?: any,
        timeoutMs: number = this.options.timeout_ms ?? HTTP_DEFAULT_TIMEOUT_MS,
        customId?: string
    ): Promise<any | AsyncGenerator<McpStreamChunk>> {

        const id: number | string = customId ?? this.nextId++;

        // 超时保护：老 server 收到未知方法可能不响应，必须能主动断开
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let res: Response;
        try {
            res = await fetch(this.options.endpoint, {
                method: "POST",
                headers: this.buildHeaders(),
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    method,
                    params,
                    // stream: wantStream
                }),
                signal: controller.signal
            });
        } catch (err: any) {
            clearTimeout(timer);
            if (err?.name === "AbortError") {
                throw new Error(`MCP ${this.options.endpoint} request timeout: ${method}`);
            }
            throw err;
        }
        clearTimeout(timer);

        // 保存 session id
        this.saveSessionId(res);

        if (!res.ok) {

            let text = "";

            try {
                text = await res.text();
            } catch {}

            const err: any = new Error(
                `HTTP ${this.options.endpoint} ${res.status} ${text}`
            );
            err.status = res.status;
            throw err;
        }

        const contentType =
            (res.headers.get("content-type") || "")
                .toLowerCase();

        // JSON 返回
        if (contentType.includes("application/json")) {

            const json = await res.json();

            if (json?.error) {
                // 保留 code/data，协议协商要靠 code 判断
                const err: any = new Error(json.error.message);
                err.code = json.error.code;
                err.data = json.error.data;
                throw err;
            }

            return json?.result;
        }

        // SSE 返回
        if (contentType.includes("text/event-stream")) {

            // 协议探测只需要最终结果，不能返回生成器（调用方会 await 拿到生成器而非结果）
            const json = await this.readStreamResult(res);

            if (json?.error) {
                const err: any = new Error(json.error.message);
                err.code = json.error.code;
                err.data = json.error.data;
                throw err;
            }

            return json?.result;
        }

        throw new Error(
            `Unsupported content-type: ${contentType}`
        );
    }

    /**
     * 从 SSE 流里读取「最终一条 JSON-RPC 响应」。
     * 用于 server/discover 这类需要拿到具体结果的请求，避免返回异步生成器。
     */
    private async readStreamResult(res: Response): Promise<any> {

        for await (const chunk of this.readStream(res)) {

            if (chunk.type === "done") {
                break;
            }

            if (chunk.type === "error") {
                throw chunk.data;
            }

            const data = chunk.data;

            // 找到带 id 的那条响应记录（通知类消息没有 result/error 结构）
            if (data && (data.result !== undefined || data.error !== undefined)) {
                return data;
            }
        }

        return undefined;
    }

    private async *readStream(
        res: Response
    ): AsyncGenerator<McpStreamChunk> {

        if (!res.body) {
            throw new Error("empty stream");
        }

        const reader = res.body.getReader();

        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {

            const { done, value } = await reader.read();

            if (done) {

                yield {
                    type: "done"
                };

                break;
            }

            buffer += decoder.decode(value, {
                stream: true
            });

            const chunks = buffer.split("\n\n");

            buffer = chunks.pop() || "";

            for (const chunk of chunks) {

                const lines = chunk
                    .split("\n")
                    .map(v => v.trim());

                for (const line of lines) {

                    if (!line.startsWith("data:")) {
                        continue;
                    }

                    const text = line
                        .slice(5)
                        .trim();

                    if (!text) {
                        continue;
                    }

                    if (text === "[DONE]") {

                        yield {
                            type: "done"
                        };

                        return;
                    }

                    try {

                        const data = JSON.parse(text);

                        yield {
                            type: "chunk",
                            data
                        };

                    } catch (err) {

                        yield {
                            type: "error",
                            data: err
                        };
                    }
                }
            }
        }
    }
}
