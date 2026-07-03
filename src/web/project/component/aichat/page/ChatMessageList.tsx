/**
 * ChatMessageList — 聊天消息列表组件
 * 负责渲染所有消息气泡，包括：
 * - 加载中动画气泡
 * - 普通消息气泡（委托给 renderMessageByType）
 * - 批量选择模式的 checkbox
 */
import React from "react";
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
    return (
        <div className="chat-messages" ref={chatContainerRef} data-sending={sending ? "true" : "false"}>
            {messages.map(msg => (
                <div
                    key={msg.id}
                    className={`chat-message ${msg.sender} ${batchMode ? 'batch-mode' : ''} ${msg.is_loading ? 'is-loading' : ''}`}
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
                        /* 正常消息气泡 */
                        <>
                            {renderMessageByType(msg)}
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
            ))}
            <div ref={messagesEndRef} />
        </div>
    );
};

export default ChatMessageList;
