/**
 * useChatStream — WebSocket 流式聊天的核心 hook
 *
 * 负责：
 * 1. 发起一次 completions 类型的 WS 聊天请求
 * 2. 处理流式消息分块（ai_chat_msg），基于 chunk_index 维护多气泡
 * 3. 处理聊天结束 / 错误，自动清理 WS 监听
 * 4. 消息排队机制：sending 时用户发送的消息进入队列，当前轮结束后自动处理
 */
import React, {useRef, useState} from "react";
import {ws} from "../../../util/ws";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {
    ai_agent_message_attachment_item,
    ai_agent_message_item,
    ai_agent_content_part
} from "../../../../../common/req/filecat.ai.pojo";
import {Message} from "./chatTypes";
import {toUiMessages, next_placeholder_id} from "./messageUtils";
/** 排队消息的结构 */
interface QueuedMsg {
    text: string;
    attachments: ai_agent_message_attachment_item[];
}

/**
 * 判断一条消息是否值得保留：用户消息永远保留；
 * bot 消息必须有真实内容（正文 / 工具块 / 附件），否则只是个临时占位，应当丢弃。
 */
function has_real_content(m: Message) {
    if (m.sender !== 'bot') return true;
    return !!(m.text || m.content_list?.length || m.attachments?.length);
}


interface UseChatStreamOptions {
    /** 当前所有消息的引用（闭包内需要最新值） */
    getMessages: () => Message[];
    /** 设置消息 */
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    /** 防抖版设置消息 */
    setMessagesDebounced: (msgs: Message[]) => void;
    /** 设置“本地正在发送的会话 id”（string | null）。
        支持函数式更新：useChatStream 结束时可基于当前值判断后再清空，避免误清其它并行会话的标记 */
    setSending: (v: string | null | ((prev: string | null) => string | null)) => void;
    /** 当前活动会话 ID 的引用 */
    getActiveSessionId: () => string;
    /** 设置活动会话 ID */
    setActiveSessionId: (id: string) => void;
    /** 刷新会话列表 */
    refreshSessions: () => Promise<void>;
    /** 滚动到底部 */
    scrollToBottom: (smooth?: boolean) => void;
    /** 从用户消息构建 AI 请求体 */
    buildRequestMessages: (msg: Message) => ai_agent_message_item[];
    /** 获取当前选中的系统提示词 ID */
    getSelectedSysPromptId: () => string;
    /**
     * 标记本轮由本地发起（值为会话 id）。
     * 广播订阅层据此让路，避免两边同时收尾导致 id 重排、出现重复 key。
     */
    setLocalOwner: (sessionId: string | null) => void;
}

export function useChatStream(opts: UseChatStreamOptions) {
    const {
        getMessages,
        setMessages,
        setMessagesDebounced,
        setSending,
        getActiveSessionId,
        setActiveSessionId,
        refreshSessions,
        scrollToBottom,
        buildRequestMessages,
        getSelectedSysPromptId,
        setLocalOwner,
    } = opts;

    /** 排队消息队列 */
    const pendingQueueRef = useRef<QueuedMsg[]>([]);
    /** 当前请求的 AbortSignal 引用，用于暂停 */
    const abortRef = useRef<{ abort: () => void } | null>(null);

    /**
     * 核心：发起一次 completions 流式聊天
     * @param sessionId  会话 ID
     * @param userMsg    用户消息（UI 层）
     * @param onDone     本轮结束后的回调（用于处理排队等）
     */
    const startChatStream = (
        sessionId: string,
        userMsg: Message,
        onDone: () => void,
    ) => {
        const baseMessages = getMessages();
        // 记录本轮起点（user 消息的位置）：收尾时用它把本轮产生的气泡整段替换掉，
        // 不依赖“末尾是不是 bot”这类猜测，也不会误伤本轮之前的任何历史气泡
        const turnStartIndex = baseMessages.length;
        // 本轮气泡直接使用“最终位置 id”：user 恒为 turnStartIndex + 1，
        // bot 为 turnStartIndex + 2 起。收尾时 id 与之一致，气泡不会被重建。
        const userFinalId = turnStartIndex + 1;
        const userBubble: Message = { ...userMsg, id: userFinalId };
        const newMessages = [...baseMessages, userBubble];
        setMessages(newMessages);
        // 标记“本地正在发送的会话”
        setSending(sessionId);
        // 标记本轮由本地发起：广播订阅层据此让路，避免两边同时收尾导致 id 重排
        setLocalOwner(sessionId);

        // 创建 AbortSignal 控制句柄
        const abortHandle = { abort: () => {} };
        abortRef.current = abortHandle;


        const noticeMsg: Message = {
            // notice 是“本条 bot 气泡还没内容”的临时占位，用独立负号 id，
            // 与正文气泡 id 段完全隔离，避免和正文气泡撞 key。
            id: -1,
            sender: 'bot',
            text: "AI thinking ...",
            is_loading: true,
        };
        newMessages.push(noticeMsg);
        setMessages([...newMessages]);

        const chunkBubbleMap = new Map<number, Message>();

        const flush = () => {
            if (getActiveSessionId() === sessionId) setMessagesDebounced([...newMessages]);
        };

        const drop_notice = () => {
            const i = newMessages.indexOf(noticeMsg);
            if (i !== -1) newMessages.splice(i, 1);
        };

        const handleChatMsg = (data: WsData<any>) => {
            const ctx = data.context || {};
            if (ctx.session_id !== sessionId) return;
            const chunkText: string = ctx.text || '';
            const tool_call_ends = ctx.tool_call_ends;
            const chunkIndex: number = ctx.chunk_index ?? 0;

            if (ctx.notice) {
                // notice 用独立 id（负号段），与正文气泡的 id 段完全隔离：
                // 复用正文 id 会让 notice 与"已创建但尚无内容"的正空气泡撞 key，
                // React 报 duplicate key 并可能丢弃其中一个节点。
                noticeMsg.id = -1;
                noticeMsg.text = chunkText;
                noticeMsg.is_loading = true;
                if (!newMessages.includes(noticeMsg)) newMessages.push(noticeMsg);
                flush();
                return;
            }

            if (chunkText === '[DONE]') return;
            if (!chunkText && !tool_call_ends) return;

            drop_notice();

            let target = chunkBubbleMap.get(chunkIndex);
            if (!target) {
                // id 由「本轮起点 + chunkIndex」唯一确定，保证与 user 气泡、
                // notice 占位（负号段）都不冲突
                const id = userFinalId + 1 + chunkIndex;
                target = { id, sender: 'bot', text: '', is_loading: true };
                newMessages.push(target);
                chunkBubbleMap.set(chunkIndex, target);
            }

            if (chunkText) {
                target.text = target.text + chunkText;
                target.is_loading = false;
            }
            if (tool_call_ends) {
                target.content_list = [{ tool_call_ends, content: target.text, role: "assistant" }];
                target.is_loading = false;
            }
            flush();
        };

        // ===== ai_chat_end：清理并收尾 =====
        const handleChatEnd = (data: WsData<any>) => {
            const ctx = data.context || {};
            // 只处理自己发起的那个会话的结束事件（多会话并行时广播会串到所有监听器）
            if (ctx.session_id !== sessionId) return;
            cleanup();
            abortRef.current = null;
            // 本轮由本地收尾完成，释放标记；后续若再收到同会话的 end（不应发生）也不会重复处理
            setLocalOwner(null);
            // 只清理自己发起的会话标记（避免误清并行运行的其它会话）
            setSending(prev => prev === sessionId ? null : prev);
            // 收尾：本轮以 once_messages_list 为权威数据重建末尾气泡。
            // 该列表已包含本轮所有 assistant 片段（多轮工具调用各一条，且带完整 content_list），
            // 流式阶段的气泡可能只渲染了一部分（如工具块尚未推送），保留它会与权威数据重复。
            if (getActiveSessionId() === sessionId) {
                setMessages(prev => {
                    const cleaned = prev.filter(has_real_content);
                    let next = cleaned;
                    if (ctx.once_messages_list?.length) {
                        // 本轮 user 气泡 = 最后一个 user 气泡；它之后的都是本轮 bot 片段
                        let userIdx = -1;
                        for (let i = cleaned.length - 1; i >= 0; i--) {
                            if (cleaned[i].sender === 'user') { userIdx = i; break; }
                        }
                        const tailStart = userIdx >= 0 ? userIdx + 1 : cleaned.length;
                        const head = cleaned.slice(0, tailStart);
                        next = [...head, ...toUiMessages(ctx.once_messages_list)];
                    }
                    return next.map((m, i) => ({ ...m, id: i + 1 }));
                });
            }
            refreshSessions();
            scrollToBottom(true);
            onDone();
        };

        // ===== ai_chat_error：清理并显示错误 =====
        const handleChatError = (data: WsData<any>) => {
            const ctx = data.context || {};
            // 同上：只处理自己会话的错误，避免别的会话报错把本会话气泡改坏
            if (ctx.session_id !== sessionId) return;
            cleanup();
            abortRef.current = null;
            // 只清理自己发起的会话标记
            setSending(prev => prev === sessionId ? null : prev);
            const errText = "AI request error: " + (ctx.message || '未知错误');
            drop_notice();
            const last = [...newMessages].reverse().find(m => m.sender === 'bot');
            if (last) {
                last.text = last.text ? `${last.text}\n\n${errText}` : errText;
                last.is_loading = false;
            } else {
                newMessages.push({ id: userFinalId + 1, sender: 'bot', text: errText });
            }
            if (getActiveSessionId() === sessionId) {
                // 错误路径同样按最终位置重算 id，与正常收尾保持一致，避免气泡重挂
                setMessages([...newMessages].map((m, i) => ({ ...m, id: i + 1 })));
            }
            onDone();
        };

        // 清理 WS 监听
        const cleanup = () => {
            ws.off_message(`message_${CmdType.ai_chat_msg}`, handleChatMsg);
            ws.off_message(`message_${CmdType.ai_chat_end}`, handleChatEnd);
            ws.off_message(`message_${CmdType.ai_chat_error}`, handleChatError);
        };

        // 注册 WS 监听
        ws.addMsg(CmdType.ai_chat_msg, handleChatMsg);
        ws.addMsg(CmdType.ai_chat_end, handleChatEnd);
        ws.addMsg(CmdType.ai_chat_error, handleChatError);

        // 发起请求
        ws.sendData(CmdType.ai_chat_req, {
            messages: buildRequestMessages(userMsg),
            session_id: sessionId,
            sys_prompt_id: getSelectedSysPromptId(),
        });
    };

    /**
     * 处理排队消息：出队一条并递归调用
     */
    const processPendingQueue = () => {
        const queue = pendingQueueRef.current;
        if (queue.length === 0) return;

        const next = queue.shift();
        if (!next) return;

        // 清理之前排队消息的 "⏳" 标记
        setMessages(prev => prev.map(m => {
            if (m.sender === 'user' && m.text.includes('⏳(排队中...)')) {
                return {...m, text: m.text.replace(' ⏳(排队中...)', '')};
            }
            return m;
        }));

        const userMsg: Message = {
            id: next_placeholder_id(),
            sender: 'user',
            text: next.text,
            attachments: next.attachments,
        };

        startChatStream(getActiveSessionId(), userMsg, processPendingQueue);
    };

    /**
     * 将一条新消息加入排队队列
     */
    const enqueueMessage = (text: string, attachments: ai_agent_message_attachment_item[]) => {
        pendingQueueRef.current.push({text, attachments});
    };

    /** 获取当前队列长度 */
    const getQueueLength = () => pendingQueueRef.current.length;

    /** 暂停当前 AI 请求（本地发起或其它页面在跑的会话都支持停止） */
    const abort = () => {
        const sid = getActiveSessionId();
        if (!sid) return;
        // 发送取消指令给后端（无论是否本地发起；对非本地发起的会话也能停止）
        ws.sendData(CmdType.ai_chat_abort, { session_id: sid });
        if (abortRef.current) {
            abortRef.current = null;
            // 只清理自己发起的会话标记
            setSending(prev => prev === sid ? null : prev);
        }
        // 非本地发起的会话停止后，收尾由全局监听的 handleEnd(收到 ai_chat_end) 完成
    };

    return {
        startChatStream,
        processPendingQueue,
        enqueueMessage,
        getQueueLength,
        abort,
    };
}
