import {Ai_agentTools_type} from "../ai_agent.tools";

/**
 * 工具会话清理登记表。
 *
 * 用 Map 而不是在注册表里加字段，是为了不污染 Ai_agentTools 的类型推导
 * （Ai_agentTools 的 key 会被推导成 Ai_agentTools_type，加额外字段会把清理函数也纳入联合类型）。
 *
 * key 是工具名，value 是按 session_id 清理该工具留下的运行时资源。
 */
const session_cleaners = new Map<string, (session_id: string) => void | Promise<void>>();

/**
 * 注册一个工具的会话清理逻辑。
 *
 * 注意这里只登记、不执行。真正的执行统一走 cleanup_session，
 * 这样新增工具时不需要再去会话结束的地方改代码。
 */
export function register_session_cleaner(
    tool_name: Ai_agentTools_type,
    cleaner: (session_id: string) => void | Promise<void>,
): void {
    session_cleaners.set(tool_name, cleaner);
}

/**
 * 会话结束时统一清理所有工具留下的资源。
 *
 * 调用点只有 chat.core 的 endOnce，新增工具只要自己 register_session_cleaner，
 * 不需要在会话结束逻辑里加分支。
 *
 * 单个清理函数抛错不影响其它工具继续清理。
 */
export async function cleanup_session(session_id: string): Promise<void> {
    for (const [tool_name, cleaner] of session_cleaners) {
        try {
            await cleaner(session_id);
        } catch (e: any) {
            console.error(`[cleanup_session] 清理工具 ${tool_name} 失败:`, e?.message ?? e);
        }
    }
}
