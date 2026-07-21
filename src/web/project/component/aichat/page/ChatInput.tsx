import React, {useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback} from 'react';
import {useTranslation} from "react-i18next";
import {Icon, ActionButton, ButtonLittle} from "../../../../meta/component/Button";
import ModelParamsButton from "./ModelParamsDialog";
import RichTextarea, {RichTextareaHandle} from "../../RichTextarea";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {debounce} from "../../../../../common/fun.util";

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
 * 聊天输入区域，顶部有拖动条可调整高度
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
    const [isDragging, setIsDragging] = useState(false);
    const areaRef = useRef<HTMLDivElement>(null);
    const [inputHeight, setInputHeight] = useAtom($stroe.ai_chat_input_height);

    useImperativeHandle(ref, () => ({
        getValue: () => rtRef.current?.getValue() ?? '',
        setValue: (val: string) => rtRef.current?.setValue(val),
        clear: () => rtRef.current?.clear(),
    }));

    // 拖动处理：根据鼠标 Y 位置计算输入框高度
    const handleDrag = useCallback((event: PointerEvent) => {
        const el = areaRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const newHeightPx = rect.bottom - event.clientY;
        // 0.95em font-size * 1.5 line-height ≈ 每行像素
        const lineHeightPx = 14.25 * 1.5;
        let rows = Math.round(newHeightPx / lineHeightPx);
        rows = Math.max(2, Math.min(20, rows));
        setInputHeight(rows);
    }, [setInputHeight]);

    const handlePointerDown = useCallback(() => setIsDragging(true), []);
    const handlePointerUp = useCallback(() => setIsDragging(false), []);

    useEffect(() => {
        if (!isDragging) return;
        // const throttled = debounce(handleDrag, 10);
        const throttled = handleDrag
        window.addEventListener('pointermove', throttled);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', throttled);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, handleDrag, handlePointerUp]);

    const heightStyle = { minHeight: `${inputHeight}em`, maxHeight: `${inputHeight}em` };

    return (
        <div
            ref={areaRef}
            className="chat-input-area"
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            {/* 顶部拖动条 */}
            <div
                className={`chat-input-resize-handle${isDragging ? ' dragging' : ''}`}
                onPointerDown={handlePointerDown}
            />
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
            <div className="chat-input-shell" style={heightStyle}>
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
                    style={heightStyle}
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
            {/* 拖动时全屏遮罩，防止鼠标跑出元素丢失事件 */}
            {isDragging && <div className="chat-input-overlay" onPointerUp={handlePointerUp} />}
        </div>
    );
});

export default ChatInput;
