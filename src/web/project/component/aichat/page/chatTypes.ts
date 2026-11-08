/**
 * 聊天相关类型定义
 * 从 AiAgentChatPage 中抽离，供各子组件/hook 共享
 */
import { ai_agent_message_attachment_item, ai_agent_message_item, getContentAsString } from "../../../../../common/req/filecat.ai.pojo";

/** UI 层的消息气泡 */
export interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    attachments?: ai_agent_message_attachment_item[];
    content_list?: ai_agent_message_item[];
    /** 多模态结果属性（由后端返回，前端自判断渲染，有哪个就渲染哪个） */
    images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    audio?: { data?: string; url?: string; mime_type?: string };
    embeddings?: any;
    /** 是否为加载中状态的气泡（显示 "AI思考中..." 动画） */
    is_loading?: boolean;
    /** 消息块序号（来自后端 ai_chat_msg 的 chunk_index），同一序号的内容合并到同一个气泡 */
    chunk_index?: number;
    /** 消息块类型（工具调用开始/结束/普通文本） */
    msg_type?: 'text' | 'tool_start' | 'tool_end';
    /** 本轮 AI 回复耗时（毫秒），仅 bot 消息有值；用于气泡底部显示耗时 */
    elapsed_ms?: number;
    /**
     * 交互请求：命令确认 / AI 提问。
     * 有值时这个气泡渲染成交互卡片（确认按钮 / 表单），而不是普通文本。
     */
    interactive?: {
        /** 请求类型 */
        kind: 'confirm_cmd' | 'ask_user';
        /** 唯一 id，回传答案时带上 */
        ask_id: string;
        /** 所属会话，回传时一并带上 */
        session_id?: string;
        /** 命令确认：待执行的命令 */
        cmd?: string;
        /** ask_user：标题与说明 */
        title?: string;
        description?: string;
        /** ask_user：要用户填写的字段 */
        fields?: any[];
        /** 用户已处理完成（回答/允许/拒绝/超时），卡片转为只读展示 */
        resolved?: boolean;
    };
}

/**
 * 把一条消息还原成纯文本 —— 复制按钮、批量复制、「全部复制」共用。
 *
 * 必须与气泡的实际渲染内容保持一致（见 RequestTypeRenderers.renderOrderedContent）：
 * bot 消息的正文分散在 content_list 的各个 part 里，只用 msg.text 会丢掉前面几段
 * （这正是以前「复制出来的内容和看到的对不上」的原因）。
 *
 * 拼接顺序也照渲染顺序来：附件 → content_list（各段正文 + 工具调用摘要）→ text 兜底。
 */
export function message_to_text(msg: Message): string {
    const blocks: string[] = [];

    // 附件（用户上传的文件）
    if (msg.attachments?.length) {
        blocks.push(msg.attachments.map(a => `[附件] ${a.name}`).join("\n"));
    }

    // bot 消息的正文在 content_list 里，逐段取出（与渲染同一函数，保证内容一致）
    if (msg.content_list?.length) {
        for (const part of msg.content_list) {
            const part_text = getContentAsString(part.content);
            if (part_text) {
                blocks.push(part_text);
            }
            // 工具调用：渲染时是折叠面板，复制时给出可读摘要
            if (part.tool_call_ends?.length) {
                const lines = part.tool_call_ends.map(c => {
                    const name = c.tool_display_name || c.tool_name;
                    return c.success ? `[工具] ${name} 成功` : `[工具] ${name} 失败`;
                });
                blocks.push(lines.join("\n"));
            }
        }
    }

    // text 兜底：没有 content_list 的消息（用户消息、普通回复）正文就在 text 里。
    // 若 content_list 已有内容，text 通常与之重复，不再追加。
    if (msg.text && !blocks.length) {
        blocks.push(msg.text);
    }

    // 多模态结果：气泡里渲染成图片/音频/向量，文本形态给个说明
    if (msg.images?.length) {
        blocks.push(`[生成图片 ${msg.images.length} 张]`);
    }
    if (msg.audio) {
        blocks.push("[音频]");
    }

    return blocks.join("\n\n");
}

