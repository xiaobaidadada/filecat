import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import readline from "readline";
import {Env} from "../../../common/node/Env";
import {ai_mcp_server_item} from "../../../common/req/setting.req";

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
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

function sanitizeName(name: string) {
    return (name || "")
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function parseArgString(argStr?: string): string[] {
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

function parseEnvText(envText?: string) {
    const env: Record<string, any> = {};
    if (!envText) return env;
    Env.load(envText, env);
    return env;
}

function getToolTextContent(result: any) {
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

class StdioMcpServerClient {
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

            // 将输出格式化
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

    public async callTool(toolName: string, args: any) {
        await this.ensureStarted();
        const res = await this.request("tools/call", {
            name: toolName,
            arguments: args
        });
        return getToolTextContent(res);
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
    private request(method: string, params?: any, timeoutMs = this.config.timeout_ms ?? 10000) {
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

    private notify(method: string, params?: any) {
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

export class AiMcpRuntimeService {
    private clients = new Map<string, StdioMcpServerClient>();
    private toolMap = new Map<string, McpRuntimeToolInfo & { runtime_name: string }>();
    private toolToClient = new Map<string, { clientKey: string; originalToolName: string }>();
    private loadingPromise: Promise<void> | null = null;

    private buildClientKey(item: ai_mcp_server_item, index: number) {
        return `${index}__${sanitizeName(item.name || item.note || `mcp_${index}`)}`;
    }

    public async reload() {
        if (this.loadingPromise) {
            await this.loadingPromise;
        }
        this.loadingPromise = this.reloadInner();
        try {
            await this.loadingPromise;
        } finally {
            this.loadingPromise = null;
        }
    }

    private async reloadInner() {
        await this.close();
        const {settingService} = await import("../setting/setting.service");
        const list = settingService.ai_mcp_setting().list ?? [];
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item?.open) continue;
            if (!item.command) continue;
            const key = this.buildClientKey(item, i);
            const client = new StdioMcpServerClient(item, key);
            try {
                await client.start();
                this.clients.set(key, client);
                for (const tool of client.runtime_tools) {
                    const runtimeName = `mcp__${sanitizeName(key)}__${sanitizeName(tool.tool_name)}`;
                    const info = {...tool, runtime_name: runtimeName};
                    this.toolMap.set(runtimeName, info);
                    this.toolToClient.set(runtimeName, {
                        clientKey: key,
                        originalToolName: tool.tool_name
                    });
                }
            } catch (err) {
                console.error(`[MCP ${key}] start failed`, err);
            }
        }
    }

    public async close() {
        const clients = [...this.clients.values()];
        this.clients.clear();
        this.toolMap.clear();
        this.toolToClient.clear();
        await Promise.all(clients.map(client => client.close().catch(() => {})));
    }

    public getTools(): McpToolDefinition[] {
        return [...this.toolMap.values()].map((tool) => ({
            type: "function",
            function: {
                name: tool.runtime_name,
                description: tool.description ? `[${tool.server_label}] ${tool.description}` : `[${tool.server_label}] ${tool.tool_name}`,
                parameters: tool.input_schema ?? {type: "object", properties: {}}
            }
        }));
    }

    public getToolInfo(toolName: string, args: any) {
        const info = this.toolMap.get(toolName);
        if (!info) return null;
        return {
            get_name: () => `${info.server_label}/${info.tool_name}`,
            get_params: () => ` ${JSON.stringify(args ?? {}).slice(0, 500)}`
        };
    }

    public hasTool(toolName: string) {
        return this.toolToClient.has(toolName);
    }

    public async callTool(toolName: string, args: any) {
        const meta = this.toolToClient.get(toolName);
        if (!meta) {
            throw new Error(`未找到 MCP 工具: ${toolName}`);
        }
        const client = this.clients.get(meta.clientKey);
        if (!client) {
            throw new Error(`MCP 客户端未启动: ${meta.clientKey}`);
        }
        return client.callTool(meta.originalToolName, args);
    }
}

export const ai_agentMcpService = new AiMcpRuntimeService();
