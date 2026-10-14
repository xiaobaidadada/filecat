import React, {useState} from 'react';
import {useTranslation} from "react-i18next";

import {MenuSelect} from "../../prompts/Prompt";
import {Icon, ActionButton} from "../../../../meta/component/Button";
import {ai_agent_chat_session_meta} from "../../../../../common/req/filecat.ai.pojo";

function toSessionTitle(title: string) {
    return title || "新会话";
}

/**
 * AI 会话列表面板
 * 包含搜索、会话列表、底部操作栏（批量选择 / 删除全部）
 */
export default function SessionList({
                                        sessions,
                                        activeSessionId,
                                        onSelectSession,
                                        onReorderSessions,
                                        onRenameSession,
                                        onDeleteSession,
                                        onToggleCmdAuto,
                                        onShowUsageStats,
                                        onShowSessionSetting,
                                        batchMode,
                                        selectedSessionIds,
                                        onToggleSessionSelect,
                                        onToggleBatchMode,
                                        onBatchDeleteSessions,
                                        onClearAllSessions,
                                        /** 是否处于「查看所有用户会话」模式（仅超级管理员可见该入口） */
                                        allUsersMode,
                                        onToggleAllUsersMode,
                                        /** 是否显示「所有用户会话」入口（root） */
                                        showAllUsersEntry,
                                    }: {
    sessions: (ai_agent_chat_session_meta & { user_id?: string; owner_name?: string })[];
    activeSessionId: string;
    onSelectSession: (id: string) => void;
    /** 拖动排序回调：传入被拖项与落点项的会话 id */
    onReorderSessions?: (from_id: string, to_id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onDeleteSession: (id: string) => void;
    onToggleCmdAuto?: (id: string, allow: boolean) => void;
    onShowUsageStats: (id: string) => void;
    /** 打开「会话设置」弹框（配置该会话的服务器工作目录） */
    onShowSessionSetting?: (id: string) => void;
    batchMode?: boolean;
    selectedSessionIds?: Set<string>;
    onToggleSessionSelect?: (id: string) => void;
    onToggleBatchMode?: () => void;
    onBatchDeleteSessions?: () => void;
    onClearAllSessions?: () => void;
    allUsersMode?: boolean;
    onToggleAllUsersMode?: () => void;
    showAllUsersEntry?: boolean;
}) {
    const {t} = useTranslation();
    const [searchText, setSearchText] = useState('');
    // 拖动排序状态：拖动源下标 / 当前悬停的目标下标
    const [drag_index, set_drag_index] = useState<number | null>(null);
    const [over_index, set_over_index] = useState<number | null>(null);

    // 「所有用户会话」模式下跨用户排序无意义，禁用拖动排序
    const can_reorder = !!onReorderSessions && !allUsersMode;

    const filteredSessions = searchText.trim()
        ? sessions.filter(s => (s.title || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.summary || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.long_term_memory || '').toLowerCase().includes(searchText.toLowerCase())
            // 「所有用户会话」模式下支持按属主名搜索
            || (allUsersMode && (s.owner_name || '').toLowerCase().includes(searchText.toLowerCase())))
        : sessions;

    // 拖动结束：回调被拖项与落点项的具体 id，由上层按 id 重排（避免过滤时下标错位）
    const handle_drop = (to: number) => {
        const from = drag_index;
        set_drag_index(null);
        set_over_index(null);
        if (from === null || from === to || !onReorderSessions) return;
        const from_id = filteredSessions[from]?.id;
        const to_id = filteredSessions[to]?.id;
        if (!from_id || !to_id) return;
        onReorderSessions(from_id, to_id);
    };

    return (
        <aside className="chat-session-list">
            <div className="chat-session-search">
                <input
                    type="text"
                    className="chat-session-search-input"
                    placeholder={t('搜索会话')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>
            <div className="chat-session-items-wrap">
                {filteredSessions.map((session, index) => (
                    <div key={session.id}>
                        <button
                            className={`chat-session-item ${activeSessionId === session.id ? "active" : ""} ${batchMode ? 'batch-mode' : ''} ${session.running ? 'is-running' : ''} ${drag_index === index ? 'row-dragging' : ''} ${over_index === index && drag_index !== null && drag_index !== index ? 'row-drop-target' : ''}`}
                            // ===== 拖动排序：仅开启排序回调且非「所有用户会话」模式时生效 =====
                            draggable={can_reorder}
                            onDragStart={() => set_drag_index(index)}
                            onDragOver={(e) => {
                                if (drag_index === null) return;
                                e.preventDefault();
                                if (over_index !== index) set_over_index(index);
                            }}
                            onDragEnd={() => { set_drag_index(null); set_over_index(null); }}
                            onDrop={(e) => { e.preventDefault(); handle_drop(index); }}
                            onClick={() => {
                                if (batchMode && onToggleSessionSelect) {
                                    onToggleSessionSelect(session.id);
                                } else {
                                    onSelectSession(session.id);
                                }
                            }}
                            title={session.summary || session.long_term_memory || session.title}
                        >
                            {batchMode && (
                                <input
                                    type="checkbox"
                                    className="chat-session-checkbox"
                                    checked={selectedSessionIds?.has(session.id) ?? false}
                                    onChange={() => onToggleSessionSelect?.(session.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                            <span>{toSessionTitle(session.title)}</span>
                            {/* 所有用户会话模式：显示会话属主 */}
                            {allUsersMode && session.owner_name && (
                                <em className="chat-session-owner" title={session.owner_name}>{session.owner_name}</em>
                            )}
                            {/* 会话正在执行中：显示旋转 loading 动画 */}
                            {session.running && <span className="chat-session-running" title={t('正在执行中')} />}
                            <small>{session.message_count}</small>
                            {session.source !== "web" && <em className="chat-session-source">{session.source}</em>}
                            {!batchMode && (
                                <MenuSelect
                                    list={[
                                        {
                                            name: t('重命名'),
                                            click: () => onRenameSession(session.id, session.title)
                                        },
                                        // 移动到最上/最下：复用拖动排序回调，目标取（过滤后）列表的首尾项
                                        // 「所有用户会话」模式下跨用户排序无意义，隐藏这两项
                                        ...(allUsersMode ? [] : [
                                            {
                                                name: t('移动到最上'),
                                                click: () => {
                                                    const first = filteredSessions[0];
                                                    if (first && first.id !== session.id) onReorderSessions?.(session.id, first.id);
                                                }
                                            },
                                            {
                                                name: t('移动到最下'),
                                                click: () => {
                                                    const last = filteredSessions[filteredSessions.length - 1];
                                                    if (last && last.id !== session.id) onReorderSessions?.(session.id, last.id);
                                                }
                                            },
                                        ]),
                                        {
                                            name: session.cmd_auto_allow ? t('命令检测关闭') : t('命令检测开启'),
                                            click: () => onToggleCmdAuto?.(session.id, !session.cmd_auto_allow)
                                        },
                                        {
                                            name: t('字符消耗统计'),
                                            click: () => onShowUsageStats(session.id)
                                        },
                                        {
                                            name: t('设置'),
                                            click: () => onShowSessionSetting?.(session.id)
                                        },
                                        {
                                            name: t('删除'),
                                            click: () => onDeleteSession(session.id)
                                        }
                                    ]}>
                                    <Icon icon={'more_horiz'}/>
                                </MenuSelect>
                            )}
                        </button>
                    </div>
                ))}
            </div>
            {/* 底部操作栏：始终渲染，桌面端 collapsed 窄栏时通过 CSS 隐藏 */}
            <div className="chat-session-actions">
                <ActionButton
                    icon={batchMode ? "check_circle" : "checklist"}
                    title={batchMode ? t("取消批量选择") : t("批量选择")}
                    onClick={onToggleBatchMode}
                />
                {showAllUsersEntry && !batchMode && (
                    <ActionButton
                        icon={allUsersMode ? "person" : "groups"}
                        title={allUsersMode ? t("仅看我的会话") : t("查看所有用户会话")}
                        onClick={onToggleAllUsersMode}
                    />
                )}
                {batchMode && (selectedSessionIds?.size ?? 0) > 0 && (
                    <ActionButton
                        icon={"delete"}
                        title={t("删除选中会话")}
                        onClick={onBatchDeleteSessions}
                    />
                )}
                {!batchMode && onClearAllSessions && (
                    <ActionButton
                        icon={"delete_sweep"}
                        title={t("删除全部会话")}
                        onClick={onClearAllSessions}
                    />
                )}
            </div>
        </aside>
    );
}
