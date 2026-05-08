import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import readline from "readline";
import {Env} from "../../../common/node/Env";
import {ai_mcp_server_item} from "../../../common/req/setting.req";
import {
    getToolTextContent,
    IMcpTransport,
    McpRuntimeToolInfo,
    McpToolDefinition,
    sanitizeName,
    StdioMcpServerClient
} from "./mcp.cleint";


export class AiMcpRuntimeService {
    private clients = new Map<string, IMcpTransport>();
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
        client?.ensureStarted();
        const res = await client.request("tools/call", {
            name: toolName,
            arguments: args
        });
        return getToolTextContent(res);
        // return client.callTool(meta.originalToolName, args);
    }


}

export const ai_agentMcpService = new AiMcpRuntimeService();
