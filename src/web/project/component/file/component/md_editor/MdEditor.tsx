import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import {use_auth_check} from "../../../../util/store.util";
import {UserAuth} from "../../../../../../common/req/user.req";
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
import AceCodeEditor, {AceCodeEditorHandle} from "../../../../../meta/component/AceCodeEditor";
import {find_active_heading, parse_markdown_headings} from "./md_outline_parse";
import {
    apply_md_editor_setting,
    load_md_editor_setting,
    MD_EDITOR_SETTING_DEFAULT,
} from "./MdEditorSetting";
import * as lodash from "lodash";
import {useNavigate} from "react-router-dom";
import {routerConfig} from "../../../../../../common/RouterConfig";

// 所见即所得 Markdown 编辑器容器。
//
// 职责：加载文件内容 → 渲染 ProseMirror 编辑器 → 保存回服务端。
// 编辑器内核是 ProseMirror（自写 schema + 官方表格模块），因此表格在正文里
// 就是真正的 <table>，可以直接点击单元格编辑、拖动列宽 —— 与 Typora 的观感一致。

// 编辑模式：
//   wysiwyg —— 所见即所得（ProseMirror）
//   source  —— 源码模式（直接编辑 Markdown 原文，快捷键 Ctrl+/ 切换）
type MdEditMode = "wysiwyg" | "source";

export default function MdEditor() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    // 是否拥有「MD 编辑器设置」权限：没权限就不显示设置按钮，避免点进去是个无权访问的空页
    const {check_user_auth} = use_auth_check();
    const can_setting = check_user_auth(UserAuth.md_editor_setting);
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
    // 大纲面板是否显示。默认关闭，让正文占满整个宽度。
    // 存在 atom + localStorage 里（sync_atomWithStorage），属于用户偏好，刷新/切页面都保持。
    const [show_outline, set_show_outline] = useAtom($stroe.md_editor_show_outline);
    const toggle_outline = () => set_show_outline(prev => !prev);

    // 当前编辑模式。默认所见即所得。
    // 存在 atom + localStorage 里（sync_atomWithStorage），属于用户偏好，刷新/切页面都保持。
    const [mode, set_mode] = useAtom($stroe.md_editor_mode);
    // 源码模式下的 Markdown 文本。仅在 source 模式下有意义（wysiwyg 模式以编辑器文档为准）。
    // 说明：Ace 自己维护文档与撤销栈，这里保存的是「最近一次全文」，
    // 用于大纲解析、保存、以及切回所见即所得时取内容。
    const [source_text, set_source_text] = useState("");
    // 源码模式的 Ace 编辑器句柄：读写内容、光标偏移（驱动大纲高亮）
    const source_ref = useRef<AceCodeEditorHandle | null>(null);

    // 在「所见即所得」与「源码」之间切换。
    // 切换的关键是先把当前模式的改动取出来，再以它为初始内容进入另一种模式，保证不丢编辑。
    const toggle_mode = useCallback(() => {
        // 注意：不要在 set_mode 的 updater 里做其他 setState —— updater 应当是纯函数，
        // 在它里面改别的 state 会被 React 的严格模式重复执行。先算出下一个值，再依次应用。
        const next: MdEditMode = mode === "wysiwyg" ? "source" : "wysiwyg";
        if (next === "source") {
            // 进入源码模式：把编辑器里的文档序列化成 Markdown 写进 Ace。
            // Ace 是「初始值 + 命令式替换」的用法（见 AceCodeEditor 的说明），
            // 所以这里必须显式 setValue，不能靠 props.value 更新。
            const md = handle_ref.current?.get_markdown();
            if (md !== undefined) {
                set_source_text(md);
                source_ref.current?.setValue(md);
            }
        } else {
            // 回到所见即所得：用 Ace 里的文本重建编辑器
            // 通过换 key 强制重挂载编辑器，避免在原实例上替换内容导致撤销栈与光标状态错乱
            set_init_value(source_text);
            set_editor_revision(n => n + 1);
        }
        set_mode(next);
    }, [mode, source_text]);
    // 编辑器实例版本号：模式切换/外部替换内容时自增，用于重建 ProseMirror 实例
    const [editor_revision, set_editor_revision] = useState(0);

    // md 编辑器全局设置（服务端保存，所有用户共用）。
    // 它控制正文宽度/边距/字号等外观，改动通过 CSS 变量即时生效。
    const [editor_setting, set_editor_setting] = useState(MD_EDITOR_SETTING_DEFAULT);
    const container_ref = useRef<HTMLDivElement>(null);

    // 拉取全局设置。放在这里而不是 App 层：只有打开编辑器才需要，避免每次加载页面都多一个请求。
    useEffect(() => {
        let cancelled = false;
        load_md_editor_setting().then(s => {
            if (!cancelled) {
                set_editor_setting(s);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // 设置变化时写入 CSS 变量（放在 container 上，只影响这个编辑器，不污染全局样式）
    useEffect(() => {
        apply_md_editor_setting(container_ref.current, editor_setting);
    }, [editor_setting]);

    // 大纲数据源的统一入口，两种模式各取所需：
    //   wysiwyg —— 问 ProseMirror 要（有真实文档位置）
    //   source  —— 从 Markdown 原文里扫（Ace 没有语义化的文档模型）
    // 结果同时写入 ref 缓存：selectionchange / Ace 光标事件触发非常频繁，
    // 高亮计算若每次都遍历整篇文档会造成明显卡顿。
    const headings_cache = useRef<OutlineItem[]>([]);
    const refresh_headings = useCallback(() => {
        let list: OutlineItem[];
        if (mode === "source") {
            list = parse_markdown_headings(source_text);
        } else {
            const handle = handle_ref.current;
            if (!handle) {
                return;
            }
            list = handle.get_headings();
        }
        headings_cache.current = list;
        set_headings(list);
    }, [mode, source_text]);

    // 计算光标当前所在的标题：取位置在光标之前、且最近的那个标题。
    // 直接读缓存，不做全文遍历（见上面 refresh_headings 的说明）。
    const update_active = useCallback(() => {
        if (mode === "source") {
            // 源码模式：Ace 的光标是行列，转成字符偏移后与标题 pos 直接比较
            const handle = source_ref.current;
            if (!handle) {
                return;
            }
            set_active_pos(find_active_heading(headings_cache.current, handle.getCursorOffset()));
            return;
        }
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
    }, [mode]);

    useEffect(() => {
        let cancelled = false;
        if (!md_editor?.url) {
            set_init_value(null);
            return;
        }
        // 切换文件时重置脏标记：否则上一个文件的未保存状态会误显示在新文件上
        set_dirty(false);
        set_loading(true);
        Http.get(md_editor.url).then(context => {
            if (cancelled) {
                return;
            }
            const text = context ?? "";
            set_init_value(text);
            // 源码模式默认显示原文，这里同步一份，避免刚打开时 textarea 空白
            set_source_text(text);
        }).catch(() => {
            if (cancelled) {
                return;
            }
            NotyFail(t("打开失败"));
            set_init_value("");
            set_source_text("");
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

    // Ctrl/Cmd + / 切换编辑模式（Typora 的同款快捷键）。
    // 用捕获阶段监听，保证在 textarea 里按下时也能被拦到（虽然 textarea 不会消费这个组合键，
    // 但捕获阶段能避免被其他容器的 keymap 抢先处理）。
    const toggle_mode_ref = useRef(toggle_mode);
    toggle_mode_ref.current = toggle_mode;
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "/") {
                e.preventDefault();
                e.stopPropagation();
                toggle_mode_ref.current();
            }
        };
        document.addEventListener("keydown", on_key, true);
        return () => document.removeEventListener("keydown", on_key, true);
    }, []);

    // 文档或选区变化时同步大纲。
    // tick 由 MdWysiwygEditor 的 dispatchTransaction 驱动；
    // 源码模式下 refresh_headings 依赖里带了 mode/source_text，所以切模式、改文本都会重算，
    // 这里不需要再重复列出这两个依赖（它们已包含在 refresh_headings / update_active 里）。
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

    // 点击大纲条目：跳转到对应标题。
    // 两种模式的「位置」语义不同 —— 所见即所得是 ProseMirror 文档位置，
    // 源码模式是 Ace 的字符偏移，所以分别处理。
    const goto_heading = (item: OutlineItem) => {
        if (mode === "source") {
            const handle = source_ref.current;
            if (!handle) {
                return;
            }
            // Ace 的 setCursorOffset 已经包含「滚动到该行可见」的处理，
            // 并且会按 Ace 自己的行高算法定位，不需要像 textarea 那样手工估算行号。
            handle.focus();
            handle.setCursorOffset(item.pos);
            set_active_pos(item.pos);
            return;
        }
        handle_ref.current?.scroll_to_pos(item.pos);
        set_active_pos(item.pos);
    };
    const save = async () => {
        if (!md_editor?.name || !md_editor?.path) {
            return;
        }
        // 源码模式取 Ace 里的实时内容（不经 state，避免输入后立刻保存时拿到旧值）；
        // 所见即所得模式从编辑器序列化
        const context = mode === "source"
            ? (source_ref.current?.getValue() ?? source_text)
            : handle_ref.current?.get_markdown();
        if (context === undefined) {
            return;
        }
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
        <div id={"md-editor-container"} ref={container_ref}>
            <Header ignore_tags={true}
                    left_children={[
                        <ActionButton key={1} title={t("关闭")} icon={"close"} onClick={close}/>,
                        /* 当前文件名：紧跟在关闭按钮之后，与普通文本编辑器（FileEditor）保持一致。
                           注意必须用 <div> 而不是 <title> —— <title> 在 body 内的 UA 样式是
                           display:none，放进 Header 也不会显示出来。 */
                        <div key={2} className={"md-editor-title"}>{md_editor.name}</div>,
                        // 保存按钮只在内容有改动时出现，与普通文本编辑器一致
                        ...(dirty ? [<ActionButton key={2} title={t("保存")} icon={"save"} onClick={save}/>] : []),
                        // 大纲开关：默认关闭，点一下临时控制显示/隐藏
                        <ActionButton key={4} title={t("大纲")} icon={"list"}
                                      onClick={toggle_outline} selected={show_outline}/>,
                        // 编辑模式切换：所见即所得 <-> 源码。快捷键 Ctrl/Cmd + /
                        <ActionButton key={5} title={mode === "wysiwyg" ? t("源码模式") : t("实时编辑模式")}
                                      icon={mode === "wysiwyg" ? "code" : "edit"}
                                      onClick={toggle_mode}/>,
                        // 全局编辑器设置（正文宽度/边距/字号等，对所有用户生效）。
                        // 需要 UserAuth.md_editor_setting 权限，没有就不显示这个入口。
                        // 跳到独立设置页。编辑器是全屏 fixed 覆盖层（z-index 1000），
                        // 不关掉会把设置页整个盖住，所以先 close 再跳。
                        ...(can_setting ? [<ActionButton key={6} title={t("编辑器设置")} icon={"settings"}
                                                        onClick={() => {
                                                            close();
                                                            navigate(routerConfig.md_editor_setting_page);
                                                        }}/>] : []),
                    ]}>
            </Header>
            <div className={"md-editor-context"} ref={nav_ref}>
                {loading && <div className="common-box common-box-center">{t("加载中")}...</div>}
                {!loading && init_value !== null && (
                    <React.Fragment>
                        {/* 左侧大纲：标题树 + 当前标题高亮，点击跳转；宽度可拖动。
                            默认隐藏，由 Header 的「大纲」按钮切换。 */}
                        {show_outline && (
                            <div className={"md-outline-panel"} style={{width: `${nav_width}em`}}>
                                <MdOutline items={headings} active_pos={active_pos} on_click={goto_heading}/>
                            </div>
                        )}
                        {show_outline && (
                            <div className={"md-editor-divider"} ref={divider_ref}
                                 onPointerDown={handle_pointer_down}
                                 onPointerUp={handle_pointer_up}/>
                        )}
                        {/* 拖动时铺一层透明遮罩：避免指针进入编辑器后被 ProseMirror 抢走事件 */}
                        {dragging && <div className={"md-editor-drag-overlay"} onPointerUp={handle_pointer_up}/>}
                        <div className={"md-editor-scroll"}>
                            <div className={"md-editor-sheet"}>
                                {mode === "wysiwyg" ? (
                                    <React.Fragment>
                                        {/* 工具栏只在选中文字时出现（跟随选区浮动），平时不占屏幕也不挡正文。
                                            块级操作（插入表格等）走右键菜单。详见 MdToolbar 与 md_editor.css 的说明。 */}
                                        <MdToolbar get_view={() => handle_ref.current?.get_view() ?? null}
                                                   refresh_key={tick}/>
                                        <MdWysiwygEditor
                                            key={`${editor_key}#${editor_revision}`}
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
                                    </React.Fragment>
                                ) : (
                                    /* 源码模式：直接编辑 Markdown 原文。
                                       用项目通用的 Ace 组件（行号、语法高亮、
                                       原生撤销栈 Ctrl+Z / Ctrl+Y，无需自己实现历史记录）。
                                       key 里带上 editor_key 与 revision：
                                       - editor_key 变化（切换文件）时重建，填入新文件内容；
                                       - revision 用于切回本模式时重建，确保拿到最新的 markdown 初始值。 */
                                    <AceCodeEditor
                                        key={`source#${editor_key}#${editor_revision}`}
                                        ref={source_ref}
                                        value={source_text}
                                        mode={"markdown"}
                                        wrap={true}
                                        className={"md-source-editor"}
                                        onChange={(val) => {
                                            set_source_text(val);
                                            if (!dirty) {
                                                set_dirty(true);
                                            }
                                        }}
                                        // Ctrl/Cmd + S 保存（Ace 内部命令绑定，避免浏览器弹出「另存网页」）
                                        onSave={() => save_ref.current()}
                                        // 光标移动（点选、方向键）时同步大纲高亮
                                        onCursorChange={() => update_active()}
                                    />
                                )}
                            </div>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
}
