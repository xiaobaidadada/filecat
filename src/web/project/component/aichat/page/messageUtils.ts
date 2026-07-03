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
 * 将 AI 消息列表转换为 UI 层的 Message 列表
 * 仅保留 user / assistant 角色的消息
 */
export function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it, index) => ({
            id: Date.now() + index,
            sender: it.role === "assistant" ? "bot" : "user",
            text: getMessageText(it),
            attachments: it.attachments ?? [],
            content_list: it.content_list,
            images: it.images,
            audio: it.audio,
            embeddings: it.embeddings,
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
