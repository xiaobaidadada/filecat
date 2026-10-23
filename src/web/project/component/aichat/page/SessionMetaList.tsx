import React from 'react';
import {useTranslation} from "react-i18next";

/** 副信息条目：text 为显示内容，className 用于区分语义配色 */
export interface SessionMetaItem {
    text: string;
    className?: string;
    title?: string;
}

interface SessionMetaListProps {
    items: SessionMetaItem[];
}

/**
 * 会话行副信息列表（消息数、系统提示词、来源、属主）
 * 统一容器负责行内间距，避免各处裸元素贴在一起
 */
export default function SessionMetaList({items}: SessionMetaListProps) {
    const visible = items.filter(it => !!it.text);
    if (visible.length === 0) return null;

    return (
        <div className="chat-session-meta">
            {visible.map((it, i) => (
                <small
                    key={i}
                    className={it.className}
                    title={it.title}
                >{it.text}</small>
            ))}
        </div>
    );
}
