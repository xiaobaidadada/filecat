import React from 'react';
import {useTranslation} from "react-i18next";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {MenuSelect} from "../../prompts/Prompt";
import {Icon} from "../../../../meta/component/Button";
import {ai_agent_chat_session_meta} from "../../../../../common/req/filecat.ai.pojo";

function toSessionTitle(title: string) {
    return title || "新会话";
}

/**
 * AI 会话列表面板
 */
export default function SessionList({
                                        sessions,
                                        activeSessionId,
                                        onSelectSession,
                                        onRenameSession,
                                        onDeleteSession,
                                        onShowUsageStats
                                    }: {
    sessions: ai_agent_chat_session_meta[];
    activeSessionId: string;
    onSelectSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onDeleteSession: (id: string) => void;
    onShowUsageStats: (id: string) => void;
}) {
    const {t} = useTranslation();
    const [ai_session_collapsed, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);

    return (
        <aside
            className={`chat-session-list ${ai_session_collapsed ? "active" : ""} ${ai_session_collapsed ? "collapsed" : ""}`}>
            {sessions.map(session => (
                <div key={session.id}>
                    <button
                        className={`chat-session-item ${activeSessionId === session.id ? "active" : ""}`}
                        onClick={() => onSelectSession(session.id)}
                        title={session.summary || session.long_term_memory || session.title}
                    >
                        <span>{toSessionTitle(session.title)}</span>
                        <small>{session.message_count}</small>
                        {session.source === "cli" && <em className="chat-session-source">CLI</em>}
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
                    </button>
                </div>
            ))}
        </aside>
    );
}
