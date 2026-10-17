import React, {ReactNode, useEffect, useRef} from "react";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

export interface OfficeEditorShellProps {
    /** 顶栏标题：文件名 */
    name?: string;
    /** 已修改标记 */
    dirty?: boolean;
    /** 是否正在加载 */
    loading?: boolean;
    /** 错误信息 */
    error?: string;
    /** 保存中 */
    saving?: boolean;
    /** 保存动作，返回是否成功 */
    on_save?: () => Promise<boolean>;
    /** 关闭动作 */
    on_close?: () => void;
    /** 内容区 */
    children?: ReactNode;
    /** 顶栏右侧额外操作 */
    extra?: ReactNode;
}

/**
 * Office 三种格式共用的编辑器外壳：全屏覆盖 + 顶栏（文件名/保存/关闭）+ 内容区。
 * Ctrl+S 保存，Esc 关闭（有改动时二次确认）。
 */
export default function OfficeEditorShell(props: OfficeEditorShellProps) {
    const {name, dirty, loading, error, saving, on_save, on_close, children, extra} = props;
    const confirm = using_confirm();
    // 用 ref 保持闭包最新，避免快捷键 effect 频繁重建
    const close_ref = useRef(on_close);
    const save_ref = useRef(on_save);
    const dirty_ref = useRef(dirty);
    close_ref.current = on_close;
    save_ref.current = on_save;
    dirty_ref.current = dirty;

    const handle_close = () => {
        if (dirty_ref.current) {
            confirm({title: "关闭", sub_title: "有未保存的修改，确定关闭吗？", confirm_fun: () => close_ref.current?.()});
        } else {
            close_ref.current?.();
        }
    };

    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                e.stopPropagation();
                save_ref.current?.();
            } else if (e.key === "Escape") {
                handle_close();
            }
        };
        // 捕获阶段：先于编辑器内部的快捷键
        document.addEventListener("keydown", on_key, true);
        return () => document.removeEventListener("keydown", on_key, true);
    }, []);

    return (
        <div className="office-editor">
            <div className="office-editor__topbar">
                <div className="office-editor__name">
                    {name}
                    {dirty && <span className="office-editor__dirty" title="有未保存的修改"/>}
                </div>
                <div className="office-editor__ops">
                    {extra}
                    {saving && <span className="office-editor__saving">保存中…</span>}
                    {on_save && <ActionButton icon={"save"} title="保存 (Ctrl+S)" onClick={() => on_save()}/>}
                    <ActionButton icon={"close"} title="关闭 (Esc)" onClick={handle_close}/>
                </div>
            </div>
            <div className="office-editor__body">
                {loading && <div className="office-editor__tip">加载中…</div>}
                {!loading && error && <div className="office-editor__tip office-editor__tip--error">{error}</div>}
                {!loading && !error && children}
            </div>
        </div>
    );
}
