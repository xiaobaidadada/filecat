/**
 * AiAgentChatPage — AI 聊天主页面
 *
 * 经过拆分后，主组件只负责：
 * 1. 状态管理与初始化
 * 2. 编排子组件和 hooks
 * 3. 少量粘合逻辑（如会话增删改、统计弹窗）
 */
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CmdType } from "../../../../../common/frame/WsData";

import { ai_agentHttp, settingHttp } from "../../../util/config";
import { debounce } from "../../../../../common/fun.util";
import { use_auth_check } from "../../../util/store.util";
import { copyToClipboard } from "../../../util/FunUtil";
import { NotySuccess } from "../../../util/noty";
import { using_confirm } from "../../prompts/prompt.util";
import { RCode } from "../../../../../common/Result.pojo";
import { useCmdConfirm } from "../useCmdConfirm";
import { $stroe } from "../../../util/store";
import { InputText } from "../../../../meta/component/Input";

import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta,
    ai_agent_item_dotenv,
    ai_agent_message_item,
    ai_agent_content_part,
    ai_agent_usage_stats,
    ai_system_prompt_item,
    ai_agent_Item,
} from "../../../../../common/req/filecat.ai.pojo";

// ===== 拆分的子模块 =====
import { Message } from "./chatTypes";
import { toUiMessages } from "./messageUtils";
import { buildAttachments } from "./attachmentUtils";
import { useChatStream } from "./useChatStream";
import { handleNonCompletionsRequest } from "./RequestTypeRenderers";
import ChatHeader from "./ChatHeader";
import SessionList from "./SessionList";
import ChatMessageList from "./ChatMessageList";
import ChatInput, { ChatInputHandle } from "./ChatInput";
import BackgroundProcessPanel, { bgPanelRef } from "./BackgroundProcessPanel";
import { ws } from "../../../util/ws";

/** 格式化数字（加千位分隔符） */
const formatChars = (chars: number | undefined): string => {
    if (chars === undefined || chars === null || chars < 0) return "0";
    return chars.toLocaleString();
};

export default function AiAgentChatPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const confirm_dell_all = using_confirm();
    const { check_user_auth } = use_auth_check();
    useCmdConfirm();

    // ===== 核心状态 =====
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessions, setSessions] = useState<ai_agent_chat_session_meta[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [sending, setSending] = useState(false);
    const chatInputRef = useRef<ChatInputHandle>(null);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

    // ===== 全局/持久化状态 =====
    const [ai_session_collapsed, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);
    const [ai_bg_expanded, set_ai_bg_expanded] = useAtom($stroe.ai_bg_expanded);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const [batchMode, setBatchMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
    const [selectedSysPromptId, setSelectedSysPromptId] = useState<string>("");

    // ===== 引用 =====
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const autoScrollRef = useRef(true);
    const env_config = useRef(new ai_agent_item_dotenv());
    const [sysPromptList, setSysPromptList] = useState<ai_system_prompt_item[]>([]);
    const [currentModelName, setCurrentModelName] = useState('');
    const [bgProcessCount, setBgProcessCount] = useState(0); // 所有会话的后台进程总数

    /** 从 env_config 中读取当前模型的 request_type */
    const getRequestType = () => env_config?.current?.ai_config?.request_type || 'completions';

    // ===== 防抖版 setMessages（自动滚动） =====
    const setMessagesDebounced = useRef(
        debounce((msgs: Message[]) => {
            setMessages(msgs);
            if (autoScrollRef.current) {
                scrollToBottom(false);
            }
        }, 50)
    ).current;

    // ===== 滚动相关 =====
    const isNearBottom = (el: HTMLElement, threshold = 120) => {
        const { scrollTop, scrollHeight, clientHeight } = el;
        return scrollHeight - (scrollTop + clientHeight) < threshold;
    };

    const scrollToBottom = (smooth = false) => {
        const el = chatContainerRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    };

    // ===== 会话操作函数（refreshSessions 需要提前声明，供 useChatStream 使用） =====
    const refreshSessions = async () => {
        const result = await ai_agentHttp.get("sessions");
        if (result.code === RCode.Success) {
            setSessions(result.data ?? []);
        }
    };

    // ===== 从用户消息构建请求体 =====
    const buildRequestMessages = (msg: Message): ai_agent_message_item[] => {
        const imageAttachments = (msg.attachments ?? []).filter(a => a.kind === "image");
        if (imageAttachments.length > 0) {
            const content: ai_agent_content_part[] = [];
            if (msg.text) content.push({ type: "text", text: msg.text });
            for (const img of imageAttachments) {
                content.push({ type: "image_url", image_url: { url: img.content } });
            }
            return [{ content, role: 'user', attachments: msg.attachments ?? [] }];
        }
        return [{
            content: msg.text,
            role: msg.sender === 'bot' ? 'assistant' : 'user',
            attachments: msg.attachments ?? []
        }];
    };

    // ===== 聊天流 hook =====
    const chatStream = useChatStream({
        getMessages: () => messages,
        setMessages,
        setMessagesDebounced,
        setSending,
        getActiveSessionId: () => activeSessionId,
        setActiveSessionId,
        refreshSessions,
        scrollToBottom,
        buildRequestMessages,
        getSelectedSysPromptId: () => selectedSysPromptId,
    });

    // ===== 会话操作 =====
    const loadSessions = async (selectId?: string | null) => {
        const result = await ai_agentHttp.get("sessions");
        if (result.code !== RCode.Success) return;
        const list = result.data ?? [];
        setSessions(list);
        const nextId = selectId === null
            ? (list[0]?.id ?? "")
            : (selectId || activeSessionId || list[0]?.id || "");
        if (nextId) {
            await loadSession(nextId);
        } else {
            setMessages([]);
            setActiveSessionId("");
        }
    };

    const loadSession = async (sessionId: string, switch_menu = false) => {
        const result = await ai_agentHttp.post("session/get", { session_id: sessionId });
        if (result.code !== RCode.Success || !result.data) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages(toUiMessages(session.messages));
        if (switch_menu) {
            set_ai_session_collapsed(false);
        }
        // 后台进程面板打开时，切换会话后刷新进程列表
        bgPanelRef.refresh?.();
        requestAnimationFrame(() => scrollToBottom(false));
    };

    const createSession = async (sysPromptId?: string) => {
        const result = await ai_agentHttp.post("session", { title: "新会话" });
        if (result.code !== RCode.Success) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages([]);
        set_ai_session_collapsed(false);
        await loadSessions(session.id);
        requestAnimationFrame(() => {
            const el = document.querySelector('.chat-input') as HTMLTextAreaElement;
            if (el) {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }
        });
    };

    const deleteSession = (sessionId: string) => {
        confirm_dell_all({
            sub_title: "确认删除这个会话吗?",
            confirm_fun: async () => {
                await ai_agentHttp.post("session/delete", { session_id: sessionId });
                if (activeSessionId === sessionId) {
                    setActiveSessionId("");
                    await loadSessions(null);
                } else {
                    await loadSessions(activeSessionId);
                }
            }
        });
    };

    const renameSession = (sessionId: string, title: string) => {
        let new_name = title;
        confirm_dell_all({
            confirm_fun: async () => {
                await ai_agentHttp.post("sessions/update/meta", { id: sessionId, title: new_name });
                await loadSessions(activeSessionId);
            },
            context_div: (
                <div className="card-content">
                    <InputText value={new_name} handleInputChange={(value) => { new_name = value; }} />
                </div>
            )
        });
    };

    // ===== 发送消息 =====
    const handleSend = async () => {
        const text = (chatInputRef.current?.getValue() ?? '').trim();
        if (!text && pendingAttachments.length === 0) return;

        // AI 正在执行中 → 加入排队
        if (sending) {
            const attachments = await buildAttachments(pendingAttachments);
            chatStream.enqueueMessage(text, attachments);
            chatInputRef.current?.clear();
            setPendingAttachments([]);
            const queuedMsg: Message = {
                id: Date.now(),
                sender: 'user',
                text: text + (chatStream.getQueueLength() > 1 ? ` ⏳(排队中...)` : ''),
                attachments,
            };
            setMessages(prev => [...prev, queuedMsg]);
            return;
        }

        // 确保有会话
        let sessionId = activeSessionId;
        if (!sessionId) {
            const result = await ai_agentHttp.post("session", {
                title: (text || pendingAttachments[0]?.name || "新会话").slice(0, 28)
            });
            if (result.code !== RCode.Success) return;
            const session = result.data as ai_agent_chat_session_item;
            sessionId = session.id;
            setActiveSessionId(sessionId);
            await loadSessions(sessionId);
        }

        const attachments = await buildAttachments(pendingAttachments);
        const userMsg: Message = { id: Date.now(), sender: 'user', text, attachments };
        chatInputRef.current?.clear();
        setPendingAttachments([]);


        const requestType = getRequestType();

        // 非 completions → 走专用处理器
        if (requestType !== 'completions') {
            const botMsg: Message = { id: userMsg.id + 1, sender: 'bot', text: "处理中...", is_loading: true };
            const newMessages = [...messages, userMsg, botMsg];
            setMessages(newMessages);
            setSending(true);

            const handled = await handleNonCompletionsRequest(requestType, text, sessionId, async (resultText, extra) => {
                botMsg.text = resultText;
                botMsg.is_loading = false;
                if (extra?.images) botMsg.images = extra.images;
                if (extra?.audio) botMsg.audio = extra.audio;
                if (extra?.embeddings) botMsg.embeddings = extra.embeddings;
                setMessages([...newMessages]);
                setSending(false);
                refreshSessions();
                scrollToBottom(true);
                chatStream.processPendingQueue();
            });

            if (!handled) {
                botMsg.text = `请求类型 "${requestType}" 的专用处理器尚未实现，请使用 completions 类型。`;
                botMsg.is_loading = false;
                setMessages([...newMessages]);
                setSending(false);
                chatStream.processPendingQueue();
            }
            return;
        }

        // completions → 走 WebSocket 流式
        chatStream.startChatStream(sessionId, userMsg, () => chatStream.processPendingQueue());
    };

    // ===== 附件操作 =====
    const addAttachments = (files: FileList | File[]) => {
        const list = Array.from(files ?? []).filter(Boolean);
        if (!list.length) return;
        setPendingAttachments(prev => [...prev, ...list]);
    };

    const removePendingAttachment = (index: number) => {
        setPendingAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const openFilePicker = () => { fileInputRef.current?.click(); };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            e.preventDefault();
            addAttachments(files);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };

    // ===== 消息操作 =====
    const handleDelete = (id: number) => {
        confirm_dell_all({
            sub_title: t("确认删除这条消息吗?"),
            confirm_fun: async () => {
                const targetIndex = messages.findIndex(m => m.id === id);
                if (targetIndex < 0) return;
                const newMessages = messages.filter(m => m.id !== id);
                setMessages(newMessages);
                if (activeSessionId) {
                    ai_agentHttp.post("session/message/delete", {
                        session_id: activeSessionId,
                        indices: [targetIndex]
                    }).catch(console.error);
                }
            }
        });
    };

    const handleCopy = async (text: string) => {
        copyToClipboard(text);
        NotySuccess('复制成功');
    };

    // ===== 批量操作 =====
    const toggleBatchMode = () => {
        if (batchMode) { setSelectedMsgIds(new Set()); setSelectedSessionIds(new Set()); }
        setBatchMode(prev => !prev);
    };

    const toggleMsgSelect = (id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSessionSelect = (id: string) => {
        setSelectedSessionIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const batchDeleteMessages = () => {
        if (selectedMsgIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("确认删除选中的聊天消息吗?"),
            confirm_fun: async () => {
                const indicesToDelete: number[] = [];
                messages.forEach((m, idx) => { if (selectedMsgIds.has(m.id)) indicesToDelete.push(idx); });
                setMessages(messages.filter(m => !selectedMsgIds.has(m.id)));
                setSelectedMsgIds(new Set());
                setBatchMode(false);
                if (activeSessionId && indicesToDelete.length > 0) {
                    ai_agentHttp.post("session/message/delete", {
                        session_id: activeSessionId,
                        indices: indicesToDelete
                    }).catch(console.error);
                }
            }
        });
    };

    const batchDeleteSessions = () => {
        if (selectedSessionIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("确认删除选中的会话吗?"),
            confirm_fun: async () => {
                for (const sid of selectedSessionIds) {
                    await ai_agentHttp.post("session/delete", { session_id: sid });
                }
                setSelectedSessionIds(new Set());
                setBatchMode(false);
                if (selectedSessionIds.has(activeSessionId)) {
                    setActiveSessionId("");
                    await loadSessions(null);
                } else {
                    await loadSessions(activeSessionId);
                }
            }
        });
    };

    const clearAllSessions = () => {
        confirm_dell_all({
            sub_title: t("确认删除全部聊天会话吗?"),
            confirm_fun: async () => {
                await ai_agentHttp.post("sessions/clear", {});
                setActiveSessionId("");
                setMessages([]);
                await loadSessions(null);
            }
        });
    };

    // ===== 用量统计弹窗 =====
    const showUsageStatsPopup = async (sessionId: string) => {
        set_prompt_card({
            open: true,
            title: t('字符消耗统计'),
            context_div: <div className="usage-stats-loading">{t('加载中...')}</div>,
            cancel: () => set_prompt_card({ open: false }),
        });
        try {
            const result = await ai_agentHttp.post("session/usage_stats", { session_id: sessionId });
            if (result.code === RCode.Success && result.data) {
                const stats: ai_agent_usage_stats = result.data;
                set_prompt_card({
                    open: true,
                    title: t('字符消耗统计'),
                    context_div: (
                        <div className="usage-stats-panel">
                            {[
                                { l: t('对话轮次'), v: (stats.turns ?? 0).toString() },
                                { l: t('AI输入字符'), v: formatChars(stats.input_chars) },
                                { l: t('AI输出字符'), v: formatChars(stats.output_chars) },
                                { l: t('AI输入字符(最近一轮)'), v: formatChars(stats.recent_input_chars) },
                                { l: t('AI输出字符(最近一轮)'), v: formatChars(stats.recent_output_chars) },
                            ].map((row, i) => (
                                <div key={i} className="usage-stats-row">
                                    <span className="usage-stats-label">{row.l}</span>
                                    <span className="usage-stats-value">{row.v}</span>
                                </div>
                            ))}
                            <div className="usage-stats-row usage-stats-total">
                                <span className="usage-stats-label">{t('AI字符总计消耗')}</span>
                                <span className="usage-stats-value">
                                    {formatChars((stats.input_chars || 0) + (stats.output_chars || 0))}
                                </span>
                            </div>
                        </div>
                    ),
                    cancel: () => set_prompt_card({ open: false }),
                });
            } else {
                set_prompt_card({
                    open: true, title: t('字符消耗统计'),
                    context_div: <div className="usage-stats-empty">{t('暂无统计数据')}</div>,
                    cancel: () => set_prompt_card({ open: false }),
                });
            }
        } catch {
            set_prompt_card({
                open: true, title: t('字符消耗统计'),
                context_div: <div className="usage-stats-empty">{t('暂无统计数据')}</div>,
                cancel: () => set_prompt_card({ open: false }),
            });
        }
    };

    // ===== 生命周期 =====
    const init = async () => {
        // 拉取 env 配置
        const envResult = await settingHttp.get("ai_agent_setting/env");
        if (envResult.code === RCode.Success) {
            env_config.current = envResult.data;
            const note = envResult.data.ai_config?.model || '';
            const found = (envResult.data.ai_config_env?.options_agent_model_list ?? []).find((m: any) => m.label === note);
            setCurrentModelName(found ? found.value : note);
        }
        await loadSessions();
        const sysPromptResult = await ai_agentHttp.get("system_prompts");
        if (sysPromptResult.code === RCode.Success) {
            setSysPromptList(sysPromptResult.data ?? []);
        }
    };

    useEffect(() => {
        init();
        requestAnimationFrame(() => scrollToBottom(false));

        // 复用 BackgroundProcessPanel 的请求结果获取全局进程总数
        bgPanelRef.onCountChange = setBgProcessCount;
        bgPanelRef.refresh?.();

        // 订阅后台进程数变化通知
        ws.addMsg(CmdType.ai_bg_process_count_notify, (data: any) => {
            const count = data?.context?.count;
            if (typeof count === 'number') {
                setBgProcessCount(count);
            }
        });

        return () => {
            ws.removeMsg(CmdType.ai_bg_process_count_notify);
        };
    }, []);

    useEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const onScroll = () => { autoScrollRef.current = isNearBottom(el); };
        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    useLayoutEffect(() => {
        if (autoScrollRef.current) scrollToBottom(false);
    }, [messages]);

    const toggleSessionPanel = () => {
        set_ai_session_collapsed(prev => !prev);
    };

    // ===== 渲染 =====
    return (
        <React.Fragment>
            <ChatHeader
                currentModelName={currentModelName}
                setCurrentModelName={setCurrentModelName}
                envConfigRef={env_config}
                sysPromptList={sysPromptList}
                batchMode={batchMode}
                selectedMsgCount={selectedMsgIds.size}
                onToggleSessionPanel={toggleSessionPanel}
                onCreateSession={createSession}
                onBatchDeleteMessages={batchDeleteMessages}
                bgProcessVisible={ai_bg_expanded}
                bgProcessCount={bgProcessCount}
                onToggleBgProcess={() => set_ai_bg_expanded((v: boolean) => !v)}
                selectedSysPromptId={selectedSysPromptId}
                setSelectedSysPromptId={setSelectedSysPromptId}
            />

            <div className="chat-page chat-page-with-sessions">
                {ai_session_collapsed && (
                    <div className="chat-session-overlay" onClick={() => set_ai_session_collapsed(false)} />
                )}
                <SessionList
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelectSession={(id) => loadSession(id, false)}
                    onRenameSession={renameSession}
                    onDeleteSession={deleteSession}
                    onShowUsageStats={showUsageStatsPopup}
                    batchMode={batchMode}
                    selectedSessionIds={selectedSessionIds}
                    onToggleSessionSelect={toggleSessionSelect}
                    onToggleBatchMode={toggleBatchMode}
                    onBatchDeleteSessions={batchDeleteSessions}
                    onClearAllSessions={clearAllSessions}
                />

                {/* 后台进程面板 — 与会话列表一样始终存在，折叠通过 atom 控制 */}
                <BackgroundProcessPanel />

                <section className="chat-main">
                    {messages?.length === 0 && (
                        <div className="chat-header">
                            <div>{t('询问服务器的一切')}</div>
                        </div>
                    )}

                    <ChatMessageList
                        messages={messages}
                        batchMode={batchMode}
                        selectedMsgIds={selectedMsgIds}
                        sending={sending}
                        chatContainerRef={chatContainerRef}
                        messagesEndRef={messagesEndRef}
                        onToggleMsgSelect={toggleMsgSelect}
                        onDelete={handleDelete}
                        onCopy={handleCopy}
                        onToggleBatchMode={toggleBatchMode}
                        t={t}
                    />

                    <ChatInput
                        ref={chatInputRef}
                        onSend={handleSend}
                        sending={sending}
                        onAbort={chatStream.abort}
                        pendingAttachments={pendingAttachments}
                        onRemoveAttachment={removePendingAttachment}
                        onOpenFilePicker={openFilePicker}
                        onAddFiles={addAttachments}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        fileInputRef={fileInputRef}
                        requestType={getRequestType()}
                    />
                </section>
            </div>
        </React.Fragment>
    );
}
