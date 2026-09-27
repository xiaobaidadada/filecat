import React, {useEffect, useMemo, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {RCode} from "../../../../../../common/Result.pojo";
import {fileHttp} from "../../../../util/config";
import {Http} from "../../../../util/http";
import {useTranslation} from "react-i18next";
import MdWysiwygEditor, {MdWysiwygHandle} from "./MdWysiwygEditor";
import MdToolbar from "./MdToolbar";
import MdContextMenu from "./MdContextMenu";

// 所见即所得 Markdown 编辑器容器。
//
// 职责：加载文件内容 → 渲染 ProseMirror 编辑器 → 保存回服务端。
// 编辑器内核是 ProseMirror（自写 schema + 官方表格模块），因此表格在正文里
// 就是真正的 <table>，可以直接点击单元格编辑、拖动列宽 —— 与 Typora 的观感一致。

export default function MdEditor() {
    const {t} = useTranslation();
    const [md_editor, set_md_editor] = useAtom($stroe.md_editor);
    // 编辑器初始内容：加载完成后才挂载编辑器，避免用空内容初始化
    const [init_value, set_init_value] = useState<string | null>(null);
    const [loading, set_loading] = useState(false);
    const [dirty, set_dirty] = useState(false);
    // 选区/光标变化的节奏计数：驱动工具栏刷新（位置与按钮选中态）
    const [tick, set_tick] = useState(0);
    const handle_ref = useRef<MdWysiwygHandle | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!md_editor?.url) {
            set_init_value(null);
            return;
        }
        set_loading(true);
        Http.get(md_editor.url).then(context => {
            if (cancelled) {
                return;
            }
            set_init_value(context ?? "");
        }).catch(() => {
            if (cancelled) {
                return;
            }
            NotyFail(t("打开失败"));
            set_init_value("");
        }).finally(() => {
            if (!cancelled) {
                set_loading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [md_editor?.url]);

    // 编辑区内的鼠标/键盘操作会改变选区，用捕获阶段监听保证在任何容器里都能收到
    useEffect(() => {
        const bump = () => set_tick(n => n + 1);
        document.addEventListener("selectionchange", bump);
        return () => document.removeEventListener("selectionchange", bump);
    }, []);
    const save = async () => {
        if (!md_editor?.name || !md_editor?.path || !handle_ref.current) {
            return;
        }
        const context = handle_ref.current.get_markdown();
        // path 形如 "sub/a.md"：目录部分编码，文件名原样（与项目其他编辑器的保存规则一致）
        const dir = md_editor.path.slice(0, md_editor.path.length - md_editor.name.length);
        const save_path = `${encodeURIComponent(dir)}${md_editor.name}`;
        const rsq = await fileHttp.post(`save/${save_path}`, {context});
        if (rsq.code === RCode.Success) {
            set_dirty(false);
            NotySuccess(t("保存成功"));
        } else {
            NotyFail(t("保存失败"));
        }
    };
    const save_ref = useRef(save);
    save_ref.current = save;

    const close = () => {
        set_md_editor({});
        set_dirty(false);
        set_init_value(null);
        handle_ref.current = null;
        md_editor?.close?.();
    };

    // 切换文件时重建编辑器实例
    const editor_key = useMemo(() => md_editor?.url ?? "md_editor", [md_editor?.url]);

    if (!md_editor?.name) {
        return null;
    }

    return (
        <div id={"md-editor-container"}>
            <Header ignore_tags={true}
                    left_children={[
                        <ActionButton key={1} title={t("关闭")} icon={"close"} onClick={close}/>,
                        <ActionButton key={2} title={t("保存")} icon={"save"} onClick={save} selected={dirty}/>,
                        <title key={3}>{md_editor.name}</title>,
                    ]}>
            </Header>
            <div className={"md-editor-context"}>
                {loading && <div className="common-box common-box-center">{t("加载中")}...</div>}
                {!loading && init_value !== null && (
                    <div className={"md-editor-sheet"}>
                        {/* 工具栏只在选中文字时出现（跟随选区浮动），平时不占屏幕也不挡正文。
                            块级操作（插入表格等）走右键菜单。详见 MdToolbar 与 md_editor.css 的说明。 */}
                        <MdToolbar get_view={() => handle_ref.current?.get_view() ?? null}
                                   refresh_key={tick}/>
                        <MdWysiwygEditor
                            key={editor_key}
                            value={init_value}
                            ref={handle_ref}
                            on_change={() => {
                                if (!dirty) {
                                    set_dirty(true);
                                }
                            }}
                            on_save={() => save_ref.current()}
                            on_selection_change={() => set_tick(n => n + 1)}
                        />
                        <MdContextMenu get_view={() => handle_ref.current?.get_view() ?? null}
                                       on_insert_table={() => {
                                           handle_ref.current?.insert_table(3, 3);
                                           set_dirty(true);
                                       }}/>
                    </div>
                )}
            </div>
        </div>
    );
}
