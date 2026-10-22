/**
 * 会话管理：会话列表、切换、增删改、排序、超管跨用户模式。
 *
 * 只负责「会话这一层」的状态与请求，不关心消息气泡渲染细节；
 * 切换会话后如何把消息铺进列表由调用方通过 on_session_loaded 接管。
 */
import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ai_agentHttp } from "../../../util/config";
import { normalize_path } from "../../../../../common/StringUtil";
import { move_element } from "../../../../../common/ListUtil";
import { using_confirm } from "../../prompts/prompt.util";
import { RCode } from "../../../../../common/Result.pojo";
import { InputText } from "../../../../meta/component/Input";
import { NotySuccess } from "../../../util/noty";
import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta,
    ai_agent_message_item,
} from "../../../../../common/req/filecat.ai.pojo";

/** 会话列表项：超管模式下额外带属主信息 */
export type SessionListItem = ai_agent_chat_session_meta & { user_id?: string; owner_name?: string };

interface Options {
    /** 会话切换成功后把消息铺进气泡列表（由消息层实现） */
    on_session_loaded: (
        session: ai_agent_chat_session_item & { running?: boolean; live_messages?: ai_agent_message_item[] }
    ) => void;
    /** 切换会话时是否同时展开会话列表 */
    set_session_panel_open: (open: boolean) => void;
    /** 会话 id 变化通知（嵌入场景写回外部） */
    on_session_change?: (sessionId: string) => void;
    /** 面板绑定的工作目录，新建会话时带上 */
    init_cwd?: string;
    /** 把当前会话写进 URL（整页模式） */
    write_url_session: (sessionId: string | null) => void;
    /** 当前 URL 里的会话 id，用于避免重复写入 */
    url_session_id: string;
    /** 启动时优先定位的会话 id */
    init_session_id?: string;
}

export function useSessionManager(options: Options) {
    const {
        on_session_loaded, set_session_panel_open, on_session_change,
        init_cwd, write_url_session, url_session_id, init_session_id,
    } = options;

    const { t } = useTranslation();
    const confirm_dell_all = using_confirm();

    const [sessions, setSessions] = useState<SessionListItem[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [selectedSysPromptId, setSelectedSysPromptId] = useState<string>("");
    /** 超管：查看所有用户会话 */
    const [admin_all_mode, set_admin_all_mode] = useState(false);
    /** 当前活动会话是否正在执行（其它标签页/刷新后） */
    const [activeSessionRunning, setActiveSessionRunning] = useState(false);
    /** 超管模式下是否限制发送（消息会写进当前登录用户，跨用户会错数据） */
    const [readonly, setReadonly] = useState(false);

    // 供异步回调/闭包读取最新值的 ref（useState 在闭包里是首渲染快照）
    const admin_mode_ref = useRef(false);
    const sessions_ref = useRef<SessionListItem[]>([]);
    useEffect(() => { admin_mode_ref.current = admin_all_mode; }, [admin_all_mode]);
    useEffect(() => { sessions_ref.current = sessions; }, [sessions]);

    /** 超管统一接口：对任意用户会话增删改查 */
    const admin_call = (action: string, payload: Record<string, any> = {}) =>
        ai_agentHttp.post("admin/session", { action, ...payload });

    /** 统一走 admin 或普通接口 */
    const call = (adminAction: string, adminPayload: Record<string, any>, normal: () => Promise<any>) =>
        admin_mode_ref.current ? admin_call(adminAction, adminPayload) : normal();

    /** 取某会话的属主 id（非超管模式返回 undefined） */
    const owner_of_session = (sessionId: string): string | undefined => {
        if (!admin_mode_ref.current) return undefined;
        return sessions_ref.current.find(s => s.id === sessionId)?.user_id;
    };

    /** 拉取会话列表（不自动选中） */
    const refreshSessions = async () => {
        const result = admin_mode_ref.current
            ? await admin_call("list_all_sessions")
            : await ai_agentHttp.get("sessions");
        if (result.code === RCode.Success) {
            setSessions(result.data ?? []);
        }
    };

    /** 本地更新某会话的执行中标记，不发请求 */
    const markSessionRunning = (sessionId: string, running: boolean) => {
        setSessions(prev => {
            const target = prev.find(it => it.id === sessionId);
            if (!target || !!target.running === running) return prev;
            return prev.map(it => (it.id === sessionId ? { ...it, running } : it));
        });
    };

    /** 加载单个会话并铺消息 */
    const loadSession = async (
        sessionId: string,
        switch_menu = false,
        ownerId_override?: string
    ): Promise<boolean> => {
        const ownerId = ownerId_override ?? sessions_ref.current.find(s => s.id === sessionId)?.user_id;
        const result = admin_mode_ref.current && ownerId
            ? await admin_call("get", { session_id: sessionId, user_id: ownerId })
            : await ai_agentHttp.post("session/get", { session_id: sessionId });
        if (result.code !== RCode.Success || !result.data) return false;

        const session = result.data as ai_agent_chat_session_item & {
            running?: boolean;
            live_messages?: ai_agent_message_item[];
        };
        setActiveSessionId(session.id);
        if (url_session_id !== session.id) write_url_session(session.id);
        on_session_change?.(session.id);
        setActiveSessionRunning(!!session.running);
        setSelectedSysPromptId(session.sys_prompt_id ?? "");
        if (switch_menu) set_session_panel_open(true);
        on_session_loaded(session);
        return true;
    };

    /** 拉列表并选中（selectId 为 null 表示选第一个） */
    const loadSessions = async (selectId?: string | null): Promise<boolean> => {
        const result = admin_mode_ref.current
            ? await admin_call("list_all_sessions")
            : await ai_agentHttp.get("sessions");
        if (result.code !== RCode.Success) return false;

        const list: SessionListItem[] = result.data ?? [];
        setSessions(list);
        const nextId = selectId === null
            ? (list[0]?.id ?? "")
            : (selectId || activeSessionId || list[0]?.id || "");

        if (!nextId) {
            setActiveSessionId("");
            write_url_session(null);
            on_session_loaded(null);
            return false;
        }
        const ownerId = list.find(s => s.id === nextId)?.user_id;
        return await loadSession(nextId, false, ownerId);
    };

    /** 新建会话（默认不继承当前系统提示词） */
    const createSession = async (sysPromptId?: string) => {
        const result = await ai_agentHttp.post("session", {
            sys_prompt_id: sysPromptId || undefined,
            file_cwd_path: init_cwd || undefined,
        });
        if (result.code !== RCode.Success) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setSelectedSysPromptId(session.sys_prompt_id ?? "");
        set_session_panel_open(true);
        on_session_loaded(null);
        await loadSessions(session.id);
        // 新建后把输入框高度归位
        requestAnimationFrame(() => {
            const el = document.querySelector('.chat-input') as HTMLTextAreaElement;
            if (el) {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }
        });
    };

    /** 按工作目录定位会话，找不到就用该目录新建 */
    const locate_session_by_cwd = async (cwd: string): Promise<string | null> => {
        if (!cwd) return null;
        const result = await ai_agentHttp.get("sessions");
        if (result.code !== RCode.Success) return null;
        const list: ai_agent_chat_session_meta[] = result.data ?? [];
        const normalized = normalize_path(cwd);
        const matched = list.find(it => normalize_path(it.file_cwd_path) === normalized);
        if (matched) return matched.id;
        const created = await ai_agentHttp.post("session", { file_cwd_path: normalized });
        if (created.code !== RCode.Success) return null;
        return (created.data as ai_agent_chat_session_item).id;
    };

    /** 拖动排序（跨用户排序无意义，超管模式不处理） */
    const reorderSessions = (from_id: string, to_id: string) => {
        if (admin_mode_ref.current) return;
        const from = sessions_ref.current.findIndex(it => it.id === from_id);
        const to = sessions_ref.current.findIndex(it => it.id === to_id);
        if (from < 0 || to < 0 || from === to) return;
        const next = move_element<ai_agent_chat_session_meta>(sessions_ref.current, from, to);
        setSessions(next);
        ai_agentHttp.post("sessions/update/sort", {
            session_ids: next.map(it => it.id),
        }).catch(() => { });
    };

    const deleteSession = (sessionId: string) => {
        confirm_dell_all({
            sub_title: "确认删除这个会话吗?",
            confirm_fun: async () => {
                const ownerId = owner_of_session(sessionId);
                if (ownerId) {
                    await admin_call("delete", { session_id: sessionId, user_id: ownerId });
                } else {
                    await ai_agentHttp.post("session/delete", { session_id: sessionId });
                }
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
                const ownerId = owner_of_session(sessionId);
                if (ownerId) {
                    await admin_call("rename", { session_id: sessionId, user_id: ownerId, title: new_name });
                } else {
                    await ai_agentHttp.post("sessions/update/meta", { id: sessionId, title: new_name });
                }
                await loadSessions(activeSessionId);
            },
            context_div: (
                <div className="card-content">
                    <InputText value={new_name} handleInputChange={(value) => { new_name = value; }} />
                </div>
            )
        });
    };

    /** 切换该会话的「命令免确认」开关 */
    const toggleCmdAuto = async (sessionId: string, allow: boolean) => {
        const ownerId = owner_of_session(sessionId);
        if (ownerId) {
            await admin_call("cmd_auto", { session_id: sessionId, user_id: ownerId, allow });
        } else {
            await ai_agentHttp.post("session/cmd_auto_allow", { session_id: sessionId, allow });
        }
        NotySuccess(allow ? t('命令检测已开启') : t('命令检测已关闭'));
        await loadSessions(activeSessionId);
    };

    /** 批量删除会话 */
    const batchDeleteSessions = (selectedSessionIds: Set<string>, reset_batch: () => void) => {
        if (selectedSessionIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("cf_ses"),
            confirm_fun: async () => {
                if (admin_mode_ref.current) {
                    await admin_call("batch_delete", { session_ids: Array.from(selectedSessionIds) });
                } else {
                    for (const sid of selectedSessionIds) {
                        await ai_agentHttp.post("session/delete", { session_id: sid });
                    }
                }
                reset_batch();
                if (selectedSessionIds.has(activeSessionId)) {
                    setActiveSessionId("");
                    await loadSessions(null);
                } else {
                    await loadSessions(activeSessionId);
                }
            }
        });
    };

    /** 清空当前用户全部会话（超管模式不提供） */
    const clearAllSessions = () => {
        confirm_dell_all({
            sub_title: t("cf_all"),
            confirm_fun: async () => {
                await ai_agentHttp.post("sessions/clear", {});
                setActiveSessionId("");
                on_session_loaded(null);
                await loadSessions(null);
            }
        });
    };

    /** 超管：切换「查看所有用户会话」 */
    const toggleAllUsersMode = async () => {
        const next = !admin_all_mode;
        set_admin_all_mode(next);
        admin_mode_ref.current = next;
        setReadonly(next);
        setActiveSessionId("");
        on_session_loaded(null);
        const result = next
            ? await admin_call("list_all_sessions")
            : await ai_agentHttp.get("sessions");
        const list: SessionListItem[] = result.code === RCode.Success ? (result.data ?? []) : [];
        setSessions(list);
        if (list[0]?.id) await loadSession(list[0].id, false, list[0].user_id);
    };

    /** 切换系统提示词并持久化到会话 */
    const changeSystemPrompt = (id: string) => {
        setSelectedSysPromptId(id);
        if (!activeSessionId) return;
        const ownerId = owner_of_session(activeSessionId);
        if (ownerId) {
            admin_call("sys_prompt", {
                session_id: activeSessionId,
                user_id: ownerId,
                sys_prompt_id: id || undefined
            }).catch(console.error);
        } else {
            ai_agentHttp.post("session/sys_prompt", {
                session_id: activeSessionId,
                sys_prompt_id: id || undefined
            }).catch(console.error);
        }
    };

    /** 启动定位：按 cwd → init_session_id → url → 列表首个 */
    const init_active_session = async () => {
        if (init_cwd) {
            const located = await locate_session_by_cwd(init_cwd);
            const ok = located ? await loadSessions(located) : false;
            if (!ok) await loadSessions();
        } else if (init_session_id) {
            const ok = await loadSessions(init_session_id);
            if (!ok) await loadSessions();
        } else if (url_session_id) {
            const ok = await loadSessions(url_session_id);
            if (!ok) await loadSessions();
        } else {
            await loadSessions();
        }
    };

    return {
        // 状态
        sessions, setSessions, sessions_ref,
        activeSessionId, setActiveSessionId,
        selectedSysPromptId, setSelectedSysPromptId,
        admin_all_mode, admin_mode_ref, readonly,
        activeSessionRunning, setActiveSessionRunning,
        // 请求
        admin_call, call, owner_of_session,
        refreshSessions, markSessionRunning,
        loadSession, loadSessions, createSession,
        locate_session_by_cwd, init_active_session,
        // 会话操作
        reorderSessions, deleteSession, renameSession, toggleCmdAuto,
        batchDeleteSessions, clearAllSessions, toggleAllUsersMode,
        changeSystemPrompt,
    };
}
