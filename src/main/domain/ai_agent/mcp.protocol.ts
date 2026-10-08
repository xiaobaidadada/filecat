/**
 * MCP 协议版本协商（双时代 Client）
 *
 * 官方 MCP 自 2026-07-28 起引入了新的握手方式：
 *   新版：client 直接发 `server/discover`，server 回 supportedVersions/capabilities
 *   旧版：client 发 `initialize`，server 回 protocolVersion
 *
 * 为了同时兼容两代 server，这里实现与官方 SDK `versionNegotiation.ts` 等价的逻辑：
 *   1. 先用 `server/discover` 探测（id 用字符串，不占用正常请求的数字 id）
 *   2. 能识别为「现代」→ 直接按现代协议工作，跳过 initialize
 *   3. 识别为「老版本 / 不认识 / 超时」→ 回退走 `initialize`
 *
 * 与本项目相关的两个差异（按用户要求）：
 *   - stdio 探测超时 → 回退 initialize（本地管道沉默视为老 server）
 *   - http  探测超时 → 也回退 initialize（官方是直接报错，这里更宽容）
 */

/** 新版协议版本（2026-07-28 及以后视为「现代」） */
const MODERN_PROTOCOL_VERSION = "2026-07-28";

/** 老版协议版本：当前项目原本使用的版本，回退时用它 */
export const LEGACY_PROTOCOL_VERSION = "2024-11-05";

/** 协议探测的超时（毫秒）。比普通请求短，避免老 server 不认这个方法时长时间挂起 */
export const PROBE_TIMEOUT_MS = 5000;

/** 探测结果 */
export interface DiscoverProbeResult {
    /** 是否是现代协议 server */
    modern: boolean;
    /** server 返回的 DiscoverResult（仅现代有） */
    discover?: {
        supportedVersions?: string[];
        capabilities?: any;
        instructions?: string;
        serverInfo?: any;
    };
    /** 判定原因，便于日志排查 */
    reason: string;
}

/** 客户端身份信息，两个 transport 共用 */
export function buildClientInfo() {
    return {
        name: "filecat",
        version: process.env.version || "dev",
    };
}

/**
 * 判断某个版本号是否属于「现代协议」。
 * 现代协议从 2026-07-28 开始，版本号是 年-月-日 格式，直接字符串比较即可。
 */
function isModernProtocolVersion(version?: string): boolean {
    if (!version || typeof version !== "string") {
        return false;
    }
    const v = version.trim();
    // 形如 2026-07-28 的日期版本才参与比较
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return false;
    }
    return v >= MODERN_PROTOCOL_VERSION;
}

/**
 * 把 `server/discover` 的返回内容分类成「现代 / 回退」。
 *
 * 参照官方 probeClassifier 的保守原则：
 * 只有明确能识别为现代协议时才用现代，其余一律回退 initialize。
 */
export function classifyDiscoverResult(result: any): DiscoverProbeResult {
    if (!result || typeof result !== "object") {
        return {modern: false, reason: "discover 返回为空或非对象"};
    }

    const versions: string[] = Array.isArray(result.supportedVersions)
        ? result.supportedVersions
        : [];

    // 有 supportedVersions 且至少一个属于现代协议 → 现代
    if (versions.some((v) => isModernProtocolVersion(v))) {
        return {
            modern: true,
            reason: `server/discover 返回现代协议版本 ${versions.join(",")}`,
            discover: {
                supportedVersions: versions,
                capabilities: result.capabilities,
                instructions: result.instructions,
                serverInfo: result.serverInfo,
            },
        };
    }

    // 没有 capabilities 字段，不像是合法的新版 discover 结果
    if (!result.capabilities || typeof result.capabilities !== "object") {
        return {modern: false, reason: "discover 返回缺少 capabilities 字段"};
    }

    // 有 capabilities 但没有现代版本 → 视为老版本（继续按老协议走）
    return {
        modern: false,
        reason: versions.length
            ? `server/discover 只声明了老版本 ${versions.join(",")}`
            : "server/discover 未声明 supportedVersions",
    };
}

/** 判断一个错误是否是「方法不存在」（未知方法 → 老 server 的典型表现） */
export function isMethodNotFoundError(err: any): boolean {
    if (!err) return false;
    const code = err.code;
    // JSON-RPC 标准错误码：-32601 Method not found；-32600 Invalid Request；-32602 参数错误
    if (code === -32601 || code === -32600 || code === -32602) {
        return true;
    }
    const msg = String(err.message ?? err);
    return /method not found|-32601|unknown method|not supported/i.test(msg);
}
