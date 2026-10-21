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
 * 消息 id 自增种子。不能只用 Date.now() + index：
 * 一次页面加载里 toUiMessages 会被调用多次（历史消息、实时消息、结束收尾各一次），
 * 各次的下标都从 0 开始，同一毫秒内会生成重复 id，引发 React key 冲突。
 */
let msg_id_seed = 0;

/** 生成全局唯一的消息 id */
export function next_msg_id(): number {
    return ++msg_id_seed;
}

/**
 * 将 AI 消息列表转换为 UI 层的 Message 列表
 * 仅保留 user / assistant 角色的消息
 */
export function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it) => ({
            id: next_msg_id(),
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
