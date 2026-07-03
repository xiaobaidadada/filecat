import React, {useRef} from 'react';
import {useTranslation} from "react-i18next";
import {Icon, ActionButton, ButtonLittle} from "../../../../meta/component/Button";
import ModelParamsButton from "./ModelParamsDialog";

/**
 * 待发送附件条（文件标签展示）
 */
export function AttachmentStrip({
                                    pendingAttachments,
                                    onRemove
                                }: {
    pendingAttachments: File[];
    onRemove: (index: number) => void;
}) {
    if (pendingAttachments.length === 0) return null;
    return (
        <div className="chat-attachment-strip">
            {pendingAttachments.map((file, index) => (
                <div key={`${file.name}_${index}`} className="chat-attachment-chip">
                    <Icon icon={'attach_file'}/>
                    <span title={file.name}>{file.name}</span>
                    <button type="button" onClick={() => onRemove(index)}>
                        <Icon icon={'close'}/>
                    </button>
                </div>
            ))}
        </div>
    );
}

/**
 * 聊天输入区域
 */
export default function ChatInput({
                                      inputValue,
                                      onInputChange,
                                      onKeyDown,
                                      onPaste,
                                      onSend,
                                      sending,
                                      pendingAttachments,
                                      onRemoveAttachment,
                                      onOpenFilePicker,
                                      onAddFiles,
                                      onDrop,
                                      onDragOver,
                                      fileInputRef,
                                      requestType,
                                  }: {
    inputValue: string;
    onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onSend: () => void;
    sending: boolean;
    pendingAttachments: File[];
    onRemoveAttachment: (index: number) => void;
    onOpenFilePicker: () => void;
    onAddFiles: (files: FileList | File[]) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    requestType: string;
}) {
    const {t} = useTranslation();

    return (
        <div className="chat-input-area" onDrop={onDrop} onDragOver={onDragOver}>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{display: "none"}}
                onChange={(e) => {
                    if (e.target.files?.length) {
                        onAddFiles(e.target.files);
                        e.currentTarget.value = "";
                    }
                }}
            />
            <div className="chat-input-shell">
                <AttachmentStrip
                    pendingAttachments={pendingAttachments}
                    onRemove={onRemoveAttachment}
                />
                <textarea
                    value={inputValue}
                    onChange={onInputChange}
                    onPaste={onPaste}
                    onKeyDown={onKeyDown}
                    placeholder={t("输入消息")}
                    className="chat-input"
                />
            </div>
            <ActionButton title={t("添加文件")} icon={"attach_file"} onClick={onOpenFilePicker}/>
            <ModelParamsButton requestType={requestType} />
            {/* 发送按钮：无论是否在 AI 执行中都可以发送（消息会排队） */}
            <ButtonLittle text={sending ? t("排队发送") : t("发送")} clickFun={onSend}/>
            {/* AI 执行中显示小型指示器 */}
            {sending && (
                <div className="ai-thinking-mini" title="AI 正在回复中...">
                    <div className="ai-thinking-dots">
                        <div className="ai-thinking-dot"/>
                        <div className="ai-thinking-dot"/>
                        <div className="ai-thinking-dot"/>
                    </div>
                </div>
            )}
        </div>
    );
}
