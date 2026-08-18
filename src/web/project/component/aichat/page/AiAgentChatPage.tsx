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
import {formatTokenCount} from "../../../../../common/token_counter";

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

/** @deprecated 已迁移到 token_counter.ts 的 formatTokenCount */

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
    // 当前“本地正在发送”的会话 id；null 表示本地没有在发送。
    // 用会话 id 而非布尔，是为了区分“本地发起”与“其它标签页/刷新后在跑”，
    // 避免切换会话时误以为当前会话在发送（导致发送按钮/生成动画错显示）。
    const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
    /** 当前活动会话是否正在执行中（其它页面/发起后切走）；用于展示“执行中”状态和接收实时广播 */
    const [activeSessionRunning, setActiveSessionRunning] = useState(false);
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

    /**
     * 切换“系统提示词”选择：更新本地状态，并把选择持久化到当前会话，
     * 这样下次加载该会话时会自动恢复该提示词。
     */
    const handleSystemPromptChange = (id: string) => {
        setSelectedSysPromptId(id);
        // 只有在已有活动会话时才需要持久化
        if (activeSessionId) {
            ai_agentHttp.post("session/sys_prompt", {
                session_id: activeSessionId,
                sys_prompt_id: id || undefined
            }).catch(console.error);
        }
    };

    // ===== 引用 =====
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const autoScrollRef = useRef(true);
    /** 当前活动会话在“接收其它页面广播”时的实时 assistant 气泡 id（用于追加文本） */
    const liveBubbleIdRef = useRef<number | null>(null);
    /** 上次刷新会话列表的时间（用于节流 running 旋转标记的刷新） */
    const lastRefreshRef = useRef(0);
    /** 当前已订阅(绑定 ws 与 session)的会话 id；用于切换/结束/卸载时退订 */
    const subscribedSessionRef = useRef<string | null>(null);
    // ===== 实时值 ref（供 useEffect([]) 的全局监听闭包读取最新 state） =====
    const activeSessionIdRef = useRef(activeSessionId);
    const sendingSessionIdRef = useRef<string | null>(sendingSessionId);
    useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
    useEffect(() => { sendingSessionIdRef.current = sendingSessionId; }, [sendingSessionId]);
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
        // setSending 语义改为：设置“本地正在发送的会话 id”（string|null）
        setSending: setSendingSessionId,
        getActiveSessionId: () => activeSessionIdRef.current,
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
        const session = result.data as ai_agent_chat_session_item & { running?: boolean; live_messages?: ai_agent_message_item[] };
        setActiveSessionId(session.id);
        // 该会话是否正在执行中（其它标签页 / 发起后切走）
        setActiveSessionRunning(!!session.running);
        // ===== 订阅绑定：把当前 ws 连接与该会话绑定（仅当该会话正在执行时） =====
        // 订阅后后端只向订阅此会话的连接推送实时输出；切换/结束时退订。
        if (subscribedSessionRef.current && subscribedSessionRef.current !== session.id) {
            ws.sendData(CmdType.ai_chat_subscribe, { session_id: subscribedSessionRef.current, subscribe: false });
        }
        subscribedSessionRef.current = session.running ? session.id : null;
        if (subscribedSessionRef.current) {
            ws.sendData(CmdType.ai_chat_subscribe, { session_id: subscribedSessionRef.current, subscribe: true });
        }
        // 若会话正在执行中，把后端返回的实时内容(未落盘 live_messages)与历史消息直接拼接渲染。
        // 本轮 user 消息已由 session/get 并入 session.messages，live_messages 只含未落盘的 assistant 输出，
        // 两者来源天然不重叠，直接拼接即可，无需额外去重。
        const baseMessages = toUiMessages(session.messages);
        if (session.running && session.live_messages?.length) {
            setMessages([...baseMessages, ...toUiMessages(session.live_messages)]);
        } else {
            setMessages(baseMessages);
        }
        // 恢复该会话保存的系统提示词选择（自动选中）
        setSelectedSysPromptId(session.sys_prompt_id ?? "");
        if (switch_menu) {
            set_ai_session_collapsed(false);
        }
        // 后台进程面板打开时，切换会话后刷新进程列表
        bgPanelRef.refresh?.();
        requestAnimationFrame(() => scrollToBottom(false));
    };

    const createSession = async (sysPromptId?: string) => {
        // 未显式传提示词时，沿用当前选中的（保证新会话继承当前提示词）
        const targetPromptId = sysPromptId !== undefined ? sysPromptId : selectedSysPromptId;
        const result = await ai_agentHttp.post("session", {
            title: "新会话",
            sys_prompt_id: targetPromptId || undefined
        });
        if (result.code !== RCode.Success) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages([]);
        setSelectedSysPromptId(session.sys_prompt_id ?? "");
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

    // 切换会话的命令检测开关（开启后该会话执行命令不再弹确认框）
    const toggleCmdAuto = async (sessionId: string, allow: boolean) => {
        await ai_agentHttp.post("session/cmd_auto_allow", { session_id: sessionId, allow });
        NotySuccess(allow ? t('命令检测已开启') : t('命令检测已关闭'));
        await loadSessions(activeSessionId);
    };

    // ===== 发送消息 =====
    const handleSend = async () => {
        const text = (chatInputRef.current?.getValue() ?? '').trim();
        if (!text && pendingAttachments.length === 0) return;

        // 当前活动会话本地正在执行中 → 加入排队（其它会话本地在跑不影响本会话发送）
        if (sendingSessionId === activeSessionId) {
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
                title: (text || pendingAttachments[0]?.name || "新会话").slice(0, 28),
                sys_prompt_id: selectedSysPromptId || undefined
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
            setSendingSessionId(sessionId);

            const handled = await handleNonCompletionsRequest(requestType, text, sessionId, async (resultText, extra) => {
                botMsg.text = resultText;
                botMsg.is_loading = false;
                if (extra?.images) botMsg.images = extra.images;
                if (extra?.audio) botMsg.audio = extra.audio;
                if (extra?.embeddings) botMsg.embeddings = extra.embeddings;
                setMessages([...newMessages]);
                setSendingSessionId(null);
                refreshSessions();
                scrollToBottom(true);
                chatStream.processPendingQueue();
            });

            if (!handled) {
                botMsg.text = `请求类型 "${requestType}" 的专用处理器尚未实现，请使用 completions 类型。`;
                botMsg.is_loading = false;
                setMessages([...newMessages]);
                setSendingSessionId(null);
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
            title: t('Token消耗统计'),
            context_div: <div className="usage-stats-loading">{t('加载中...')}</div>,
            cancel: () => set_prompt_card({ open: false }),
        });
        try {
            const result = await ai_agentHttp.post("session/usage_stats", { session_id: sessionId });
            if (result.code === RCode.Success && result.data) {
                const stats: ai_agent_usage_stats = result.data;
                set_prompt_card({
                    open: true,
                    title: t('Token消耗统计'),
                    context_div: (
                        <div className="usage-stats-panel">
                            {[
                                { l: t('对话轮次'), v: (stats.turns ?? 0).toString() },
                                { l: t('AI输入Token'), v: formatTokenCount(stats.input_tokens) },
                                { l: t('AI输出Token'), v: formatTokenCount(stats.output_tokens) },
                                { l: t('AI输入Token(最近一轮)'), v: formatTokenCount(stats.recent_input_tokens) },
                                { l: t('AI输出Token(最近一轮)'), v: formatTokenCount(stats.recent_output_tokens) },
                            ].map((row, i) => (
                                <div key={i} className="usage-stats-row">
                                    <span className="usage-stats-label">{row.l}</span>
                                    <span className="usage-stats-value">{row.v}</span>
                                </div>
                            ))}
                            <div className="usage-stats-row usage-stats-total">
                                <span className="usage-stats-label">{t('AI Token总计消耗')}</span>
                                <span className="usage-stats-value">
                                    {formatTokenCount((stats.input_tokens || 0) + (stats.output_tokens || 0))}
                                </span>
                            </div>
                        </div>
                    ),
                    cancel: () => set_prompt_card({ open: false }),
                });
            } else {
                set_prompt_card({
                    open: true, title: t('Token消耗统计'),
                    context_div: <div className="usage-stats-empty">{t('暂无统计数据')}</div>,
                    cancel: () => set_prompt_card({ open: false }),
                });
            }
        } catch {
            set_prompt_card({
                open: true, title: t('Token消耗统计'),
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

    // ===== 实时广播监听：接收“其它标签页 / 刷新后”正在进行的同一会话的输出 =====
    // 核心诉求：切换会话 / 刷新页面后，切回正在执行的会话，不仅能通过 session/get 的
    // live_messages 看到最新内容，还能继续实时收到该会话后续的输出。
    useEffect(() => {
        // 用 ref 读最新 state（useEffect 闭包捕获的是首渲染快照，必须用 ref 才能拿到实时值）
        const activeId = () => activeSessionIdRef.current;
        const sendingSessionIdNow = () => sendingSessionIdRef.current;

        // 追加/更新实时文本到当前查看的会话
        const appendLiveText = (sessionId: string, text: string, tool_call_ends?: any) => {
            if (!activeId() || activeId() !== sessionId) return;
            // 本地正在发送该会话时，由 useChatStream 负责渲染，这里跳过避免重复
            if (sendingSessionIdNow() === sessionId) return;

            setMessages(prev => {
                // 若末尾已是 bot（正被实时输出的气泡），直接追加；否则新建一个实时气泡。
                const last = prev[prev.length - 1];
                if (last && last.sender === 'bot') {
                    const next = [...prev];
                    const m = { ...last };
                    m.text += text;
                    if (tool_call_ends) {
                        m.content_list = [{ tool_call_ends, content: m.text, role: "assistant" }];
                    }
                    next[next.length - 1] = m;
                    liveBubbleIdRef.current = m.id;
                    if (autoScrollRef.current) requestAnimationFrame(() => scrollToBottom(false));
                    return next;
                }
                const liveMsg: Message = {
                    id: Date.now() + Math.random(),
                    sender: 'bot',
                    text,
                };
                if (tool_call_ends) {
                    liveMsg.content_list = [{ tool_call_ends, content: text, role: "assistant" }];
                }
                liveBubbleIdRef.current = liveMsg.id;
                if (autoScrollRef.current) requestAnimationFrame(() => scrollToBottom(false));
                return [...prev, liveMsg];
            });
        };

        // 结束：若当前查看的会话正是刚结束的会话：
        //  - 若带最终 once_messages_list，直接用其替换末尾的“实时预览气泡”，刷新列表即可（避免读文件竞态）；
        //  - 否则退化为重新 loadSession 拉取内容。
        const handleEnd = (sessionId: string, once_messages_list?: ai_agent_message_item[]) => {
            if (activeId() && activeId() === sessionId) {
                liveBubbleIdRef.current = null;
                setActiveSessionRunning(false);
                // 会话已结束，退订该会话（后端已不再有该会话的运行登记，退订避免残留）
                if (subscribedSessionRef.current === sessionId) {
                    ws.sendData(CmdType.ai_chat_subscribe, { session_id: sessionId, subscribe: false });
                    subscribedSessionRef.current = null;
                }
                // 该会话若是“本地发起”的，则由 useChatStream 负责收尾渲染；这里只处理非本地的情况
                if (sendingSessionIdNow() === sessionId) return;
                if (once_messages_list?.length) {
                    // 用最终助手内容替换“实时预览气泡”：仅当末尾确实是 bot(实时)气泡时才替换，否则直接追加，避免误删 user 消息
                    setMessages(prev => {
                        const finalMsgs = toUiMessages(once_messages_list);
                        const last = prev[prev.length - 1];
                        const replaceLast = last?.sender === 'bot';
                        if (replaceLast) {
                            return [...prev.slice(0, -1), ...finalMsgs];
                        }
                        return [...prev, ...finalMsgs];
                    });
                } else {
                    loadSession(sessionId).catch(() => {});
                }
                refreshSessions();
            }
        };

        const handleChatMsg = (data: any) => {
            const ctx = data?.context || {};
            if (!ctx.session_id) return; // 无会话 id（老版本）不处理
            appendLiveText(ctx.session_id, ctx.text || "", ctx.tool_call_ends);
            // 收到流式广播说明该会话确实在运行，更新会话列表的“执行中”旋转标记（节流避免频繁请求）
            const now = Date.now();
            if (now - lastRefreshRef.current > 1500) {
                lastRefreshRef.current = now;
                refreshSessions();
            }
        };
        const handleChatEnd = (data: any) => {
            const ctx = data?.context || {};
            if (ctx.session_id) handleEnd(ctx.session_id, ctx.once_messages_list);
        };
        const handleChatError = (data: any) => {
            const ctx = data?.context || {};
            if (ctx.session_id) handleEnd(ctx.session_id);
        };

        ws.addMsg(CmdType.ai_chat_msg, handleChatMsg);
        ws.addMsg(CmdType.ai_chat_end, handleChatEnd);
        ws.addMsg(CmdType.ai_chat_error, handleChatError);

        return () => {
            ws.off_message(`message_${CmdType.ai_chat_msg}`, handleChatMsg);
            ws.off_message(`message_${CmdType.ai_chat_end}`, handleChatEnd);
            ws.off_message(`message_${CmdType.ai_chat_error}`, handleChatError);
            // 组件卸载时退订正在绑定的会话
            if (subscribedSessionRef.current) {
                ws.sendData(CmdType.ai_chat_subscribe, { session_id: subscribedSessionRef.current, subscribe: false });
                subscribedSessionRef.current = null;
            }
        };
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
                setSelectedSysPromptId={handleSystemPromptChange}
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
                    onToggleCmdAuto={toggleCmdAuto}
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
                        // 本地该会话在发 或 该会话正被其它页面执行 → 都显示“执行中”生成动画
                        sending={sendingSessionId === activeSessionId || activeSessionRunning}
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
                        // 本地正在发当前会话，或当前会话本身正在执行中(running，比如刷新页面/其它页面在跑)
                        // 都显示“发送中/停止”按钮；直接取会话的 running 状态，刷新后也不丢失
                        sending={sendingSessionId === activeSessionId || activeSessionRunning}
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
