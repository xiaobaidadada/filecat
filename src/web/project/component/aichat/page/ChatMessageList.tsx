/**
 * ChatMessageList — 聊天消息列表组件
 * 负责渲染所有消息气泡，包括：
 * - 加载中动画气泡
 * - 普通消息气泡（委托给 renderMessageByType）
 * - 批量选择模式的 checkbox
 */
import React, { useMemo, useState } from "react";
import { Message } from "./chatTypes";
import { renderMessageByType } from "./RequestTypeRenderers";

interface ChatMessageListProps {
    messages: Message[];
    batchMode: boolean;
    selectedMsgIds: Set<number>;
    sending: boolean;
    chatContainerRef: React.RefObject<HTMLDivElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    onToggleMsgSelect: (id: number) => void;
    onDelete: (id: number) => void;
    onCopy: (text: string) => void;
    onToggleBatchMode: () => void;
    t: (key: string) => string;
}

/**
 * 提取消息摘要：取文本第一行并截断，用于折叠状态的一行展示
 */
function messageSummary(msg: Message): string {
    const firstLine = (msg.text || '').split('\n').map(l => l.trim()).find(Boolean) || '';
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({
    messages,
    batchMode,
    selectedMsgIds,
    sending,
    chatContainerRef,
    messagesEndRef,
    onToggleMsgSelect,
    onDelete,
    onCopy,
    onToggleBatchMode,
    t,
}) => {
    // 记录当前处于折叠状态的消息 id 集合
    const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

    // 可折叠的消息（排除加载中的气泡）
    const collapsibleIds = useMemo(
        () => messages.filter(m => !m.is_loading).map(m => m.id),
        [messages]
    );

    // 切换单条消息的折叠/展开
    const toggleCollapse = (id: number) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // 全部折叠；若已全部折叠则全部展开
    const collapseAll = () => {
        setCollapsedIds(prev => {
            if (prev.size > 0 && collapsibleIds.every(id => prev.has(id))) {
                return new Set();
            }
            return new Set(collapsibleIds);
        });
    };

    return (
        <div className="chat-messages" ref={chatContainerRef} data-sending={sending ? "true" : "false"}>
            {messages.map(msg => {
                const collapsed = collapsedIds.has(msg.id);
                return (
                    <div
                        key={msg.id}
                        className={`chat-message ${msg.sender} ${batchMode ? 'batch-mode' : ''} ${msg.is_loading ? 'is-loading' : ''} ${collapsed ? 'collapsed' : ''}`}
                    >
                        {/* 批量选择模式的 checkbox */}
                        {batchMode && (
                            <input
                                type="checkbox"
                                className="chat-message-checkbox"
                                checked={selectedMsgIds.has(msg.id)}
                                onChange={() => onToggleMsgSelect(msg.id)}
                            />
                        )}

                        {/* 加载中的气泡：显示三点跳动动画 */}
                        {msg.is_loading ? (
                            <div className="ai-loading-bubble">
                                <div className="ai-loading-dots">
                                    <span className="ai-loading-dot" />
                                    <span className="ai-loading-dot" />
                                    <span className="ai-loading-dot" />
                                </div>
                                <span className="ai-loading-text">{msg.text}</span>
                            </div>
                        ) : (
                            <>
                                {/* 折叠状态：只显示一行摘要；展开状态：显示完整正文 */}
                                {collapsed ? (
                                    <div className="chat-message-summary" title={msg.text} onClick={() => toggleCollapse(msg.id)}>
                                        <span className="chat-message-summary-icon">▸</span>
                                        <span className="chat-message-summary-text">{messageSummary(msg) || t("（无内容）")}</span>
                                    </div>
                                ) : (
                                    <div className="chat-message-body">
                                        {renderMessageByType(msg)}
                                    </div>
                                )}

                                {/* 消息底部操作条：鼠标悬浮才显示 */}
                                <div className="message-collapse-bar">
                                    <button onClick={() => toggleCollapse(msg.id)}>
                                        {t(collapsed ? "展开" : "折叠")}
                                    </button>
                                    <button onClick={collapseAll}>{t("全部折叠")}</button>
                                </div>

                                {/* 右上角操作按钮 */}
                                <div className="message-actions">
                                    {batchMode ? (
                                        <button onClick={() => onToggleMsgSelect(msg.id)}>
                                            {selectedMsgIds.has(msg.id) ? t("取消选择") : t("选择")}
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => onDelete(msg.id)}>{t("删除")}</button>
                                            <button onClick={() => onCopy(msg.text)}>{t("复制")}</button>
                                            <button onClick={onToggleBatchMode}>{t("多选")}</button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
            <div ref={messagesEndRef} />
        </div>
    );
};

export default ChatMessageList;
