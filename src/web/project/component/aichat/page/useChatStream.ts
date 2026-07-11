/**
 * useChatStream — WebSocket 流式聊天的核心 hook
 *
 * 负责：
 * 1. 发起一次 completions 类型的 WS 聊天请求
 * 2. 处理流式消息分块（ai_chat_msg），基于 chunk_index 维护多气泡
 * 3. 处理聊天结束 / 错误，自动清理 WS 监听
 * 4. 消息排队机制：sending 时用户发送的消息进入队列，当前轮结束后自动处理
 */
import {useRef} from "react";
import {ws} from "../../../util/ws";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {
    ai_agent_message_attachment_item,
    ai_agent_message_item,
    ai_agent_content_part
} from "../../../../../common/req/filecat.ai.pojo";
import {Message} from "./chatTypes";
import React, {useState} from 'react';

/** 排队消息的结构 */
interface QueuedMsg {
    text: string;
    attachments: ai_agent_message_attachment_item[];
}

interface UseChatStreamOptions {
    /** 当前所有消息的引用（闭包内需要最新值） */
    getMessages: () => Message[];
    /** 设置消息 */
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    /** 防抖版设置消息 */
    setMessagesDebounced: (msgs: Message[]) => void;
    /** 设置发送状态 */
    setSending: (v: boolean) => void;
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
        const newMessages = [...getMessages(), userMsg];
        setMessages(newMessages);
        setSending(true);

        // 创建 AbortSignal 控制句柄
        const abortHandle = { abort: () => {} };
        abortRef.current = abortHandle;

        // 创建初始加载气泡
        const loadingMsg: Message = {
            id: userMsg.id + 1,
            sender: 'bot',
            text: "AI思考中...",
            is_loading: true,
        };
        newMessages.push(loadingMsg);

        // 同步更新到 state，供 UI 立即展示
        setMessages([...newMessages]);

        const chunkBubbleMap = new Map<number, Message>();
        let firstTextChunk = true;
        let currentLoading = loadingMsg;

        // ===== ai_chat_msg：处理流式文本 =====
        const handleChatMsg = (data: WsData<any>) => {
            const ctx = data.context || {};
            const chunkText: string = ctx.text || '';
            const tool_call_ends = ctx.tool_call_ends
            const chunkIndex: number = ctx.chunk_index ?? 0;
            if (chunkText === '[DONE]') return;

            // 普通文本
            if (firstTextChunk) {
                // 第一个文本块：替换加载气泡
                firstTextChunk = false;
                currentLoading.text = chunkText;
                if (tool_call_ends) {
                    currentLoading.content_list = [{
                        tool_call_ends,
                        content: currentLoading.text,
                        role: "assistant"
                    }]
                }
                currentLoading.is_loading = false;
                currentLoading.chunk_index = chunkIndex;
                chunkBubbleMap.set(chunkIndex, currentLoading);
                setMessagesDebounced([...newMessages]);
            } else {
                const existing = chunkBubbleMap.get(chunkIndex);
                if (existing) {
                    // 同一 chunk 追加文本
                    existing.text += chunkText;
                    if (tool_call_ends) {
                        existing.content_list = [{
                            tool_call_ends,
                            content: existing.text,
                            role: "assistant"
                        }]
                    }
                    setMessagesDebounced([...newMessages]);
                } else {
                    // 新的 chunk_index → 创建新气泡
                    const newBubble: Message = {
                        id: Date.now() + Math.random(),
                        sender: 'bot',
                        text: chunkText,
                        chunk_index: chunkIndex,
                    };
                    if (tool_call_ends) {
                        newBubble.content_list = [{
                            tool_call_ends,
                            content: newBubble.text,
                            role: "assistant"
                        }]
                    }
                    newMessages.push(newBubble);
                    chunkBubbleMap.set(chunkIndex, newBubble);
                    setMessagesDebounced([...newMessages]);
                }
            }
        };

        // ===== ai_chat_end：清理并收尾 =====
        const handleChatEnd = (data: WsData<any>) => {
            cleanup();
            abortRef.current = null;
            setSending(false);
            // 清理未完成的加载气泡
            currentLoading.is_loading = false;
            refreshSessions();
            scrollToBottom(true);
            onDone();
        };

        // ===== ai_chat_error：清理并显示错误 =====
        const handleChatError = (data: WsData<any>) => {
            cleanup();
            abortRef.current = null;
            setSending(false);
            const ctx = data.context || {};
            currentLoading.text = "AI请求出错: " + (ctx.message || '未知错误');
            currentLoading.is_loading = false;
            setMessages([...newMessages]);
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
            id: Date.now(),
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

    /** 暂停当前 AI 请求 */
    const abort = () => {
        if (abortRef.current) {
            // 发送取消指令给后端
            ws.sendData(CmdType.ai_chat_abort, { session_id: getActiveSessionId() });
            abortRef.current = null;
            setSending(false);
        }
    };

    return {
        startChatStream,
        processPendingQueue,
        enqueueMessage,
        getQueueLength,
        abort,
    };
}
