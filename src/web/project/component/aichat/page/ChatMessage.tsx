import React from 'react';
import {useTranslation} from "react-i18next";
import Md from "../../file/component/markdown/Md";
import {Icon} from "../../../../meta/component/Button";
import {ai_agent_message_attachment_item} from "../../../../../common/req/filecat.ai.pojo";

/**
 * 消息操作按钮（删除、复制）
 */
export function MessageActions({
                                   onDelete,
                                   onCopy
                               }: {
    onDelete: () => void;
    onCopy: () => void;
}) {
    const {t} = useTranslation();
    return (
        <div className="message-actions">
            <button onClick={onDelete}>{t("删除")}</button>
            <button onClick={onCopy}>{t("复制")}</button>
        </div>
    );
}

/**
 * 附件列表展示
 */
export function AttachmentList({attachments = []}: { attachments?: ai_agent_message_attachment_item[] }) {
    if (!attachments.length) {
        return null;
    }
    return (
        <div className="chat-message-attachments">
            {attachments.map((attachment, index) => (
                <div key={`${attachment.name}_${index}`} className="chat-message-attachment">
                    <Icon icon={'attach_file'}/>
                    <span>{attachment.name}</span>
                    <small>{attachment.size} B</small>
                </div>
            ))}
        </div>
    );
}

/**
 * 单条消息渲染
 */
export function ChatMessageItem({
                                    msg,
                                    onDelete,
                                    onCopy
                                }: {
    msg: { id: number; sender: 'user' | 'bot'; text: string; attachments?: ai_agent_message_attachment_item[] };
    onDelete: () => void;
    onCopy: () => void;
}) {
    return (
        <div className={`chat-message ${msg.sender}`}>
            <Md context={msg.text}/>
            <AttachmentList attachments={msg.attachments}/>
            <MessageActions
                onDelete={onDelete}
                onCopy={onCopy}
            />
        </div>
    );
}
