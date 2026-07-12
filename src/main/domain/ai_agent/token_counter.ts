/**
 * Token 计数工具（服务端）
 *
 * 通过子线程（ai_agent.worker.ts）中的 jieba-wasm 分词估算 token。
 * - 中文：分词后 × 1.3
 * - 英文：字符 / 4
 */

import { formatTokenCount } from "../../../common/token_counter";
import { ThreadsFilecat } from "../../threads/filecat/threads.filecat";
import { threads_msg_type } from "../../threads/threads.type";

/**
 * 通过子线程估算 token 数（异步，会 await 等待子线程返回）
 * 子线程不可用时降级字符/4
 */
export async function estimateTokenCount(text: string): Promise<number> {
    if (!text) return 0;

    try {
        if (ThreadsFilecat.is_running) {
            return await ThreadsFilecat.post(threads_msg_type.estimate_token_count, { text }, 3000);
        }
    } catch {}

    return Math.ceil(text.length / 4);
}

export { formatTokenCount };
