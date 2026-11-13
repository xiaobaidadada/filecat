import { ai_mcp_server_item } from "../../../../common/req/filecat.ai.pojo";

/**
 * 把对象转成后端 Env.load 能解析的 TEXT 文本（每行 KEY=VALUE）
 * MCP 的 env / headers 字段在库里存的就是这种文本，而不是 JSON
 */
function kv_to_text(obj?: Record<string, unknown>): string {
    if (!obj) return "";
    return Object.keys(obj)
        .filter((key) => key)
        .map((key) => {
            const value = obj[key];
            return `${key}=${value == null ? "" : String(value)}`;
        })
        .join("\n");
}

/**
 * args 字段：后端 parseArgString 既支持 JSON 数组也支持空格分隔，
 * 这里统一转成 JSON 数组字符串，避免参数里带空格时被拆错
 */
function args_to_text(args?: unknown): string {
    if (args == null) return "";
    if (Array.isArray(args)) return JSON.stringify(args.map((v) => String(v)));
    return String(args);
}

/**
 * 把单条外部 MCP 配置转成 filecat 的 ai_mcp_server_item
 * 支持三种主流格式：
 *   { type: "sse", url, headers }
 *   { type: "streamable-http", url, headers }
 *   { type: "stdio", command, args, env }
 * 另外兼容不带 type 的写法（按 command / url 推断），以及 VS Code 的 servers 风格
 */
function raw_to_item(name: string, raw: any): ai_mcp_server_item | null {
    if (!raw || typeof raw !== "object") return null;

    const type = String(raw.type ?? raw.transport ?? "").toLowerCase();
    // url 可能叫 url / endpoint / serverUrl
    const url = raw.url ?? raw.endpoint ?? raw.serverUrl ?? raw.server_url ?? "";
    const command = raw.command ?? "";

    const is_http = type === "sse" || type === "http" || type === "streamable-http" || type === "streamablehttp"
        ? true
        : type === "stdio"
            ? false
            // 没有 type 时按有没有 command 判断
            : !command && !!url;

    if (is_http) {
        if (!url) return null;
        const headers = raw.headers ?? raw.header ?? {};
        return {
            name,
            open: false,
            note: "",
            transport: "http",
            command: "",
            endpoint: String(url).trim(),
            headers: kv_to_text(headers),
        };
    }

    if (!command) return null;
    return {
        name,
        open: false,
        note: "",
        transport: "stdio",
        command: String(command).trim(),
        args: args_to_text(raw.args),
        cwd: raw.cwd == null ? "" : String(raw.cwd),
        env: kv_to_text(raw.env),
    };
}

/** 从一条原始配置里取名字，取不到就用 command 或 url 兜底 */
function pick_name(raw: any, fallback: string): string {
    const name = raw?.name ?? raw?.server_name ?? raw?.serverName;
    if (name) return String(name).trim();
    if (raw?.command) {
        const argv = Array.isArray(raw.args) ? raw.args : [];
        const first = String(raw.command).replace(/\\/g, "/").split("/").pop();
        return [first, ...argv.slice(0, 1)].filter(Boolean).join(" ");
    }
    const url = raw?.url ?? raw?.endpoint ?? raw?.serverUrl;
    if (url) return String(url);
    return fallback;
}

export interface McpImportResult {
    /** 解析成功、可加入列表的条目 */
    items: ai_mcp_server_item[];
    /** 解析失败的条目名，用于提示 */
    failed: string[];
}

/**
 * 解析用户粘贴的 MCP 导入文本。
 * 支持：
 *   1. 单个对象        { type: "stdio", command: "npx", args: [...] }
 *   2. 对象数组        [ {...}, {...} ]
 *   3. Claude 风格     { mcpServers: { 名称: {...} } }
 *   4. 裸映射           { 名称: {...}, 名称2: {...} }
 */
export function parse_mcp_import(text: string): McpImportResult {
    const result: McpImportResult = { items: [], failed: [] };
    const source = (text ?? "").trim();
    if (!source) throw new Error("empty");

    let data: any;
    try {
        data = JSON.parse(source);
    } catch {
        throw new Error("invalid_json");
    }

    // 收集待处理的 [名字, 原始配置] 对
    const pairs: Array<[string, any]> = [];
    const push_pairs = (obj: any) => {
        Object.keys(obj ?? {}).forEach((key) => pairs.push([key, obj[key]]));
    };

    if (Array.isArray(data)) {
        data.forEach((raw, index) => pairs.push([pick_name(raw, `mcp_${index + 1}`), raw]));
    } else if (data && typeof data === "object" && data.mcpServers && typeof data.mcpServers === "object") {
        push_pairs(data.mcpServers);
    } else if (data && typeof data === "object" && (data.command || data.url || data.type)) {
        // 单个条目
        pairs.push([pick_name(data, "mcp"), data]);
    } else if (data && typeof data === "object") {
        // 裸映射：{ 名称: {...} }
        push_pairs(data);
    } else {
        throw new Error("invalid_json");
    }

    pairs.forEach(([name, raw]) => {
        const item = raw_to_item(name, raw);
        if (item) {
            result.items.push(item);
        } else {
            result.failed.push(name);
        }
    });

    return result;
}
