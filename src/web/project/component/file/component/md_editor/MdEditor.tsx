import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
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
import MdOutline, {OutlineItem} from "./MdOutline";
import * as lodash from "lodash";

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
    // 左侧大纲数据与当前高亮项；-1 表示光标不在任何标题上
    const [headings, set_headings] = useState<OutlineItem[]>([]);
    const [active_pos, set_active_pos] = useState(-1);
    // 大纲面板宽度（em），可通过拖动分隔条调整，与 studio 编辑器的交互一致
    const [nav_width, set_nav_width] = useState(15);
    const [dragging, set_dragging] = useState(false);
    const nav_ref = useRef<HTMLDivElement>(null);
    const divider_ref = useRef<HTMLDivElement>(null);

    // 从编辑器重新读取大纲。文档每次变更都会调用，
    // 因此标题的新增/删除/改名都能实时反映到面板上。
    // 结果同时写入 ref 缓存：selectionchange 触发非常频繁，
    // 高亮计算若每次都遍历整篇文档会造成明显卡顿。
    const headings_cache = useRef<OutlineItem[]>([]);
    const refresh_headings = useCallback(() => {
        const handle = handle_ref.current;
        if (!handle) {
            return;
        }
        const list = handle.get_headings();
        headings_cache.current = list;
        set_headings(list);
    }, []);

    // 计算光标当前所在的标题：取文档位置在光标之前、且最近的那个标题。
    // 直接读缓存，不做文档遍历（见上面 refresh_headings 的说明）。
    const update_active = useCallback(() => {
        const view = handle_ref.current?.get_view();
        if (!view) {
            return;
        }
        const cursor = view.state.selection.from;
        let current = -1;
        for (const item of headings_cache.current) {
            if (item.pos <= cursor) {
                current = item.pos;
            } else {
                break;
            }
        }
        set_active_pos(current);
    }, []);

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

    // 文档或选区变化时同步大纲：tick 由 MdWysiwygEditor 的 dispatchTransaction 驱动
    useEffect(() => {
        refresh_headings();
        update_active();
    }, [tick, refresh_headings, update_active]);

    // 分隔条拖动：按根字号换算成 em，保证在不同缩放/字号下拖动距离与视觉一致
    const handle_drag = useCallback(lodash.throttle((event: PointerEvent) => {
        if (!nav_ref.current || !divider_ref.current) {
            return;
        }
        const size = parseFloat(getComputedStyle(nav_ref.current).fontSize);
        const user_pos = event.clientX / size;
        // 留出 Header 左侧按钮空间与右侧分隔条宽度，避免拖到极端把正文挤没
        const left = window.innerWidth / size - 4;
        const right = 2.25 + divider_ref.current.offsetWidth / size;
        if (user_pos <= left && user_pos >= right) {
            set_nav_width(parseFloat(user_pos.toFixed(2)));
        }
    }, 32), []);

    const handle_pointer_down = () => {
        set_dragging(true);
        nav_ref.current?.addEventListener("pointermove", handle_drag);
    };
    const handle_pointer_up = () => {
        set_dragging(false);
        nav_ref.current?.removeEventListener("pointermove", handle_drag);
    };

    // 点击大纲条目：跳转到对应标题
    const goto_heading = (item: OutlineItem) => {
        handle_ref.current?.scroll_to_pos(item.pos);
        set_active_pos(item.pos);
    };
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
            <div className={"md-editor-context"} ref={nav_ref}>
                {loading && <div className="common-box common-box-center">{t("加载中")}...</div>}
                {!loading && init_value !== null && (
                    <React.Fragment>
                        {/* 左侧大纲：标题树 + 当前标题高亮，点击跳转；宽度可拖动 */}
                        <div className={"md-outline-panel"} style={{width: `${nav_width}em`}}>
                            <MdOutline items={headings} active_pos={active_pos} on_click={goto_heading}/>
                        </div>
                        <div className={"md-editor-divider"} ref={divider_ref}
                             onPointerDown={handle_pointer_down}
                             onPointerUp={handle_pointer_up}/>
                        {/* 拖动时铺一层透明遮罩：避免指针进入编辑器后被 ProseMirror 抢走事件 */}
                        {dragging && <div className={"md-editor-drag-overlay"} onPointerUp={handle_pointer_up}/>}
                        <div className={"md-editor-scroll"}>
                            <div className={"md-editor-sheet"}>
                                {/* 工具栏只在选中文字时出现（跟随选区浮动），平时不占屏幕也不挡正文。
                                    块级操作（插入表格等）走右键菜单。详见 MdToolbar 与 md_editor.css 的说明。 */}
                                <MdToolbar get_view={() => handle_ref.current?.get_view() ?? null}
                                           refresh_key={tick}/>
                                <MdWysiwygEditor
                                    key={editor_key}
                                    value={init_value}
                                    ref={handle_ref}
                                    // 编辑器就绪时立即同步大纲：
                                    // 按 tick 刷新的 effect 在挂载时 ref 尚未赋值（handle 在子组件
                                    // 自己的 useEffect 里才写入），拿不到句柄会让大纲空白，
                                    // 必须等用户点一下编辑器触发 selectionchange 才显示。
                                    on_ready={(handle) => {
                                        const list = handle.get_headings();
                                        headings_cache.current = list;
                                        set_headings(list);
                                        set_active_pos(-1);
                                    }}
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
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
}
