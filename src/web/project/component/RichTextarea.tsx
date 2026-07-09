import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';

export interface RichTextareaHandle {
    /** 获取纯文本值 */
    getValue(): string;
    /** 设置纯文本 */
    setValue(val: string): void;
    /** 清空 */
    clear(): void;
    /** 聚焦 */
    focus(): void;
}

interface Props {
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    onEnter?: () => void;
    onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
    /** 输入变化回调 */
    onChange?: (value: string) => void;
}

/**
 * 基于 div[contenteditable] 的输入组件，模拟 textarea 行为。
 * 支持自动增高，无受控 value，取值靠 ref.getValue()。
 */
const RichTextarea = forwardRef<RichTextareaHandle, Props>(function RichTextarea(
    { placeholder = '', disabled = false, className, style, onEnter, onPaste, onChange },
    ref,
) {
    const divRef = useRef<HTMLDivElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    // 获取纯文本（去掉 innerHTML 标签）
    const getText = useCallback(() => {
        const el = divRef.current;
        if (!el) return '';
        return (el.textContent ?? '').replace(/\u00A0/g, ' ').trimEnd();
    }, []);

    useImperativeHandle(ref, () => ({
        getValue: () => getText(),
        setValue: (val: string) => {
            const el = divRef.current;
            if (!el) return;
            el.textContent = val;
            setIsEmpty(!val);
            // 光标移到末尾
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        },
        clear: () => {
            const el = divRef.current;
            if (!el) return;
            el.textContent = '';
            setIsEmpty(true);
        },
        focus: () => divRef.current?.focus(),
    }));

    // 同步 isEmpty 状态
    useEffect(() => {
        const el = divRef.current;
        if (!el) return;
        const handler = () => setIsEmpty(!el.textContent);
        el.addEventListener('input', handler);
        return () => el.removeEventListener('input', handler);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter 发送，Shift+Enter 换行
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onEnter?.();
        }
    };

    return (
        <div
            ref={divRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            className={'rich-textarea' + (className ? ' ' + className : '')}
            style={style}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            onInput={() => onChange?.(getText())}
            data-placeholder={isEmpty ? placeholder : undefined}
        />
    );
});

export default RichTextarea;
