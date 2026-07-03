/**
 * 聊天相关类型定义
 * 从 AiAgentChatPage 中抽离，供各子组件/hook 共享
 */
import { ai_agent_message_attachment_item, ai_agent_message_item } from "../../../../../common/req/filecat.ai.pojo";

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
}
