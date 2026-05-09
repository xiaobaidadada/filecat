import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import readline from "readline";
import {ai_mcp_server_item} from "../../../common/req/setting.req";
import {Env} from "../../../common/node/Env";

export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: any;
}

export interface JsonRpcResponse {
    jsonrpc?: "2.0";
    id?: number;
    result?: any;
    error?: {
        code?: number;
        message?: string;
        data?: any;
    };
}

export interface McpToolDefinition {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: any;
    };
}

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
    private pending = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void; timeout?: NodeJS.Timeout }>();
    private nextId = 1;
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
                console.error(`[MCP ${this.configName}] spawn error`, err);
                this.failAll(err);
            });
            this.child.on("exit", (code, signal) => {
                const err = new Error(`[MCP ${this.configName}] exited with code=${code} signal=${signal ?? ""}`);
                this.failAll(err);
                this.started = false;
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

            // 初始化协议调用
            await this.request("initialize", {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "filecat",
                    version: process.env.version || "dev"
                }
            });
            await this.notify("initialized", {});
            // 加载所有工具
            await this.reloadTools();
            this.started = true;
        } catch (err) {
            await this.close().catch(() => {});
            throw err;
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
        try {
            if (this.child && !this.child.killed) {
                try {
                    await this.request("shutdown", {}, 1000);
                } catch {}
                this.child.kill();
            }
        } catch {}
        this.failAll(new Error(`MCP ${this.configName} closed`), true);
        this.rl?.close();
        this.rl = null;
        this.child = null;
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
                pending.reject(new Error(item.error.message || `MCP error ${item.error.code ?? ""}`));
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
    public request(method: string, params?: any, timeoutMs = this.config.timeout_ms ?? 10000) {
        const child = this.child;
        if (!child || child.killed) {
            return Promise.reject(new Error(`MCP ${this.configName} not started`));
        }
        const id = this.nextId++;
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
}

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

        // initialize 会创建 session
        await this.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
                name: "filecat",
                version: process.env.version || "dev"
            }
        });

        await this.notify("initialized", {});

        await this.reloadTools();

        this.started = true;
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
        params?: any
    ): Promise<any | AsyncGenerator<McpStreamChunk>> {

        const id = this.nextId++;

        const wantStream = this.options.stream ?? false;

        const res = await fetch(this.options.endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify({
                jsonrpc: "2.0",
                id,
                method,
                params,
                stream: wantStream
            })
        });

        // 保存 session id
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

        const contentType =
            (res.headers.get("content-type") || "")
                .toLowerCase();

        // JSON 返回
        if (contentType.includes("application/json")) {

            const json = await res.json();

            if (json?.error) {
                throw new Error(json.error.message);
            }

            return json?.result;
        }

        // SSE 返回
        if (contentType.includes("text/event-stream")) {
            return this.readStream(res);
        }

        throw new Error(
            `Unsupported content-type: ${contentType}`
        );
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