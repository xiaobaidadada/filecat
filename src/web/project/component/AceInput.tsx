import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as ace from 'ace-builds';
import { useAtom } from 'jotai';
import { $stroe } from '../util/store';

/** AceInput 暴露的方法 */
export interface AceInputHandle {
    /** 获取当前内容 */
    getValue(): string;
    /** 设置内容 */
    setValue(val: string): void;
    /** 获取原始 ace editor 实例 */
    getEditor(): ace.Ace.Editor | null;
}

interface Props {
    /** 初始内容（只用于首次渲染，之后不追踪变化） */
    initialValue?: string;
    /** placeholder，默认空 */
    placeholder?: string;
    /** 是否禁用编辑 */
    readOnly?: boolean;
    /** 外层 className */
    className?: string;
    /** 外层 style */
    style?: React.CSSProperties;
    /** onChange 回调 */
    onChange?: (value: string) => void;
    /** onBlur 回调 */
    onBlur?: (value: string) => void;
    /** 按下 Enter 回调 */
    onEnter?: (value: string) => void;
}

/**
 * 基于 Ace 的单行输入框组件。
 * 样式模拟原生 input，无行号、无高亮行、无折行。
 * 只需要初始值，不追踪外部 value 变化（取值通过 ref.getValue()）。
 */
const AceInput = forwardRef<AceInputHandle, Props>(function AceInput(
    { initialValue = '', placeholder = '', readOnly = false, className, style, onChange, onBlur, onEnter },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<ace.Ace.Editor | null>(null);
    const [userInfo] = useAtom($stroe.user_base_info);
    const theme = userInfo.user_data.theme?.includes('dark') ? 'cloud_editor_dark' : 'cloud9_day';

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
        getValue: () => editorRef.current?.getValue() ?? '',
        setValue: (val: string) => {
            const ed = editorRef.current;
            if (ed) {
                ed.setValue(val, -1); // -1 = 光标移到末尾
            }
        },
        getEditor: () => editorRef.current,
    }));

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const editor = ace.edit(container, {
            value: initialValue,
            mode: 'ace/mode/plain_text',
            theme: `ace/theme/${theme}`,
            maxLines: 12, // 最多 12 行，超出滚动
            minLines: 1,
            showLineNumbers: false,
            showGutter: false,
            highlightActiveLine: false,
            showPrintMargin: false,
            fontSize: 13,
            readOnly,
            wrap: true, // 允许折行
            useWorker: false,
        } as any);

        // 手动设置 placeholder（ace 原生 placeholder 有时不生效）
        if (placeholder) {
            editor.setOption('placeholder', placeholder as any);
        }

        // 禁用 Enter 换行（保持单行），触发 onEnter
        editor.commands.addCommand({
            name: 'aceinput_enter',
            bindKey: { win: 'Enter', mac: 'Enter' },
            exec: () => {
                if (onEnter) {
                    onEnter(editor.getValue());
                }
            },
        });

        // 禁用 Tab（用缩进也没意义，单行）
        editor.commands.removeCommand('indent');
        editor.commands.addCommand({
            name: 'aceinput_tab',
            bindKey: { win: 'Tab', mac: 'Tab' },
            exec: () => {}, // noop
        });

        // change 事件
        editor.on('change', () => {
            if (onChange) {
                onChange(editor.getValue());
            }
        });

        // blur 事件
        editor.on('blur', () => {
            if (onBlur) {
                onBlur(editor.getValue());
            }
        });

        editorRef.current = editor;

        return () => {
            editor.destroy();
            editorRef.current = null;
        };
    }, []); // 只初始化一次

    return (
        <div
            ref={containerRef}
            className={'ace-input-container' + (className ? ' ' + className : '')}
            style={{
                width: '100%',
                borderRadius: 4,
                ...style,
            }}
        />
    );
});

export default AceInput;
