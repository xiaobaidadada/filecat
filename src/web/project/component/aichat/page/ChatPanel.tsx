/**
 * ChatPanel — AI 聊天界面容器（会话列表 + 聊天主体）。
 *
 * 不传 props 时行为与原整页聊天完全一致；传 inline_header 时把 Header 就地渲染，
 * 用于把聊天嵌进宿主页面右侧（Studio）。
 *
 * 职责拆分：
 *   - useSessionManager   会话列表/切换/增删改/超管模式
 *   - useMessageList      气泡状态/滚动/批量选择/消息级操作
 *   - useChatSubscription 实时广播订阅（其它标签页/刷新后的流式输出）
 *   - useChatStream       本地发起对话的流式收发
 * 本文件只做编排与渲染。
 */
import React, { useState, useRef, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { ai_agentHttp, settingHttp } from "../../../util/config";
import { throttle } from "../../../../../common/fun.util";
import { use_auth_check } from "../../../util/store.util";
import { RCode } from "../../../../../common/Result.pojo";
import { useCmdConfirm } from "../useCmdConfirm";
import { $stroe } from "../../../util/store";
import { InputText } from "../../../../meta/component/Input";
import {
    ai_agent_Item, ai_agent_item_dotenv, ai_agent_message_item,
    ai_system_prompt_item, ai_agent_usage_stats, ai_agent_chat_session_item,
} from "../../../../../common/req/filecat.ai.pojo";
import { formatTokenCount } from "../../../../../common/token_counter";
import { ws } from "../../../util/ws";
import { CmdType } from "../../../../../common/frame/WsData";
import { NotySuccess } from "../../../util/noty";

import { Message } from "./chatTypes";
import { next_placeholder_id, toUiMessages } from "./messageUtils";
import { buildAttachments } from "./attachmentUtils";
import { useChatStream } from "./useChatStream";
import { useSessionManager } from "./useSessionManager";
import { useMessageList } from "./useMessageList";
import { useChatSubscription } from "./useChatSubscription";
import { handleNonCompletionsRequest } from "./RequestTypeRenderers";
import ChatHeader, { ModelGroup } from "./ChatHeader";
import SessionList from "./SessionList";
import ChatMessageList from "./ChatMessageList";
import ChatInput, { ChatInputHandle } from "./ChatInput";
import BackgroundProcessPanel from "./BackgroundProcessPanel";

/** ChatPanel 对外参数 */
export interface ChatPanelProps {
    /** 内嵌模式：Header 就地渲染，不注入全站顶部 Header */
    inline_header?: boolean;
    /** 初始定位的会话 id */
    session_id?: string;
    /** 初始工作目录：按它找会话，找不到就新建 */
    file_cwd_path?: string;
    /** 当前会话是否同步到 URL 的 ?session=（嵌入场景传 false） */
    sync_url?: boolean;
    /** 会话定位完成后回调 */
    on_session_change?: (sessionId: string) => void;
}

export default function ChatPanel(props: ChatPanelProps = {}) {
    const {
        inline_header = false,
        session_id: init_session_id,
        file_cwd_path: init_cwd,
        sync_url = true,
        on_session_change,
    } = props;

    const { t } = useTranslation();
    // 整页模式把当前会话写进 URL；嵌入模式不读不写，避免污染宿主 query
    const [search_params, set_search_params] = useSearchParams();
    const url_session_id = sync_url ? (search_params.get("session") || "") : "";
    const write_url_session = (sessionId: string | null) => {
        if (!sync_url) return;
        set_search_params(prev => {
            const next = new URLSearchParams(prev);
            if (sessionId) next.set("session", sessionId);
            else next.delete("session");
            return next;
        }, { replace: true });
    };

    const { check_user_auth } = use_auth_check();
    useCmdConfirm();

    // ===== 全局/持久化状态 =====
    const [user_base_info] = useAtom($stroe.user_base_info);
    const is_root = !!user_base_info?.user_data?.is_root;
    const [ai_session_collapsed, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);
    const [ai_bg_expanded, set_ai_bg_expanded] = useAtom($stroe.ai_bg_expanded);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const [ai_chat_zoom] = useAtom($stroe.ai_chat_zoom);

    const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
    const [sysPromptList, setSysPromptList] = useState<ai_system_prompt_item[]>([]);
    const [currentModelName, setCurrentModelName] = useState('');
    const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
    const [bgProcessCount, setBgProcessCount] = useState(0);

    const chatInputRef = useRef<ChatInputHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const bgPanelRef = useRef<{ refresh?: () => void; onCountChange?: (count: number) => void }>({});
    const env_config = useRef<{ ai_config?: ai_agent_Item; ai_config_env?: ai_agent_item_dotenv }>({});

    // 会话列表展开/收起（沿用原 atom 语义：true 为收起）
    const set_session_panel_open = (open: boolean) => set_ai_session_collapsed(!open);

    // sendingSessionId 的实时 ref，供订阅层闭包读取
    const sendingSessionIdRef = useRef<string | null>(null);
    useEffect(() => { sendingSessionIdRef.current = sendingSessionId; }, [sendingSessionId]);
    /**
     * 本轮由本地发起的会话 id。
     * 与 sendingSessionIdRef 分开：后者在收到 end 时立刻清空，
     * 广播订阅层若依赖它判断「该谁收尾」会失效，导致两边同时收尾。
     */
    const localOwnerRef = useRef<string | null>(null);

    // ===== 跨 Hook 共享的 ref =====
    // 这些值由会话层维护，但消息层/订阅层的闭包也要读，用 ref 打通，避免 Hook 相互依赖。
    const sessions_ref_shared = useRef<{ id: string; user_id?: string }[]>([]);
    const active_session_id_shared = useRef<string>("");
    const session_admin_mode_ref = useRef<boolean>(false);
    /** 当前已订阅的会话 id（切换/结束/卸载时退订） */
    const subscribed_session_ref = useRef<string | null>(null);

    // ===== 消息层（先建，会话层加载完成后通过回调把消息铺进来） =====
    // 会话层需要消息层的 apply_session，用 ref 转发避免 Hook 构造顺序耦合
    const apply_session_ref = useRef<(s: any) => void>(() => { });
    // 订阅层在会话层之后创建，这里用 ref 转发其绑定能力，供会话加载回调使用
    const sub_ref = useRef<{ bind_live_bubbles: (m: Message[], n: number) => void } | null>(null);

    const msg = useMessageList({
        admin_call: (action, payload) => ai_agentHttp.post("admin/session", { action, ...(payload || {}) }),
        owner_of_session: (id) => session_admin_mode_ref.current
            ? sessions_ref_shared.current.find(s => s.id === id)?.user_id
            : undefined,
        get_sessions: () => sessions_ref_shared.current,
        activeSessionId: active_session_id_shared.current,
        admin_mode_ref: session_admin_mode_ref,
    });

    apply_session_ref.current = msg.apply_session;

    // ===== 会话层 =====
    const session_api = useSessionManager({
        on_session_loaded: (session) => {
            // 会话切换/清空时可能没有会话（如新建会话前先清空旧状态）
            if (!session) return;
            // 该会话正在执行时把当前连接登记为订阅者。
            // 刷新页面后 ws 是全新连接，旧的订阅关系已随旧连接销毁，
            // 不重新订阅就再也收不到后续流式内容（页面卡在当前内容不再更新）。
            if (session.running) {
                ws.sendData(CmdType.ai_chat_subscribe, { session_id: session.id, subscribe: true });
                subscribed_session_ref.current = session.id;
            }
            apply_session_ref.current(session);
            // 把已渲染的 live_messages 末尾气泡登记到 chunk_index 映射上，
            // 否则刷新后收到的第一个 chunk 找不到对应气泡，会新建一个（内容重复）。
            if (session.live_messages?.length) {
                const ui = toUiMessages([...(session.messages ?? []), ...session.live_messages]);
                sub_ref.current?.bind_live_bubbles(ui, session.live_messages.length);
            }
        },
        set_session_panel_open,
        on_session_change,
        init_cwd,
        write_url_session,
        url_session_id,
        init_session_id,
    });

    // 共享 ref 与会话层状态保持同步（供消息层/订阅层的闭包读取最新值）
    useEffect(() => {
        active_session_id_shared.current = session_api.activeSessionId;
        session_admin_mode_ref.current = session_api.admin_all_mode;
        sessions_ref_shared.current = session_api.sessions;
    }, [session_api.activeSessionId, session_api.admin_all_mode, session_api.sessions]);

    // ===== 订阅层 =====
    const sub = useChatSubscription({
        active_session_id_ref: active_session_id_shared,
        local_owner_ref: localOwnerRef,
        subscribed_ref: subscribed_session_ref,
        set_messages: msg.setMessages,
        scroll_to_bottom: () => msg.scrollToBottom(false),
        auto_scroll_ref: msg.autoScrollRef,
        mark_session_running: session_api.markSessionRunning,
        refresh_sessions: session_api.refreshSessions,
        reload_session: (id) => session_api.loadSession(id),
        set_active_session_running: session_api.setActiveSessionRunning,
    });
    sub_ref.current = sub;

    // ===== 本地流式 hook =====
    const setMessagesDebounced = useRef(

        throttle((msgs: Message[]) => {
            msg.setMessages(msgs);
            if (msg.autoScrollRef.current) msg.scrollToBottom(false);
        }, 16)
    ).current;



    /** 从用户消息构建 AI 请求体 */
    const buildRequestMessages = (um: Message): ai_agent_message_item[] => {
        const imageAttachments = (um.attachments ?? []).filter(a => a.kind === "image");
        if (imageAttachments.length > 0) {
            const content: any[] = [];
            if (um.text) content.push({ type: "text", text: um.text });
            for (const img of imageAttachments) {
                content.push({ type: "image_url", image_url: { url: img.content } });
            }
            return [{ content, role: 'user', attachments: um.attachments ?? [] }];
        }
        return [{
            content: um.text,
            role: um.sender === 'bot' ? 'assistant' : 'user',
            attachments: um.attachments ?? [],
        }];
    };

    const chatStream = useChatStream({
        getMessages: () => msg.messages,
        setMessages: msg.setMessages,
        setMessagesDebounced,
        setSending: setSendingSessionId,
        getActiveSessionId: () => active_session_id_shared.current,
        setActiveSessionId: session_api.setActiveSessionId,
        refreshSessions: session_api.refreshSessions,
        scrollToBottom: msg.scrollToBottom,
        buildRequestMessages,
        getSelectedSysPromptId: () => session_api.selectedSysPromptId,
        setLocalOwner: (id) => { localOwnerRef.current = id; },
    });

    /** 从 env 配置同步当前模型展示值 */
    const syncCurrentModelFromEnv = (envData: { ai_config?: ai_agent_Item }) => {
        setCurrentModelName(envData?.ai_config?.model ?? '');
    };

    /** 拉取所有供应商聚合的模型分组（无权限时静默） */
    const loadPublicModels = async () => {
        try {
            const result = await ai_agentHttp.get("public_models");
            if (result.code === RCode.Success) setModelGroups(result.data?.groups ?? []);
        } catch {
            setModelGroups([]);
        }
    };

    /** 当前模型的请求类型 */
    const getRequestType = () => env_config.current?.ai_config?.request_type || 'completions';

    // ===== 发送 =====
    const handleSend = async () => {
        // 超管「所有用户会话」模式禁止发送：请求会以当前登录用户落库，跨用户会写错数据
        if (session_api.admin_all_mode) return;
        const text = (chatInputRef.current?.getValue() ?? '').trim();
        if (!text && pendingAttachments.length === 0) return;

        // 当前会话本地正在执行 → 排队（其它会话在跑不影响本会话发送）
        if (sendingSessionId === session_api.activeSessionId) {
            const attachments = await buildAttachments(pendingAttachments);
            chatStream.enqueueMessage(text, attachments);
            chatInputRef.current?.clear();
            setPendingAttachments([]);
            const queuedMsg: Message = {
                id: next_placeholder_id(),
                sender: 'user',
                text: text + (chatStream.getQueueLength() > 1 ? ` ⏳(排队中...)` : ''),
                attachments,
            };
            msg.setMessages(prev => [...prev, queuedMsg]);
            return;
        }

        // 无会话时先建一个
        let sessionId = session_api.activeSessionId;
        if (!sessionId) {
            const result = await ai_agentHttp.post("session", {
                title: (text || pendingAttachments[0]?.name).slice(0, 28),
                sys_prompt_id: undefined,
                file_cwd_path: init_cwd || undefined,
            });
            if (result.code !== RCode.Success) return;
            const session = result.data as ai_agent_chat_session_item;
            sessionId = session.id;
            session_api.setActiveSessionId(sessionId);
            on_session_change?.(sessionId);
            await session_api.loadSessions(sessionId);
        }

        const attachments = await buildAttachments(pendingAttachments);
        const userMsg: Message = { id: next_placeholder_id(), sender: 'user', text, attachments };
        chatInputRef.current?.clear();
        setPendingAttachments([]);

        const requestType = getRequestType();

        // 非 completions → 专用处理器（该路径自己渲染气泡）
        if (requestType !== 'completions') {
            const botMsg: Message = { id: msg.messages.length + 2, sender: 'bot', text: "处理中...", is_loading: true };
            const userMsgWithId: Message = { ...userMsg, id: msg.messages.length + 1 };
            const newMessages = [...msg.messages, userMsgWithId, botMsg];
            msg.setMessages(newMessages);
            setSendingSessionId(sessionId);

            const handled = await handleNonCompletionsRequest(
                requestType, text, sessionId,
                async (resultText, extra) => {
                    botMsg.text = resultText;
                    botMsg.is_loading = false;
                    if (extra?.images) botMsg.images = extra.images;
                    if (extra?.audio) botMsg.audio = extra.audio;
                    if (extra?.embeddings) botMsg.embeddings = extra.embeddings;
                    msg.setMessages([...newMessages]);
                    setSendingSessionId(null);
                    session_api.refreshSessions();
                    msg.scrollToBottom(true);
                    chatStream.processPendingQueue();
                }
            );

            if (!handled) {
                botMsg.text = `请求类型 "${requestType}" 的专用处理器尚未实现，请使用 completions 类型。`;
                botMsg.is_loading = false;
                msg.setMessages([...newMessages]);
                setSendingSessionId(null);
                chatStream.processPendingQueue();
            }
            return;
        }

        // completions → WebSocket 流式
        chatStream.startChatStream(sessionId, userMsg, () => chatStream.processPendingQueue());
    };

    // ===== 附件 =====
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

    // ===== 弹窗：Token 统计 / 会话设置 =====
    const owner_of = (sessionId: string) => session_api.owner_of_session(sessionId);

    const showUsageStatsPopup = async (sessionId: string) => {
        set_prompt_card({
            open: true,
            title: t('Token消耗统计'),
            context_div: <div className="usage-stats-loading">{t('加载中...')}</div>,
            cancel: () => set_prompt_card({ open: false }),
        });
        try {
            const ownerId = owner_of(sessionId);
            const result = ownerId
                ? await session_api.admin_call("usage_stats", { session_id: sessionId, user_id: ownerId })
                : await ai_agentHttp.post("session/usage_stats", { session_id: sessionId });
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

    const showSessionSettingPopup = (sessionId: string) => {
        let cwd_value = session_api.sessions.find(s => s.id === sessionId)?.file_cwd_path ?? "";
        set_prompt_card({
            open: true,
            title: t('会话设置'),
            context_div: (
                <div className="session-setting">
                    <div className="session-setting__label">{t('服务器工作目录')}</div>
                    <InputText
                        value={cwd_value}
                        placeholder={t('服务器工作目录提示')}
                        handleInputChange={(value) => { cwd_value = value; }}
                    />
                </div>
            ),
            confirm: async () => {
                try {
                    const ownerId = owner_of(sessionId);
                    const result = ownerId
                        ? await session_api.admin_call("setting", {
                            session_id: sessionId, user_id: ownerId, file_cwd_path: cwd_value.trim()
                        })
                        : await ai_agentHttp.post("session/setting", {
                            session_id: sessionId, file_cwd_path: cwd_value.trim()
                        });
                    if (result.code === RCode.Success) NotySuccess(t('保存成功'));
                } catch {
                    // 路径非法等错误由 http 层统一提示
                }
                set_prompt_card({ open: false });
                await session_api.loadSessions(session_api.activeSessionId);
            },
            cancel: () => set_prompt_card({ open: false }),
        });
    };

    // ===== 会话列表相关 =====
    const toggleSessionPanel = () => set_ai_session_collapsed(prev => !prev);

    const toggleSessionSelect = (id: string) => {
        setSelectedSessionIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    /** 进入/退出批量模式时清空两侧选择 */
    const toggleBatchMode = () => {
        if (msg.batchMode) {
            msg.setSelectedMsgIds(new Set());
            setSelectedSessionIds(new Set());
        }
        msg.setBatchMode(prev => !prev);
    };

    // ===== 启动 =====
    const init = async () => {
        const envResult = await settingHttp.get("ai_agent_setting/env");
        if (envResult.code === RCode.Success) {
            env_config.current = envResult.data;
            syncCurrentModelFromEnv(envResult.data);
        }
        await loadPublicModels();
        await session_api.init_active_session();

        const sysPromptResult = await ai_agentHttp.get("system_prompts");
        if (sysPromptResult.code === RCode.Success) setSysPromptList(sysPromptResult.data ?? []);
    };

    const handleModelChanged = async () => {
        await loadPublicModels();
        const envResult = await settingHttp.get("ai_agent_setting/env");
        if (envResult.code === RCode.Success) {
            env_config.current = envResult.data;
            syncCurrentModelFromEnv(envResult.data);
        }
    };

    useEffect(() => {
        init();
        requestAnimationFrame(() => msg.scrollToBottom(false));

        bgPanelRef.current.onCountChange = setBgProcessCount;
        bgPanelRef.current.refresh?.();

        const handle_bg_count = (data: any) => {
            const count = data?.context?.count;
            if (typeof count === 'number') setBgProcessCount(count);
        };
        ws.addMsg(CmdType.ai_bg_process_count_notify, handle_bg_count);

        return () => {
            // 只移除自己的 handler，不能清空该类型全部监听（多实例会误伤）
            ws.off_message(`message_${CmdType.ai_bg_process_count_notify}`, handle_bg_count);
        };
    }, []);

    // ===== 渲染 =====
    const sending = sendingSessionId === session_api.activeSessionId || session_api.activeSessionRunning;

    return (
        <React.Fragment>
            <ChatHeader
                inline={inline_header}
                currentModelName={currentModelName}
                setCurrentModelName={setCurrentModelName}
                modelGroups={modelGroups}
                onModelChanged={handleModelChanged}
                batchMode={msg.batchMode}
                selectedMsgCount={msg.selectedMsgIds.size}
                sessionVisible={!ai_session_collapsed}
                onToggleSessionPanel={toggleSessionPanel}
                onCreateSession={session_api.createSession}
                onBatchDeleteMessages={msg.batchDeleteMessages}
                onToggleBatchMode={toggleBatchMode}
                bgProcessVisible={ai_bg_expanded}
                bgProcessCount={bgProcessCount}
                onToggleBgProcess={() => set_ai_bg_expanded((v: boolean) => !v)}
            />

            <div
                className={"chat-page" + (inline_header ? " chat-page--embedded" : " chat-page-with-sessions")}
                style={{ "--ai-chat-zoom": ai_chat_zoom } as React.CSSProperties}
            >
                {/* 移动端遮罩：会话列表展开时铺满，点击空白收起 */}
                {!ai_session_collapsed && (
                    <div className="chat-session-overlay" onClick={() => set_ai_session_collapsed(true)} />
                )}

                {!ai_session_collapsed && (
                    <SessionList
                        sessions={session_api.sessions}
                        activeSessionId={session_api.activeSessionId}
                        onSelectSession={(id) => session_api.loadSession(id, false)}
                        onReorderSessions={session_api.reorderSessions}
                        onRenameSession={session_api.renameSession}
                        onDeleteSession={session_api.deleteSession}
                        onToggleCmdAuto={session_api.toggleCmdAuto}
                        onShowUsageStats={showUsageStatsPopup}
                        onShowSessionSetting={showSessionSettingPopup}
                        batchMode={msg.batchMode}
                        selectedSessionIds={selectedSessionIds}
                        onToggleSessionSelect={toggleSessionSelect}
                        onToggleBatchMode={toggleBatchMode}
                        onBatchDeleteSessions={() => session_api.batchDeleteSessions(
                            selectedSessionIds,
                            () => { setSelectedSessionIds(new Set()); msg.setBatchMode(false); }
                        )}
                        onClearAllSessions={session_api.admin_all_mode ? undefined : session_api.clearAllSessions}
                        allUsersMode={session_api.admin_all_mode}
                        onToggleAllUsersMode={session_api.toggleAllUsersMode}
                        showAllUsersEntry={is_root}
                        sysPromptList={sysPromptList}
                        onChangeSysPrompt={(sid, pid) => session_api.changeSystemPrompt(pid, sid)}
                    />
                )}

                <BackgroundProcessPanel panelRef={bgPanelRef} />

                <section className="chat-main">
                    {msg.messages?.length === 0 && (
                        <div className="chat-header">
                            <div>{t('ai_ask')}</div>
                        </div>
                    )}

                    <ChatMessageList
                        messages={msg.messages}
                        batchMode={msg.batchMode}
                        selectedMsgIds={msg.selectedMsgIds}
                        sending={sending}
                        chatContainerRef={msg.chatContainerRef}
                        messagesEndRef={messagesEndRef}
                        onToggleMsgSelect={msg.toggleMsgSelect}
                        onDelete={msg.handleDelete}
                        onCopy={msg.handleCopy}
                        onCopyAll={msg.handleCopyAll}
                        onToggleBatchMode={toggleBatchMode}
                        onBatchCopy={msg.handleBatchCopy}
                        onBatchDelete={msg.batchDeleteMessages}
                        // 只有「选了气泡、没选会话」时才显示气泡批量条
                        showBatchBar={msg.batchMode && msg.selectedMsgIds.size > 0 && selectedSessionIds.size === 0}
                        t={t}
                    />

                    <ChatInput
                        ref={chatInputRef}
                        onSend={handleSend}
                        // 超管查看全部会话模式禁止发送
                        readonly={session_api.admin_all_mode}
                        sending={sending}
                        onAbort={chatStream.abort}
                        pendingAttachments={pendingAttachments}
                        onRemoveAttachment={removePendingAttachment}
                        onOpenFilePicker={openFilePicker}
                        onAddFiles={addAttachments}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        fileInputRef={fileInputRef}
                    />
                </section>
            </div>
        </React.Fragment>
    );
}
