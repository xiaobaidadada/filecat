import React, {useRef, useImperativeHandle, forwardRef} from 'react';
import {useTranslation} from "react-i18next";
import {Icon, ActionButton, ButtonLittle} from "../../../../meta/component/Button";
import RichTextarea, {RichTextareaHandle} from "../../RichTextarea";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {debounce} from "../../../../../common/fun.util";
import {use_drag_resize} from "../../../util/useDragResize";

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
    /** 只读：查看全部会话时禁止发送（输入框置灰、按钮禁用） */
    readonly?: boolean;
}>(({ onSend, sending, onAbort, pendingAttachments, onRemoveAttachment, onOpenFilePicker, onAddFiles, onDrop, onDragOver, fileInputRef, readonly = false }, ref) => {
    const {t} = useTranslation();
    const rtRef = useRef<RichTextareaHandle>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const [inputHeight, setInputHeight] = useAtom($stroe.ai_chat_input_height);

    useImperativeHandle(ref, () => ({
        getValue: () => rtRef.current?.getValue() ?? '',
        setValue: (val: string) => rtRef.current?.setValue(val),
        clear: () => rtRef.current?.clear(),
    }));

    // 输入框最小高度（em，约两行）；无最大值
    const MIN_INPUT_HEIGHT = 2;

    // 取当前 em 对应的像素值（与 heightStyle 的 em 单位保持一致，自适应字号）
    const get_em_px = () => {
        const el = areaRef.current;
        if (!el) return 16;
        return parseFloat(getComputedStyle(el).fontSize) || 16;
    };

    // 通用拖拽调高（垂直方向，绑 window，保持原有行为）
    const {dragging: isDragging, on_pointer_down, on_pointer_up} = use_drag_resize({
        direction: "vertical",
        // 起始高度直接取当前 em 数值（heightStyle 就是按它渲染的，二者一致）
        get_start_size: () => inputHeight,
        // 鼠标位移（px）换算成 em：1em = 当前字号像素
        px_to_unit: (delta_px) => delta_px / get_em_px(),
        min: MIN_INPUT_HEIGHT,
        on_change: (size) => setInputHeight(size),
    });

    // 高度以 em 固定（minHeight 与 maxHeight 相等，锁定高度）
    const heightStyle = { minHeight: `${inputHeight}em`, maxHeight: `${inputHeight}em` };

    return (
        <div
            ref={areaRef}
            className={`chat-input-area${readonly ? ' readonly' : ''}`}
            onDrop={readonly ? undefined : onDrop}
            onDragOver={readonly ? undefined : onDragOver}
        >
            {/* 顶部拖动条（只读时不显示） */}
            {!readonly && (
                <div
                    className={`chat-input-resize-handle${isDragging ? ' dragging' : ''}`}
                    onPointerDown={on_pointer_down}
                />
            )}
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
                    placeholder={readonly ? t("查看全部会话时不可发送消息") : t("输入消息")}
                    disabled={readonly}
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
            {!readonly && <ActionButton title={t("添加文件")} icon={"attach_file"} onClick={onOpenFilePicker}/>}
            {/* 发送中 → 暂停按钮；空闲 → 发送按钮；只读 → 禁用发送 */}
            {readonly ? (
                <button className="little-button button" disabled={true}>{t("发送")}</button>
            ) : sending ? (
                <ButtonLittle color={"var( --icon-red)"} text={t("暂停")} clickFun={onAbort} />
            ) : (
                <ButtonLittle  text={t("发送")} clickFun={onSend} />
            )}
            {/* 拖动时全屏遮罩，防止鼠标跑出元素丢失事件 */}
            {isDragging && <div className="chat-input-overlay" onPointerUp={on_pointer_up} />}
        </div>
    );
});

export default ChatInput;
