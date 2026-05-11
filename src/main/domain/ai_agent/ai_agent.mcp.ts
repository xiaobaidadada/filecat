import {ai_mcp_server_item, ai_mcp_server_tool_group, ai_mcp_server_tool_item} from "../../../common/req/setting.req";
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


export class AiMcpRuntimeService {
    private clients = new Map<string, IMcpTransport>();
    private toolMap = new Map<string, McpRuntimeToolInfo & { runtime_name: string }>();
    private toolToClient = new Map<string, { clientKey: string; originalToolName: string }>();
    private clientTools = new Map<string, string[]>();
    private loadingPromise: Promise<void> | null = null;

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
                headers: parseHeaderText(item.headers)
            });
        }
        if (!item.command) {
            return null;
        }
        return new StdioMcpServerClient(item, key);
    }

    private async startClient(item: ai_mcp_server_item, index: number) {
        if (!item?.open) {
            return;
        }
        const key = this.buildClientKey(item, index);
        await this.closeClient(key);

        const client = this.createClient(item, key);
        if (!client) {
            return;
        }

        try {
            await client.start();
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
        } catch (err) {
            console.error(`[MCP ${key}] start failed`, err);
            await client.close().catch(() => {});
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
            await this.startClient(list[i], i);
        }
    }

    public async reloadServer(index: number) {
        const {settingService} = await import("../setting/setting.service");
        const list = settingService.ai_mcp_setting().list ?? [];
        const item = list[index];
        if (!item) {
            throw new Error(`未找到 MCP 服务: ${index}`);
        }
        await this.startClient(item, index);
        const groups = await this.getServerToolGroups();
        return groups.find((group) => group.index === index) ?? null;
    }

    public async close() {
        const keys = [...this.clients.keys()];
        await Promise.all(keys.map((key) => this.closeClient(key)));
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
                error: undefined
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
