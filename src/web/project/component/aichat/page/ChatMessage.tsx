import React, {useState} from 'react';
import {useTranslation} from "react-i18next";
import Md from "../../file/component/markdown/Md";
import {Icon} from "../../../../meta/component/Button";
import {ai_agent_message_attachment_item, ai_agent_tool_call_item} from "../../../../../common/req/filecat.ai.pojo";

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
 * 工具调用列表渲染（折叠面板形式）
 */
function CallListRenderer({callList}: { callList?: ai_agent_tool_call_item[] }) {
    const [expanded, setExpanded] = useState(false);
    const {t} = useTranslation();
    if (!callList?.length) return null;
    const successCount = callList.filter(c => c.success).length;
    const failCount = callList.filter(c => !c.success).length;
    return (
        <div className="chat-message-call-list">
            <div className="call-list-header" onClick={() => setExpanded(!expanded)}>
                <Icon icon={expanded ? 'expand_less' : 'expand_more'}/>
                <span className="call-list-summary">
                    {t('工具调用')} ({callList.length})
                    {failCount > 0 && <span className="call-list-fail"> {t('失败')}: {failCount}</span>}
                </span>
            </div>
            {expanded && (
                <div className="call-list-body">
                    {callList.map((item, idx) => (
                        <div key={idx} className={`call-list-item ${item.success ? 'call-success' : 'call-fail'}`}>
                            <div className="call-list-item-header">
                                <Icon icon={item.success ? 'check_circle' : 'error'}/>
                                <span className="call-list-tool-name">{item.tool_display_name || item.tool_name}</span>
                                <span className="call-list-duration">{item.duration_ms}ms</span>
                            </div>
                            {item.tool_args && (
                                <details className="call-list-details">
                                    <summary>{t('参数')}</summary>
                                    <pre className="call-list-pre">{JSON.stringify(item.tool_args, null, 2)}</pre>
                                </details>
                            )}
                            {!item.success && item.error && (
                                <details className="call-list-details">
                                    <summary>{t('错误')}</summary>
                                    <pre className="call-list-pre call-list-error-text">{item.error}</pre>
                                </details>
                            )}
                            {item.success && item.tool_result && (
                                <details className="call-list-details">
                                    <summary>{t('结果')}</summary>
                                    <pre className="call-list-pre">{item.tool_result.length > 500 ? item.tool_result.slice(0, 500) + '...' : item.tool_result}</pre>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
            )}
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
    msg: { id: number; sender: 'user' | 'bot'; text: string; attachments?: ai_agent_message_attachment_item[]; call_list?: ai_agent_tool_call_item[] };
    onDelete: () => void;
    onCopy: () => void;
}) {
    return (
        <div className={`chat-message ${msg.sender}`}>
            <Md context={msg.text}/>
            <CallListRenderer callList={msg.call_list}/>
            <AttachmentList attachments={msg.attachments}/>
            <MessageActions
                onDelete={onDelete}
                onCopy={onCopy}
            />
        </div>
    );
}
