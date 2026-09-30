import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {GlobalContext} from "../../../../GlobalProvider";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import {use_auth_check} from "../../../../util/store.util";
import {UserAuth} from "../../../../../../common/req/user.req";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {RCode} from "../../../../../../common/Result.pojo";
import {fileHttp, userHttp} from "../../../../util/config";
import {Http} from "../../../../util/http";
import {Http_controller_router} from "../../../../../../common/req/http_controller_router";
import {useTranslation} from "react-i18next";
import MdWysiwygEditor, {MdWysiwygHandle} from "./MdWysiwygEditor";
import MdToolbar from "./MdToolbar";
import MdContextMenu from "./MdContextMenu";
import MdOutline, {OutlineItem} from "./MdOutline";
import {parse_markdown_headings} from "./md_outline_parse";
import {apply_md_editor_setting} from "./MdEditorSetting";
import {apply_theme_css, load_active_theme_css, MD_THEME_CHANGE_EVENT} from "./md_theme";
import {MdThemeMenu} from "./MdThemeMenu";
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
    const set_last_context = useAtom($stroe.md_editor_last_context)[1];
    // 正文同步到全局 atom 的防抖计时器
    const last_context_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    // 在「所见即所得」与「源码」之间切换。
    // 两种模式共用同一个 ProseMirror 实例，切换只是替换文档形态：
    // 因此撤销栈（history 插件）是连续的 —— 一边改了几笔，切到另一边后
    // Ctrl+Z 依然能按时间顺序退回去，这正是「两个模式复用撤销」要的效果。
    const toggle_mode = useCallback(() => {
        // 注意：不要在 set_mode 的 updater 里做其他 setState —— updater 应当是纯函数，
        // 在它里面改别的 state 会被 React 的严格模式重复执行。先算出下一个值，再依次应用。
        const next: MdEditMode = mode === "wysiwyg" ? "source" : "wysiwyg";
        const handle = handle_ref.current;
        if (!handle) {
            return;
        }
        if (next === "source") {
            handle.enter_source_mode();
        } else {
            handle.exit_source_mode();
        }
        set_mode(next);
    }, [mode]);

    // md 编辑器全局设置（服务端保存，所有用户共用）。
    // 它控制正文宽度/边距/字号等外观，改动通过 CSS 变量即时生效。
    // 数据在 initUserInfo 里统一拉取后存 atom，编辑器直接读，不再自己请求。
    const [editor_setting] = useAtom($stroe.md_editor_setting);
    // 当前生效的主题 css，同样来自 initUserInfo 的拉取结果
    const [md_theme_css, set_md_theme_css] = useAtom($stroe.md_theme_css);
    // 当前用户选中的主题（存在个人数据 user_data.md_editor_theme 里）。
    // 这里只保留「用户选了什么」用于菜单高亮；实际生效的主题 css 由后端综合
    // 个人选择与系统设置算出来，前端不关心主题名。
    const [user_base_info] = useAtom($stroe.user_base_info);
    const {initUserInfo} = useContext(GlobalContext);

    const container_ref = useRef<HTMLDivElement>(null);
    // 用户刚主动选过的主题。个人数据是异步拉回来的，拉回来时可能还没有这次改动
    // （服务端内存里的用户信息刷新有先后），直接用它会把手选的项打回去、高亮跟着跳。
    // 所以本地选择优先，只在没有本地选择时才用拉回来的值。
    const local_choice = useRef<string | null>(null);
    useEffect(() => {
        if (local_choice.current !== null) {
            return;
        }
    }, [user_base_info]);

    // 全局设置存在 atom 里（initUserInfo 拉取），这里不需要再请求。
    // 主题 css 同理：编辑器只负责把 atom 里的 css 注入自己的正文容器。

    // 设置变化时写入 CSS 变量（放在 container 上，只影响这个编辑器，不污染全局样式）
    useEffect(() => {
        apply_md_editor_setting(container_ref.current, editor_setting);
    }, [editor_setting]);

    // 切换主题：存进当前用户的个人数据（不是全局设置），并立即生效。
    // 存完调 initUserInfo 重拉生效主题，atom 变了下面的 effect 会自己重新注入。
    const switch_theme = async (id: string) => {

        const rsp = await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_md_theme: true,
            md_editor_theme: id,
        });
        if (rsp?.code !== RCode.Success) {
            NotyFail(t("保存失败"));
            return;
        }
        // 记下这次选择：initUserInfo 拉回来的数据可能还没包含它，避免高亮被打回去
        local_choice.current = id;
        // 同步全局个人数据，顺便把生效主题 css 重新拉到 atom
        await initUserInfo();
        NotySuccess(t("保存成功"));
    };

    // 应用主题：把 atom 里的主题 css 原样注入。没内容就不注入，并清掉旧的样式。
    useEffect(() => {
        apply_theme_css("editor", md_theme_css);
    }, [md_theme_css]);

    // 主题内容被编辑/删除后，重拉一次生效主题（atom 变化会触发上面的注入）
    useEffect(() => {
        const on_theme_change = () => {
            load_active_theme_css().then(set_md_theme_css);
        };
        window.addEventListener(MD_THEME_CHANGE_EVENT, on_theme_change);
        return () => window.removeEventListener(MD_THEME_CHANGE_EVENT, on_theme_change);
    }, []);

    // 大纲数据源的统一入口，两种模式各取所需：
    //   wysiwyg —— 问 ProseMirror 要（有真实文档位置）
    //   source  —— 从 Markdown 原文里扫（此时文档模型里只有一个代码块，
    //              没有语义化的标题节点，所以解析文本更直接）
    //  注意两种模式下 pos 的含义不同：
    //   wysiwyg 是文档位置；source 是【代码块内文本】的字符偏移，
    //   因此 source 下用 item.pos 时需要 +1（进入代码块内容），见 goto_heading。
    // 结果同时写入 ref 缓存：selectionchange 触发非常频繁，
    // 高亮计算若每次都遍历整篇文档会造成明显卡顿。
    const headings_cache = useRef<OutlineItem[]>([]);
    const refresh_headings = useCallback(() => {
        const handle = handle_ref.current;
        if (!handle) {
            return;
        }
        const list = handle.is_source_mode()
            ? parse_markdown_headings(handle.get_markdown())
            : handle.get_headings();
        headings_cache.current = list;
        set_headings(list);
    }, []);

    // 计算光标当前所在的标题：取位置在光标之前、且最近的那个标题。
    // 直接读缓存，不做全文遍历（见上面 refresh_headings 的说明）。
    // 位置换算：源码模式下 headings 里的 pos 是「代码块内文本」的字符偏移，
    // 而编辑器光标是文档位置（代码块内容从文档位置 1 开始），两者差 1。
    const update_active = useCallback(() => {
        const handle = handle_ref.current;
        const view = handle?.get_view();
        if (!handle || !view) {
            return;
        }
        const source_mode = handle.is_source_mode();
        const cursor = source_mode
            ? view.state.selection.from - 1
            : view.state.selection.from;
        let current = -1;
        for (const item of headings_cache.current) {
            if (item.pos <= cursor) {
                current = item.pos;
            } else {
                break;
            }
        }
        // active_pos 与 headings 里的 pos 保持同一套坐标系（源码模式下即字符偏移）
        set_active_pos(current);
    }, []);

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

    // 文档或选区变化时同步大纲，切换模式时也要重算（两种模式的数据来源不同）。
    // tick 由 MdWysiwygEditor 的 dispatchTransaction 驱动。
    useEffect(() => {
        refresh_headings();
        update_active();
    }, [tick, mode, refresh_headings, update_active]);

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
    // 源码模式下 headings 的 pos 是文本字符偏移，而编辑器文档位置比它大 1
    // （代码块内容从文档位置 1 开始），所以这里要 +1 才能落到正确的字符上。
    const goto_heading = (item: OutlineItem) => {
        const handle = handle_ref.current;
        if (!handle) {
            return;
        }
        handle.scroll_to_pos(handle.is_source_mode() ? item.pos + 1 : item.pos);
        set_active_pos(item.pos);
    };
    /**
     * 保存到服务端。
     * @param silent 静默模式（自动保存用）：成功时不弹提示，只在失败时提示，避免每几秒弹一次
     */
    const save = async (silent = false) => {
        if (!md_editor?.name || !md_editor?.path) {
            return;
        }
        // 两种模式共用同一个编辑器实例，get_markdown 已按当前形态返回正确的原文
        const context = handle_ref.current?.get_markdown();
        if (context === undefined) {
            return;
        }
        // path 形如 "sub/a.md"：目录部分编码，文件名原样（与项目其他编辑器的保存规则一致）
        const dir = md_editor.path.slice(0, md_editor.path.length - md_editor.name.length);
        const save_path = `${encodeURIComponent(dir)}${md_editor.name}`;
        const rsq = await fileHttp.post(`save/${save_path}`, {context});
        if (rsq.code === RCode.Success) {
            set_dirty(false);
            if (!silent) {
                NotySuccess(t("保存成功"));
            }
        } else {
            NotyFail(t("保存失败"));
        }
    };
    const save_ref = useRef(save);
    save_ref.current = save;

    // 自动保存：每 N 秒检查一次，有未保存的改动就静默保存。
    // N 取全局设置里的 auto_save_interval（秒），为 0 时不做任何事（相当于关闭）。
    // 用 dirty_ref 读取最新值，避免把 dirty 放进依赖导致定时器被反复重建。
    const dirty_ref = useRef(dirty);
    dirty_ref.current = dirty;
    const auto_save_interval = editor_setting?.auto_save_interval ?? 0;
    useEffect(() => {
        if (auto_save_interval <= 0) {
            return;
        }
        const timer = setInterval(() => {
            if (dirty_ref.current) {
                save_ref.current(true);
            }
        }, auto_save_interval * 1000);
        return () => clearInterval(timer);
    }, [auto_save_interval]);

    // 导出 PDF：交给浏览器打印对话框，
    // 用户可在其中预览、选页码范围、并「另存为 PDF」。
    // 打印时的版面由 md_editor.css 的 @media print 接管（只留正文纸张）。
    const export_pdf = () => {
        window.print();
    };

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
                        <div key={3} className={"md-editor-title"}>{md_editor.name}</div>,
                        // 保存按钮只在内容有改动时出现，与普通文本编辑器一致
                        ...(dirty ? [<ActionButton key={2} title={t("保存")} icon={"save"} onClick={save}/>] : []),
                        // 大纲开关：默认关闭，点一下临时控制显示/隐藏
                        <ActionButton key={4} title={t("大纲")} icon={"list"}
                                      onClick={toggle_outline} selected={show_outline}/>,
                        // 编辑模式切换：所见即所得 <-> 源码。快捷键 Ctrl/Cmd + /
                        <ActionButton key={5} title={mode === "wysiwyg" ? t("源码模式") : t("实时编辑模式")}
                                      icon={mode === "wysiwyg" ? "code" : "edit"}
                                      onClick={toggle_mode}/>,
                        <MdThemeMenu key={8}
                                     on_change={switch_theme}/>,
                        // 导出 PDF：走浏览器打印，可在打印对话框里预览、选页并另存为 PDF
                        <ActionButton key={7} title={t("导出PDF")} icon={"print"} onClick={export_pdf}/>,
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
                                {/* 工具栏与右键菜单只在所见即所得模式下有意义：
                                    源码模式里文档就是一个纯文本代码块，没有可格式化的语义。
                                    这里用条件挂载（而不是隐藏），避免它们在源码模式下误操作文档结构。 */}
                                {mode === "wysiwyg" && (
                                    <MdToolbar get_view={() => handle_ref.current?.get_view() ?? null}
                                               refresh_key={tick}/>
                                )}
                                {/* 两种模式共用这一个 ProseMirror 实例 —— 这是撤销栈能跨模式连续的关键：
                                    切换模式只替换文档内容（wysiwyg 用文档树，source 用一个 markdown 代码块），
                                    不重建 EditorView，因此 history 插件记录的历史一直有效。
                                    下面没有任何按 mode 分叉的 JSX，模式差异全部由 ref 方法驱动。 */}
                                <MdWysiwygEditor
                                    key={editor_key}
                                    value={init_value}
                                    ref={handle_ref}
                                    initial_source_mode={mode === "source"}
                                    // 编辑器就绪时立即同步大纲：
                                    // 按 tick 刷新的 effect 在挂载时 ref 尚未赋值（handle 在子组件
                                    // 自己的 useEffect 里才写入），拿不到句柄会让大纲空白，
                                    // 必须等用户点一下编辑器触发 selectionchange 才显示。
                                    on_ready={(handle) => {
                                        const list = handle.is_source_mode()
                                            ? parse_markdown_headings(handle.get_markdown())
                                            : handle.get_headings();
                                        headings_cache.current = list;
                                        set_headings(list);
                                        set_active_pos(-1);
                                    }}
                                    on_change={() => {
                                        if (!dirty) {
                                            set_dirty(true);
                                        }
                                        // 同步正文到全局 atom，供主题编辑页做实时预览（防抖，避免每次按键都取全文）
                                        if (last_context_timer.current) {
                                            clearTimeout(last_context_timer.current);
                                        }
                                        last_context_timer.current = setTimeout(() => {
                                            const text = handle_ref.current?.get_markdown() ?? "";
                                            if (text) {
                                                set_last_context(text);
                                            }
                                        }, 800);
                                    }}
                                    on_save={() => save_ref.current()}
                                    on_selection_change={() => set_tick(n => n + 1)}
                                    // 撤销/重做会让文档在两种形态间来回切换，
                                    // 这里据实同步 mode，保证按钮图标与工具栏显隐和文档一致
                                    on_source_mode_change={(is_source) => {
                                        set_mode(is_source ? "source" : "wysiwyg");
                                        set_tick(n => n + 1);
                                    }}
                                />
                                {mode === "wysiwyg" && (
                                    <MdContextMenu get_view={() => handle_ref.current?.get_view() ?? null}
                                                   on_insert_table={() => {
                                                       handle_ref.current?.insert_table(3, 3);
                                                       set_dirty(true);
                                                   }}/>
                                )}
                            </div>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
}
