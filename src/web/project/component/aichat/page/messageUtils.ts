/**
 * 消息数据转换工具函数
 * 负责 UI 消息 ↔ AI 消息的相互转换，以及从消息中提取文本
 */
import {
    ai_agent_message_attachment_item,
    ai_agent_message_item,
    getContentAsString
} from "../../../../../common/req/filecat.ai.pojo";
import { Message } from "./chatTypes";

/** 从一个 AI 消息项中提取纯文本内容 */
export function getMessageText(message: ai_agent_message_item): string {
    const content = getContentAsString(message.content);
    if (content) return content;
    const contentList = message.content_list ?? [];
    if (!contentList.length) return "";
    return contentList
        .map(it => getContentAsString(it.content))
        .filter(Boolean)
        .join("\n\n");
}

/**
 * 本地占位消息 id 生成器（消息尚未落盘时使用）。
 * 负数命名空间与位置派生的历史 id（1、2、3...）天然隔离，永不冲突。
 */
let placeholder_seed = 0;

/** 生成本地占位消息 id（负数） */
export function next_placeholder_id(): number {
    return -(++placeholder_seed);
}

/**
 * 将 AI 消息列表转换为 UI 层的 Message 列表
 * 仅保留 user / assistant 角色的消息
 *
 * id 由消息在【过滤后】列表中的位置派生：同一条消息无论转换多少次，
 * 只要它在数组中的位置不变，id 就不变，避免 React 全量重挂载。
 */
export function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    let idx = 0;
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it) => ({
            id: ++idx,
            sender: it.role === "assistant" ? "bot" : "user",
            text: getMessageText(it),
            attachments: it.attachments ?? [],
            // 实时消息（含刷新恢复的 live_messages）用 tool_call_ends 表达工具块，
            // 落盘历史消息用 content_list，这里统一成前端渲染需要的 content_list
            content_list: it.content_list ?? (it.tool_call_ends?.length
                ? [{ tool_call_ends: it.tool_call_ends, content: getMessageText(it), role: "assistant" }]
                : undefined),
            images: it.images,
            audio: it.audio,
            embeddings: it.embeddings,
            // 透传本轮耗时（仅 assistant 有），供气泡底部显示
            elapsed_ms: it.elapsed_ms,
        }));
}

/**
 * 将 UI 层的 Message 列表转换回 AI 消息格式
 */
export function toAiMessages(messages: Message[]): ai_agent_message_item[] {
    return messages.map(it => ({
        role: it.sender === "bot" ? "assistant" : "user",
        content: it.text,
        attachments: it.attachments ?? [],
        images: it.images,
        audio: it.audio,
        embeddings: it.embeddings,
    }));
}
