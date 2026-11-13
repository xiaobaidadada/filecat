import { ai_mcp_server_item } from "../../../../common/req/filecat.ai.pojo";

/**
 * Convert a key-value object into Env.load compatible text (one KEY=VALUE per line).
 * MCP env / headers are stored as this text format, not JSON.
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
 * The backend stores args as a space separated string (e.g. "windows-mcp serve").
 * Arrays are joined with spaces to keep the same format as existing data.
 */
function args_to_text(args?: unknown): string {
    if (args == null) return "";
    if (Array.isArray(args)) return args.map((v) => String(v)).join(" ");
    return String(args);
}

/**
 * Convert a single external MCP entry into ai_mcp_server_item.
 * Supported inputs:
 *   { type: "sse", url, headers }
 *   { type: "streamable-http", url, headers }
 *   { type: "stdio", command, args, env }
 * Entries without type are detected by command / url.
 */
function raw_to_item(name: string, raw: any): ai_mcp_server_item | null {
    if (!raw || typeof raw !== "object") return null;

    const type = String(raw.type ?? raw.transport ?? "").toLowerCase();
    const url = raw.url ?? raw.endpoint ?? raw.serverUrl ?? raw.server_url ?? "";
    const command = raw.command ?? "";

    const is_http = type === "sse" || type === "http" || type === "streamable-http" || type === "streamablehttp"
        ? true
        : type === "stdio"
            ? false
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

/**
 * Pick a display name for the imported entry.
 * Falls back to the command executable name or the url.
 */
function pick_name(raw: any, fallback: string): string {
    const name = raw?.name ?? raw?.server_name ?? raw?.serverName;
    if (name) return String(name).trim();
    if (raw?.command) {
        const first = String(raw.command).replace(/\\/g, "/").split("/").pop();
        return first;
    }
    const url = raw?.url ?? raw?.endpoint ?? raw?.serverUrl;
    if (url) return String(url);
    return fallback;
}

export interface McpImportResult {
    items: ai_mcp_server_item[];
    failed: string[];
}

/**
 * Parse pasted MCP config text. Accepted shapes:
 *   1. single object   { type: "stdio", command: "npx", args: [...] }
 *   2. array           [ {...}, {...} ]
 *   3. claude style    { mcpServers: { name: {...} } }
 *   4. plain map       { name: {...}, name2: {...} }
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

    const pairs: Array<[string, any]> = [];
    const push_pairs = (obj: any) => {
        Object.keys(obj ?? {}).forEach((key) => pairs.push([key, obj[key]]));
    };

    if (Array.isArray(data)) {
        data.forEach((raw, index) => pairs.push([pick_name(raw, `mcp_${index + 1}`), raw]));
    } else if (data && typeof data === "object" && data.mcpServers && typeof data.mcpServers === "object") {
        push_pairs(data.mcpServers);
    } else if (data && typeof data === "object" && (data.command || data.url || data.type)) {
        pairs.push([pick_name(data, "mcp"), data]);
    } else if (data && typeof data === "object") {
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
