import React, {useState} from 'react';
import {useTranslation} from "react-i18next";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
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
                                        onRenameSession,
                                        onDeleteSession,
                                        onShowUsageStats,
                                        batchMode,
                                        selectedSessionIds,
                                        onToggleSessionSelect,
                                        onToggleBatchMode,
                                        onBatchDeleteSessions,
                                        onClearAllSessions,
                                    }: {
    sessions: ai_agent_chat_session_meta[];
    activeSessionId: string;
    onSelectSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onDeleteSession: (id: string) => void;
    onShowUsageStats: (id: string) => void;
    batchMode?: boolean;
    selectedSessionIds?: Set<string>;
    onToggleSessionSelect?: (id: string) => void;
    onToggleBatchMode?: () => void;
    onBatchDeleteSessions?: () => void;
    onClearAllSessions?: () => void;
}) {
    const {t} = useTranslation();
    const [ai_session_collapsed, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);
    const [searchText, setSearchText] = useState('');

    const filteredSessions = searchText.trim()
        ? sessions.filter(s => (s.title || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.summary || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.long_term_memory || '').toLowerCase().includes(searchText.toLowerCase()))
        : sessions;

    return (
        <aside
            className={`chat-session-list ${!ai_session_collapsed ? "" : "active"} ${ai_session_collapsed ? "collapsed" : ""}`}>
            {!ai_session_collapsed && (
                <div className="chat-session-search">
                    <input
                        type="text"
                        className="chat-session-search-input"
                        placeholder={t('搜索会话')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
            )}
            <div className="chat-session-items-wrap">
                {filteredSessions.map(session => (
                    <div key={session.id}>
                        <button
                            className={`chat-session-item ${activeSessionId === session.id ? "active" : ""} ${batchMode ? 'batch-mode' : ''}`}
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
                            <small>{session.message_count}</small>
                            {session.source !== "web" && <em className="chat-session-source">{session.source}</em>}
                            {!batchMode && (
                                <MenuSelect
                                    list={[
                                        {
                                            name: t('重命名'),
                                            click: () => onRenameSession(session.id, session.title)
                                        },
                                        {
                                            name: t('字符消耗统计'),
                                            click: () => onShowUsageStats(session.id)
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
            {/* 底部操作栏 */}
            {!ai_session_collapsed && (
                <div className="chat-session-actions">
                    <ActionButton
                        icon={batchMode ? "check_circle" : "checklist"}
                        title={batchMode ? t("取消批量选择") : t("批量选择")}
                        onClick={onToggleBatchMode}
                    />
                    {batchMode && (selectedSessionIds?.size ?? 0) > 0 && (
                        <ActionButton
                            icon={"delete"}
                            title={t("删除选中会话")}
                            onClick={onBatchDeleteSessions}
                        />
                    )}
                    {!batchMode && (
                        <ActionButton
                            icon={"delete_sweep"}
                            title={t("删除全部会话")}
                            onClick={onClearAllSessions}
                        />
                    )}
                </div>
            )}
        </aside>
    );
}
