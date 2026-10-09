
import {
    getToolTextContent,
    HttpMcpTransport,
    IMcpTransport,
    McpRuntimeToolInfo,
    McpToolDefinition,
    parseHeaderText,
    sanitizeName,
    StdioMcpServerClient
} from "./mcp.cleint";
import {
    ai_mcp_server_item,
    ai_mcp_server_tool_group,
    ai_mcp_server_tool_item
} from "../../../common/req/filecat.ai.pojo";
import {CmdType} from "../../../common/frame/WsData";
import {settingService} from "../setting/setting.service";

/** 单个 MCP 服务的加载状态 */
export type mcp_load_state_type = "loading" | "success" | "failed" | "idle";

/** 单个 MCP 的加载状态快照（推送给前端展示） */
export interface mcp_load_status_item {
    /** 在 mcp_setting.list 中的下标 */
    index: number;
    /** 客户端 key（与 getServerToolGroups 一致） */
    key: string;
    name: string;
    state: mcp_load_state_type;
    /** 失败原因（state=failed 时有值） */
    error?: string;
    /** 加载到的工具数量（state=success 时有值） */
    tool_count?: number;
}

/**
 * 状态推送订阅者接口：只需要 id 和发送能力，便于测试与解耦。
 * 实际就是 ws 连接（Wss），这里不直接依赖 ws 模块避免循环引用。
 */
export interface mcp_status_subscriber {
    /** 连接唯一 id */
    id: string;
    /** 发送一条业务消息 */
    send(cmdType: any, data: any): void;
}

export class AiMcpRuntimeService {
    private clients = new Map<string, IMcpTransport>();
    private toolMap = new Map<string, McpRuntimeToolInfo & { runtime_name: string }>();
    private toolToClient = new Map<string, { clientKey: string; originalToolName: string }>();
    private clientTools = new Map<string, string[]>();
    private loadingPromise: Promise<void> | null = null;

    /**
     * 当前这一轮加载的状态表，key 为客户端 key。
     * 前端通过 ws 拿到它来显示「加载中 / 加载成功 / 加载失败」。
     */
    private load_status = new Map<string, mcp_load_status_item>();

    /**
     * 订阅了 MCP 加载状态的连接集合（请求过 mcp_reload 的 ws 连接）。
     * 用集合而非单个回调：同一用户的多个标签页都能实时看到加载状态。
     */
    private status_subscribers = new Set<mcp_status_subscriber>();

    /**
     * 每轮加载的「代号」。每次 reload 自增，
     * 旧的一轮在 await 之间的检查点发现自己已过期就直接退出，实现「重新保存时中止上一次」。
     */
    private load_epoch = 0;

    public add_status_subscriber(sub: mcp_status_subscriber) {
        this.status_subscribers.add(sub);
    }

    public remove_status_subscriber(sub: mcp_status_subscriber) {
        this.status_subscribers.delete(sub);
    }

    /** 取当前所有 MCP 的加载状态（首次进设置页时前端可先拉一次） */
    public get_load_status(): mcp_load_status_item[] {
        return [...this.load_status.values()].sort((a, b) => a.index - b.index);
    }

    /** 状态推送合并标记，避免并行加载时瞬间推送 N 次 */
    private status_push_pending = false;
    private status_done_pending = false;

    /**
     * 推送一次当前状态；done 表示整轮加载是否结束。
     * 同一轮微任务内的多次调用会合并成一次推送（并行加载时每台完成都会调，没必要推 N 次）。
     */
    private push_status(done: boolean) {
        if (!this.status_subscribers.size) {
            return;
        }
        this.status_done_pending = this.status_done_pending || done;
        if (this.status_push_pending) {
            return;
        }
        this.status_push_pending = true;
        queueMicrotask(() => {
            this.status_push_pending = false;
            const is_done = this.status_done_pending;
            this.status_done_pending = false;
            const status = this.get_load_status();
            for (const sub of [...this.status_subscribers]) {
                try {
                    sub.send(CmdType.mcp_status, {status, done: is_done});
                } catch (e) {
                    // 连接可能已断开，忽略；断开的连接会在 setClose 里被移除
                }
            }
        });
    }

    private buildClientKey(item: ai_mcp_server_item, index: number) {
        return `mcp_${index}_${sanitizeName(item.name || item.note)}`;
    }

    private createClient(item: ai_mcp_server_item, key: string): IMcpTransport | null {
        if (item.transport === "http") {
            if (!item.endpoint) {
                return null;
            }
            return new HttpMcpTransport({
                endpoint: item.endpoint,
                headers: parseHeaderText(item.headers),
                // 超时从配置透传
                // timeout_ms: item.timeout_ms
            });
        }
        if (!item.command) {
            return null;
        }
        return new StdioMcpServerClient(item, key);
    }

    /**
     * 启动单个 MCP 客户端，并返回这一台的加载结果状态。
     * 注意：这个方法本身不写 load_status，由调用方统一管理，避免并发覆盖。
     * @param epoch 当前轮的代号；启动完成后若已过期（有更新的一轮），则不写入全局索引，避免污染新一轮。
     */
    private async startClient(item: ai_mcp_server_item, index: number, epoch?: number): Promise<mcp_load_status_item> {
        const key = this.buildClientKey(item, index);
        const base: mcp_load_status_item = {
            index,
            key,
            name: item.name || item.note || `MCP ${index}`,
            state: "idle"
        };

        if (!item?.open) {
            // 未开启的服务器不加载，也不显示为失败
            return base;
        }

        await this.closeClient(key);

        const client = this.createClient(item, key);
        if (!client) {
            return {...base, state: "failed", error: "配置不完整（缺少 command / endpoint）"};
        }

        try {
            await client.start();
            // 启动期间若已被更新的一轮取代：关掉这个迟到的 client，不写入索引
            if (epoch !== undefined && epoch !== this.load_epoch) {
                await client.close().catch(() => {});
                return {...base, state: "idle"};
            }
            this.clients.set(key, client);

            const runtimeNames: string[] = [];
            for (const tool of client.runtime_tools) {
                const runtimeName = `mcp__${sanitizeName(key)}__${sanitizeName(tool.tool_name)}`;
                const info = {...tool, runtime_name: runtimeName};
                this.toolMap.set(runtimeName, info);
                this.toolToClient.set(runtimeName, {
                    clientKey: key,
                    originalToolName: tool.tool_name
                });
                runtimeNames.push(runtimeName);
            }
            this.clientTools.set(key, runtimeNames);
            console.log(`MCP service ${key} loaded ${client.runtime_tools?.length ?? 0} tools`);
            return {...base, state: "success", tool_count: runtimeNames.length};
        } catch (err: any) {
            console.error(`[MCP ${key}] start failed`, err);
            await client.close().catch(() => {});
            return {...base, state: "failed", error: err?.message ?? String(err)};
        }
    }

    private async closeClient(key: string) {
        const client = this.clients.get(key);
        this.clients.delete(key);
        this.clientTools.delete(key);
        for (const [runtimeName, meta] of [...this.toolToClient.entries()]) {
            if (meta.clientKey === key) {
                this.toolToClient.delete(runtimeName);
                this.toolMap.delete(runtimeName);
            }
        }
        if (client) {
            await client.close().catch(() => {});
        }
    }

    /**
     * 重新加载所有 MCP 服务。
     *
     * 「中止上一次」的实现（关键：**抢占而非排队**）：
     *   - 调用时立刻让 load_epoch 自增，使正在跑的那一轮的所有检查点全部失效；
     *   - 上一轮会在最近的一个检查点发现自己已过期，立刻停止加载后续 server 并返回；
     *   - 因此这里**不等待**上一轮完成，而是立即开始新一轮，避免「保存后要点两次才生效」。
     *
     * 返回的 promise 只代表「本轮」结束，调用方（ws）一般不 await 它。
     */
    public reload(): Promise<void> {
        // 立刻抢占：让上一轮失效
        const epoch = ++this.load_epoch;
        const promise = this.reloadInner(epoch);
        this.loadingPromise = promise;
        promise.finally(() => {
            // 只有自己仍是最后一轮时才清空，避免把新一轮的 promise 清掉
            if (this.loadingPromise === promise) {
                this.loadingPromise = null;
            }
        });
        return promise;
    }

    /**
     * 等待当前这一轮加载结束（不触发新的加载）。
     * 供需要「等 MCP 就绪」的场景使用（如启动时串行加载）。
     */
    public async waitLoading(): Promise<void> {
        if (this.loadingPromise) {
            await this.loadingPromise;
        }
    }

    private async reloadInner(epoch: number) {
        // 关掉全部旧连接（这一步也是「中止上一次加载」的关键：旧进程会被 kill）
        await this.close(epoch);
        // close 是异步的，期间可能已经有更新的一轮开始了，此时直接退出，交给新一轮
        if (epoch !== this.load_epoch) {
            return;
        }
        this.load_status.clear();

        const list = settingService.ai_mcp_setting().list ?? [];

        // 初始化状态表：全部标记为 idle
        for (let i = 0; i < list.length; i++) {
            const key = this.buildClientKey(list[i], i);
            this.load_status.set(key, {
                index: i,
                key,
                name: list[i].name || list[i].note || `MCP ${i}`,
                state: "idle"
            });
        }
        this.push_status(false);

        for (let i = 0; i < list.length; i++) {
            // 检查点：本轮已被更新的一轮取代，立即退出
            if (epoch !== this.load_epoch) {
                return;
            }

            const item = list[i];
            const key = this.buildClientKey(item, i);

            // 未开启的直接跳过（保持 idle）
            if (!item?.open) {
                continue;
            }

            // 标记为加载中并推送（先让前端看到「全部在加载中」）
            this.load_status.set(key, {
                index: i,
                key,
                name: item.name || item.note || `MCP ${i}`,
                state: "loading"
            });
        }
        this.push_status(false);

        // 并行加载所有已开启的 MCP：互不阻塞，慢的不会拖住快的
        const tasks = list.map(async (item, i) => {
            if (!item?.open) {
                return;
            }
            if (epoch !== this.load_epoch) {
                return;
            }
            const key = this.buildClientKey(item, i);
            const result = await this.startClient(item, i, epoch);
            // 加载期间被新一轮取代：丢弃本次结果
            if (epoch !== this.load_epoch) {
                return;
            }
            this.load_status.set(key, result);
            this.push_status(false);
        });

        await Promise.all(tasks);

        if (epoch === this.load_epoch) {
            this.push_status(true);
        }
    }

    public async reloadServer(index: number) {
        const list = settingService.ai_mcp_setting().list ?? [];
        const item = list[index];
        if (!item) {
            throw new Error(`未找到 MCP 服务: ${index}`);
        }
        const key = this.buildClientKey(item, index);
        // 单台重载：标记加载中并推送
        this.load_status.set(key, {
            index,
            key,
            name: item.name || item.note || `MCP ${index}`,
            state: "loading"
        });
        this.push_status(false);

        const result = await this.startClient(item, index);
        this.load_status.set(key, result);
        this.push_status(false);

        const groups = await this.getServerToolGroups();
        return groups.find((group) => group.index === index) ?? null;
    }

    /**
     * 关闭所有客户端并清空工具索引。
     * @param epoch 传了就做「过期检查」：close 期间若已被更新的一轮取代，就直接返回不清理，
     *              避免把新一轮刚建好的 client / 工具索引误删。
     */
    public async close(epoch?: number) {
        const keys = [...this.clients.keys()];
        await Promise.all(keys.map((key) => this.closeClient(key)));
        // 本轮已被取代：不要把新一轮的索引清掉
        if (epoch !== undefined && epoch !== this.load_epoch) {
            return;
        }
        this.clients.clear();
        this.toolMap.clear();
        this.toolToClient.clear();
        this.clientTools.clear();
    }

    public async getServerToolGroups(): Promise<ai_mcp_server_tool_group[]> {
        const {settingService} = await import("../setting/setting.service");
        const list = settingService.ai_mcp_setting().list ?? [];
        return list.map((item: ai_mcp_server_item, index: number) => {
            const key = this.buildClientKey(item, index);
            const runtimeNames = this.clientTools.get(key) ?? [];
            const tools = runtimeNames
                .map((runtimeName): ai_mcp_server_tool_item | null => {
                    const tool = this.toolMap.get(runtimeName);
                    if (!tool) return null;
                    return {
                        runtime_name: tool.runtime_name,
                        tool_name: tool.tool_name,
                        display_name: tool.display_name,
                        description: tool.description,
                        input_schema: tool.input_schema
                    };
                })
                .filter(Boolean) as ai_mcp_server_tool_item[];

            return {
                index,
                key,
                name: item.name || "",
                note: item.note,
                transport: item.transport ?? "stdio",
                open: !!item.open,
                loaded: this.clients.has(key),
                tool_count: tools.length,
                tools,
                // 加载状态：loading / success / failed / idle（取自状态表）
                state: this.load_status.get(key)?.state ?? "idle",
                error: this.load_status.get(key)?.error
            };
        });
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
        if (client.ensureStarted) {
            await client.ensureStarted();
        }
        const res = await client.request("tools/call", {
            name: meta.originalToolName,
            arguments: args
        });
        return getToolTextContent(res);
    }
}

export const ai_agentMcpService = new AiMcpRuntimeService();
