/**
 * 消息数据转换工具函数
 * 负责 UI 消息 ↔ AI 消息的相互转换，以及从消息中提取文本
 */
import {
    ai_agent_ask_user,
    ai_agent_message_attachment_item,
    ai_agent_message_item,
    getContentAsString
} from "../../../../../common/req/filecat.ai.pojo";
import { Message } from "./chatTypes";

/** 从一个 AI 消息项中提取纯文本内容 */
export function getMessageText(message: ai_agent_message_item): string {
    if (!message) return "";
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
    const result: Message[] = [];
    if (!Array.isArray(messages)) return result;
    for (const it of messages) {
        if (!it || (it.role !== "user" && it.role !== "assistant")) continue;

        // 一条消息可能由多段组成（content_list），每段要么是内容，要么是等待用户处理的交互。
        // 统一按「段」遍历，不关心交互段在哪个位置：
        //  - 内容段 → 合并成一个气泡
        //  - 未处理的 ask_user 段 → 渲染确认卡片
        //  - 已确认的 ask_user 段 → 跳过（后端已置 confirmed = true）
        const has_list = !!it.content_list?.length;
        const parts = has_list
            ? it.content_list!
            : [{role: it.role, content: it.content, tool_call_ends: it.tool_call_ends, message_type: it.message_type, ask_user: it.ask_user}];

        const content_parts = parts.filter(p => p.message_type !== "ask_user");
        const pending_asks = parts.filter(p => p.message_type === "ask_user" && p.ask_user && p.ask_user.confirmed !== true);

        // 只有真的有内容才产生气泡，避免空气泡
        const text = content_parts.map(p => getContentAsString(p.content)).filter(Boolean).join("\n\n");
        const has_tool = content_parts.some(p => p.tool_call_ends?.length);
        if (text || has_tool || it.images?.length || it.audio || it.attachments?.length) {
            result.push({
                id: ++idx,
                sender: it.role === "assistant" ? "bot" : "user",
                text,
                attachments: it.attachments ?? [],
                content_list: has_tool ? content_parts : undefined,
                images: it.images,
                audio: it.audio,
                embeddings: it.embeddings,
                // 透传本轮耗时（仅 assistant 有），供气泡底部显示
                elapsed_ms: it.elapsed_ms,
            });
        }

        for (const p of pending_asks) {
            result.push({
                id: ++idx,
                sender: "bot",
                text: "",
                interactive: to_interactive(p.ask_user!),
            });
        }
    }
    return result;
}

/** 把落盘的 ask_user 转成前端渲染用的交互结构 */
function to_interactive(ask: ai_agent_ask_user): NonNullable<Message['interactive']> {
    if (ask.kind === "confirm_cmd") {
        return {kind: "confirm_cmd", ask_id: ask.ask_id, cmd: ask.cmd};
    }
    return {
        kind: "ask_user",
        ask_id: ask.ask_id,
        title: ask.title,
        description: ask.description,
        fields: ask.fields ?? [],
    };
}

/**
 * 将 UI 层的 Message 列表转换回 AI 消息格式
 */
export function toAiMessages(messages: Message[]): ai_agent_message_item[] {
    // 交互卡片是纯前端确认消息，没有内容，不能带进模型上下文
    return messages.filter(it => !it.interactive).map(it => ({
        role: it.sender === "bot" ? "assistant" : "user",
        content: it.text,
        attachments: it.attachments ?? [],
        images: it.images,
        audio: it.audio,
        embeddings: it.embeddings,
    }));
}
