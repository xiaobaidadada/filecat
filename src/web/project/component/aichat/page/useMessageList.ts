/**
 * 消息列表：气泡状态、滚动、实时气泡索引、批量选择、消息级操作。
 *
 * 不负责请求发送（发送在 useChatStream / 调用方），只做「拿到消息后怎么显示」。
 */
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from "../../../util/FunUtil";
import { NotySuccess } from "../../../util/noty";
import { using_confirm } from "../../prompts/prompt.util";
import { ai_agentHttp } from "../../../util/config";
import { RCode } from "../../../../../common/Result.pojo";
import {
    ai_agent_chat_session_item,
    ai_agent_message_item,
} from "../../../../../common/req/filecat.ai.pojo";
import { Message, message_to_text } from "./chatTypes";
import { toUiMessages } from "./messageUtils";

interface Deps {
    /** 超管接口 */
    admin_call: (action: string, payload?: Record<string, any>) => Promise<any>;
    /** 取会话属主 id（非超管返回 undefined） */
    owner_of_session: (sessionId: string) => string | undefined;
    /** 会话列表，用于「全部复制」按顺序遍历 */
    get_sessions: () => { id: string; user_id?: string }[];
    /** 当前会话 id */
    activeSessionId: string;
    /** 超管模式标记（异步闭包读取） */
    admin_mode_ref: React.MutableRefObject<boolean>;
}

export function useMessageList(deps: Deps) {
    const {
        admin_call, owner_of_session, get_sessions,
        activeSessionId, admin_mode_ref,
    } = deps;

    const { t } = useTranslation();
    const confirm_dell_all = using_confirm();

    const [messages, setMessages] = useState<Message[]>([]);
    const [batchMode, setBatchMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());

    // ===== 滚动 =====
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const autoScrollRef = useRef(true);
    const pendingScrollRef = useRef(false);

    /** 判断容器是否已接近底部（用户没往上翻时保持贴底） */
    const isNearBottom = (el: HTMLElement, threshold = 120) => {
        const { scrollTop, scrollHeight, clientHeight } = el;
        return scrollHeight - (scrollTop + clientHeight) < threshold;
    };

    const scrollToBottom = (smooth = false) => {
        const el = chatContainerRef.current;
        if (!el) return;
        // markdown/代码块/图片会异步撑高，单帧滚动会停在旧高度，
        // 连续几帧校正直到高度稳定，避免刷新后停在中间。
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        let frames = 0;
        const settle = () => {
            const el2 = chatContainerRef.current;
            if (!el2) return;
            el2.scrollTo({ top: el2.scrollHeight, behavior: smooth && frames === 0 ? "smooth" : "auto" });
            if (++frames < 6) requestAnimationFrame(settle);
        };
        requestAnimationFrame(settle);
    };

    /** 切换会话后无条件滚到底（否则会沿用上一会话的 autoScroll 状态停在中间） */
    const request_scroll_bottom = () => {
        pendingScrollRef.current = true;
    };

    useLayoutEffect(() => {
        if (pendingScrollRef.current) {
            pendingScrollRef.current = false;
            autoScrollRef.current = true;
        }
        if (autoScrollRef.current) scrollToBottom(false);
    }, [messages]);

    /** 内容异步撑高时保持贴底 */
    useEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const onScroll = () => { autoScrollRef.current = isNearBottom(el); };
        el.addEventListener("scroll", onScroll);

        const stick = () => {
            if (autoScrollRef.current) el.scrollTop = el.scrollHeight;
        };
        const ro = new ResizeObserver(stick);
        const observe_all = () => [...el.children].forEach(c => ro.observe(c));
        observe_all();
        const mo = new MutationObserver(() => { observe_all(); stick(); });
        mo.observe(el, { childList: true });

        return () => {
            el.removeEventListener("scroll", onScroll);
            ro.disconnect();
            mo.disconnect();
        };
    }, []);

    /**
     * 把后端返回的会话数据铺成气泡列表。
     * session 为 null 表示清空（无会话 / 新建会话）。
     */
    const apply_session = (
        session: (ai_agent_chat_session_item & { live_messages?: ai_agent_message_item[] }) | null
    ) => {
        if (!session) {
            setMessages([]);
            request_scroll_bottom();
            return;
        }
        let raw = session.messages ?? [];
        if (session.live_messages?.length) {
            raw = [...raw, ...session.live_messages];
        }
        setMessages(toUiMessages(raw));
        request_scroll_bottom();
    };

    // ===== 消息操作 =====
    const handleDelete = (id: number) => {
        confirm_dell_all({
            sub_title: t("cf_one"),
            confirm_fun: async () => {
                const targetIndex = messages.findIndex(m => m.id === id);
                if (targetIndex < 0) return;
                setMessages(messages.filter(m => m.id !== id));
                if (!activeSessionId) return;
                const ownerId = owner_of_session(activeSessionId);
                if (ownerId) {
                    admin_call("message_delete", {
                        session_id: activeSessionId, user_id: ownerId, indices: [targetIndex]
                    }).catch(console.error);
                } else {
                    ai_agentHttp.post("session/message/delete", {
                        session_id: activeSessionId, indices: [targetIndex]
                    }).catch(console.error);
                }
            }
        });
    };

    const handleCopy = async (msg: Message) => {
        copyToClipboard(message_to_text(msg));
        NotySuccess('复制成功');
    };

    /** 全部复制：按会话列表顺序遍历所有会话的消息 */
    const handleCopyAll = async () => {
        const sessions = get_sessions();
        if (!sessions.length) {
            NotySuccess('暂无聊天记录');
            return;
        }
        const chunks: string[] = [];
        for (const s of sessions) {
            const result = s.user_id
                ? await admin_call("get", { session_id: s.id, user_id: s.user_id })
                : await ai_agentHttp.post("session/get", { session_id: s.id });
            if (result.code !== RCode.Success || !result.data) continue;
            const session = result.data as ai_agent_chat_session_item & { live_messages?: ai_agent_message_item[] };
            const msgs = [...(session.messages ?? []), ...(session.live_messages ?? [])];
            const body = toUiMessages(msgs).map(message_to_text).filter(Boolean).join("\n\n\n");
            if (body) chunks.push(body);
        }
        if (!chunks.length) {
            NotySuccess('暂无聊天记录');
            return;
        }
        copyToClipboard(chunks.join("\n\n\n"));
        NotySuccess('复制成功');
    };

    /** 复制所选：按消息原始顺序拼接 */
    const handleBatchCopy = () => {
        const text = messages
            .filter(m => selectedMsgIds.has(m.id))
            .map(message_to_text)
            .filter(Boolean)
            .join("\n\n\n");
        if (!text) {
            NotySuccess('暂无内容');
            return;
        }
        copyToClipboard(text);
        NotySuccess('复制成功');
    };

    const toggleBatchMode = () => {
        if (batchMode) setSelectedMsgIds(new Set());
        setBatchMode(prev => !prev);
    };

    const toggleMsgSelect = (id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const batchDeleteMessages = () => {
        if (selectedMsgIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("cf_msgs"),
            confirm_fun: async () => {
                const indicesToDelete: number[] = [];
                messages.forEach((m, idx) => { if (selectedMsgIds.has(m.id)) indicesToDelete.push(idx); });
                setMessages(messages.filter(m => !selectedMsgIds.has(m.id)));
                setSelectedMsgIds(new Set());
                setBatchMode(false);
                if (!activeSessionId || indicesToDelete.length === 0) return;
                const ownerId = owner_of_session(activeSessionId);
                if (ownerId) {
                    admin_call("message_delete", {
                        session_id: activeSessionId, user_id: ownerId, indices: indicesToDelete
                    }).catch(console.error);
                } else {
                    ai_agentHttp.post("session/message/delete", {
                        session_id: activeSessionId, indices: indicesToDelete
                    }).catch(console.error);
                }
            }
        });
    };

    return {
        messages, setMessages,
        batchMode, setBatchMode,
        selectedMsgIds, setSelectedMsgIds,
        chatContainerRef, autoScrollRef,
        isNearBottom, scrollToBottom, request_scroll_bottom,
        apply_session,
        handleDelete, handleCopy, handleCopyAll,
        handleBatchCopy, toggleBatchMode, toggleMsgSelect, batchDeleteMessages,
    };
}
