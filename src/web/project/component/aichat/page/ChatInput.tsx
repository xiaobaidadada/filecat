import React, {useRef, useImperativeHandle, forwardRef} from 'react';
import {useTranslation} from "react-i18next";
import {Icon, ActionButton, ButtonLittle} from "../../../../meta/component/Button";
import ModelParamsButton from "./ModelParamsDialog";
import RichTextarea, {RichTextareaHandle} from "../../RichTextarea";

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

export interface ChatInputHandle {
    getValue(): string;
    setValue(val: string): void;
    clear(): void;
}

/**
 * 聊天输入区域。使用 AceInput 替代 textarea，
 * 避免受控模式下"有初始值就必须修改"的问题。
 */
const ChatInput = forwardRef<ChatInputHandle, {
    onSend: () => void;
    sending: boolean;
    onAbort: () => void;
    pendingAttachments: File[];
    onRemoveAttachment: (index: number) => void;
    onOpenFilePicker: () => void;
    onAddFiles: (files: FileList | File[]) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    requestType: string;
}>(({ onSend, sending, onAbort, pendingAttachments, onRemoveAttachment, onOpenFilePicker, onAddFiles, onDrop, onDragOver, fileInputRef, requestType }, ref) => {
    const {t} = useTranslation();
    const rtRef = useRef<RichTextareaHandle>(null);

    useImperativeHandle(ref, () => ({
        getValue: () => rtRef.current?.getValue() ?? '',
        setValue: (val: string) => rtRef.current?.setValue(val),
        clear: () => rtRef.current?.clear(),
    }));

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
                <RichTextarea
                    ref={rtRef}
                    placeholder={t("输入消息")}
                    onEnter={() => onSend()}
                    onPaste={(e) => {
                        const files = e.clipboardData?.files;
                        if (files && files.length > 0) {
                            e.preventDefault();
                            onAddFiles(files);
                        }
                    }}
                    className="chat-input"
                />
            </div>
            <ActionButton title={t("添加文件")} icon={"attach_file"} onClick={onOpenFilePicker}/>
            <ModelParamsButton requestType={requestType} />
            {/* 发送中 → 暂停按钮；空闲 → 发送按钮 */}
            {sending ? (
                <ButtonLittle color={"var( --icon-red)"} text={t("暂停")} clickFun={onAbort} />
            ) : (
                <ButtonLittle  text={t("发送")} clickFun={onSend} />
            )}
        </div>
    );
});

export default ChatInput;
