/**
 * 实时广播订阅：接收「其它标签页 / 刷新后」正在执行的同一会话的流式输出。
 *
 * 关键点：
 *   - 订阅只建立一次（effect 依赖为空），按消息自带的 session_id 路由，
 *     不随 activeSessionId 变化反复拆装监听；
 *   - 本地正在发送的会话跳过，避免与 useChatStream 重复渲染；
 *   - 结束/报错优先用后端给的 once_messages_list 就地重建本轮气泡，不整份重拉。
 */
import React, { useEffect, useRef } from 'react';
import { CmdType } from "../../../../../common/frame/WsData";
import { ws } from "../../../util/ws";
import { ai_chat_send_message, ai_agent_message_item } from "../../../../../common/req/filecat.ai.pojo";
import { Message } from "./chatTypes";
import { toUiMessages, next_placeholder_id } from "./messageUtils";

interface Deps {
    /** 当前活动会话 id（实时值） */
    active_session_id_ref: React.MutableRefObject<string>;
    /**
     * 本轮由本地发起的会话 id。
     * 只有它才是「本地正在渲染」的可靠判据：sending 状态在收到 end 时立刻被清空，
     * 收尾时依赖它会让本地路径与广播路径同时收尾，造成 id 重排与重复 key。
     */
    local_owner_ref: React.MutableRefObject<string | null>;
    /** 已订阅的会话 id */
    subscribed_ref: React.MutableRefObject<string | null>;
    /** 追加/更新实时文本 */
    set_messages: React.Dispatch<React.SetStateAction<Message[]>>;
    /** 滚到底（用户没上翻时） */
    scroll_to_bottom: () => void;
    auto_scroll_ref: React.MutableRefObject<boolean>;
    /** 更新会话列表的 running 标记 */
    mark_session_running: (sessionId: string, running: boolean) => void;
    /** 结束后的会话元信息刷新 */
    refresh_sessions: () => void;
    /** 重载单个会话（无 once_messages_list 时兜底） */
    reload_session: (sessionId: string) => Promise<boolean>;
    /** 设置活动会话的执行中状态 */
    set_active_session_running: (running: boolean) => void;
}

export function useChatSubscription(deps: Deps) {
    const {
        active_session_id_ref, local_owner_ref, subscribed_ref,
        set_messages, scroll_to_bottom, auto_scroll_ref,
        mark_session_running, refresh_sessions, reload_session, set_active_session_running,
    } = deps;

    // chunk_index -> 气泡 id。后端每轮输出带 chunk_index，必须按它精确命中气泡；
    // 只按「末尾 bot 气泡」猜，在 live_messages 渲染出多个气泡时会错位。
    const chunkBubbleRef = useRef(new Map<number, number>());

    /** 把 live_messages 按末尾顺序登记到 chunkBubbleRef，保证后续增量续写同一气泡 */
    const bind_live_bubbles = (uiMessages: Message[], liveCount: number) => {
        chunkBubbleRef.current.clear();
        for (let i = 0; i < liveCount; i++) {
            const m = uiMessages[uiMessages.length - liveCount + i];
            if (m) chunkBubbleRef.current.set(i, m.id);
        }
    };

    const clear_bubbles = () => chunkBubbleRef.current.clear();

    useEffect(() => {
        const activeId = () => active_session_id_ref.current;

        /** 追加/更新实时文本到当前查看的会话 */
        const appendLiveText = (
            sessionId: string, text: string, tool_call_ends?: any, notice?: boolean, chunk_index = 0
        ) => {
            if (!activeId() || activeId() !== sessionId) return;
            // 本地发起的会话由 useChatStream 渲染，这里跳过避免重复。
            // 用 local_owner_ref 而不是 sending：后者在 end 时立即清空，
            // 存在「end 后仍收到 msg」的窗口，会导致两套 id 体系的气泡并存、key 重复。
            if (local_owner_ref.current === sessionId) return;

            set_messages(prev => {
                const map = chunkBubbleRef.current;
                // notice 用独立 key，避免提示文字混进正文气泡
                const key = notice ? -(chunk_index + 1) : chunk_index;
                let list = prev;

                // 收到真实内容，先移除同轮的临时提示气泡
                if (!notice) {
                    const temp_i = -(chunk_index + 1);
                    const noticeId = map.get(temp_i);
                    if (noticeId !== undefined) {
                        list = list.filter(m => m.id !== noticeId);
                        map.delete(temp_i);
                    }
                }

                const targetId = map.get(key);
                const idx = targetId === undefined ? -1 : list.findIndex(m => m.id === targetId);
                const target: Message = idx === -1
                    ? { id: next_placeholder_id(), sender: 'bot', text: '' }
                    : { ...list[idx] };
                if (idx === -1) map.set(key, target.id);

                if (notice) {
                    target.text = text;
                    target.is_loading = true;
                } else if (text) {
                    target.text = target.text + text;
                    target.is_loading = false;
                }
                if (tool_call_ends) {
                    target.content_list = [{ tool_call_ends, content: target.text, role: "assistant" }];
                    target.is_loading = false;
                }
                if (auto_scroll_ref.current) requestAnimationFrame(() => scroll_to_bottom());

                if (idx === -1) return [...list, target];
                const next = list.slice();
                next[idx] = target;
                return next;
            });
        };

        /** 会话结束（正常结束与报错共用） */
        const handleEnd = (sessionId: string, once_messages_list?: ai_agent_message_item[]) => {
            mark_session_running(sessionId, false);
            chunkBubbleRef.current.clear();
            if (activeId() && activeId() === sessionId) {
                set_active_session_running(false);
                // 后端已无该会话运行登记，退订避免残留
                if (subscribed_ref.current === sessionId) {
                    ws.sendData(CmdType.ai_chat_subscribe, { session_id: sessionId, subscribe: false });
                    subscribed_ref.current = null;
                }
                // 本地发起、且正在由 useChatStream 收尾 → 这里必须让路。
                // 注意不能只看 sendingNow()：useChatStream 在收到 end 的第一时间就把
                // sending 清空了，若此处再收尾一次会用另一套 id 规则重排消息，
                // 造成同一次渲染里出现重复 key（React 报 duplicate key）。
                if (local_owner_ref.current === sessionId) {
                    local_owner_ref.current = null;
                    return;
                }

                if (once_messages_list?.length) {
                    // once_messages_list 是本轮权威数据（只含 assistant）。
                    // 全局路径不掌握本轮起点，采取保守策略：只替换末尾连续的 bot 气泡，
                    // 不跨过 user 边界，绝不触碰已有历史。
                    set_messages(prev => {
                        let tailStart = prev.length;
                        while (tailStart > 0 && prev[tailStart - 1].sender === 'bot') tailStart--;
                        const head = prev.slice(0, tailStart);
                        const rebuilt = toUiMessages(once_messages_list);
                        // 按最终位置统一派生 id，与本地收尾、历史加载规则一致
                        return [...head, ...rebuilt].map((m, i) => ({ ...m, id: i + 1 }));
                    });
                } else {
                    reload_session(sessionId).catch(() => { });
                }
            }
            // 结束后标题/更新时间可能已变，同步一次元信息
            refresh_sessions();
        };

        const handleChatMsg = (data: any) => {
            const ctx: ai_chat_send_message = data?.context || {};
            if (!ctx.session_id) return;
            appendLiveText(ctx.session_id, ctx.text || "", ctx.tool_call_ends, ctx.notice, ctx.chunk_index);
            mark_session_running(ctx.session_id, true);
        };
        const handleChatEnd = (data: any) => {
            const ctx = data?.context || {};
            if (ctx.session_id) handleEnd(ctx.session_id, ctx.once_messages_list);
        };
        const handleChatError = (data: any) => {
            const ctx = data?.context || {};
            if (ctx.session_id) handleEnd(ctx.session_id, ctx.once_messages_list);
        };

        ws.addMsg(CmdType.ai_chat_msg, handleChatMsg);
        ws.addMsg(CmdType.ai_chat_end, handleChatEnd);
        ws.addMsg(CmdType.ai_chat_error, handleChatError);

        return () => {
            ws.off_message(`message_${CmdType.ai_chat_msg}`, handleChatMsg);
            ws.off_message(`message_${CmdType.ai_chat_end}`, handleChatEnd);
            ws.off_message(`message_${CmdType.ai_chat_error}`, handleChatError);
            // 卸载时退订正在绑定的会话
            if (subscribed_ref.current) {
                ws.sendData(CmdType.ai_chat_subscribe, { session_id: subscribed_ref.current, subscribe: false });
                subscribed_ref.current = null;
            }
        };
    }, []);

    return { chunkBubbleRef, bind_live_bubbles, clear_bubbles };
}
