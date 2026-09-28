import React, {useEffect, useRef} from "react";
import {EditorState, TextSelection} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {Node as PmNode} from "prosemirror-model";
import {history, redo, undo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {
    baseKeymap,
    chainCommands,
    createParagraphNear,
    exitCode,
    liftEmptyBlock,
    newlineInCode,
    splitBlock,
} from "prosemirror-commands";
import {dropCursor} from "prosemirror-dropcursor";
import {gapCursor} from "prosemirror-gapcursor";
import {tableEditing, columnResizing, goToNextCell, tableNodeTypes} from "prosemirror-tables";
import {md_schema} from "./schema";
import {markdown_to_doc, doc_to_markdown} from "./markdown";
import {OutlineItem} from "./MdOutline";
import {
    build_source_highlight_plugin,
    set_source_highlight_enabled,
} from "./md_source_highlight";
import {
    build_input_rules,
    convert_on_enter,
    list_commands,
    toggle_mark,
    toggle_blockquote,
    toggle_bullet_list,
    toggle_ordered_list,
    set_block_type,
} from "./keymap";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";

// 标题级别 1-6；level 为 0 表示退回普通段落
function set_heading(level: number) {
    return level === 0
        ? set_block_type("paragraph")
        : set_block_type("heading", {level});
}

// 判断是否按下了「跳转修饰键」（Mac 用 Cmd，其他平台用 Ctrl）
function is_jump_modifier(e: {ctrlKey?: boolean, metaKey?: boolean}): boolean {
    return !!(e.ctrlKey || e.metaKey);
}

// ProseMirror 编辑器的 React 封装。
//
// ProseMirror 自己管理自身的 DOM，因此这里只负责：
//   · 挂载时创建 EditorView，卸载时销毁
//   · 通过 ref 暴露「取值 / 设值 / 执行命令」等能力给外层
// React 永远不参与编辑器内部 DOM 的渲染，否则光标与输入法都会出问题。

export interface MdWysiwygHandle {
    /** 当前文档的 Markdown 文本 */
    get_markdown: () => string;
    /** 用 Markdown 文本替换整个文档 */
    set_markdown: (value: string) => void;
    focus: () => void;
    get_view: () => EditorView | null;
    /** 光标/选区是否位于表格内 */
    in_table: () => boolean;
    /** 当前选区已启用的行内标记名集合 */
    active_marks: () => string[];
    /** 当前块类型（heading 时带上 level） */
    active_block: () => {name: string, level?: number};
    /** 在光标处插入一张空表格（默认 3 列 3 行） */
    insert_table: (cols?: number, rows?: number) => void;
    /** 提取文档内所有标题（供左侧大纲面板使用） */
    get_headings: () => OutlineItem[];
    /** 把光标移动到指定文档位置并滚动到视野内（大纲点击跳转） */
    scroll_to_pos: (pos: number) => void;
    // ---- 源码模式（同一实例内切换文档形态，因此撤销栈连续） ----
    /** 切换为源码模式：整篇文档变成一个 markdown 代码块 */
    enter_source_mode: () => void;
    /** 切回所见即所得：把代码块里的文本重新解析成文档 */
    exit_source_mode: () => void;
    /** 当前是否处于源码模式 */
    is_source_mode: () => boolean;
}

interface Props {
    value: string;
    on_change?: (markdown: string) => void;
    on_save?: () => void;
    /**
     * 选区/文档变化时通知外层（用于刷新工具栏的位置与按钮状态）。
     */
    on_selection_change?: () => void;
    /**
     * 文档形态变化时通知外层（源码模式 <-> 所见即所得）。
     * 撤销/重做会让形态来回变化，外层据此同步模式按钮与工具栏显隐。
     */
    on_source_mode_change?: (is_source: boolean) => void;
    /** 是否可编辑 */
    editable?: boolean;
    /**
     * 初始是否处于源码模式。
     * 用户上次停在源码模式时（该偏好被持久化），重新打开文件应当直接以源码形态呈现。
     * 只在挂载时生效，之后的切换走 ref 上的 enter_source_mode / exit_source_mode。
     */
    initial_source_mode?: boolean;
    on_ready?: (handle: MdWysiwygHandle) => void;
}

// 表格内 Enter 与 Tab 的行为：
// Tab 跳到下一格（Shift+Tab 上一格），到末尾自动补一行 —— 这是表格编辑的刚需。
// 注意 keymap 的回调签名是 (state, dispatch, view)，不是 (view)。
function table_enter(state: EditorState, dispatch?: (tr: any) => void): boolean {
    return goToNextCell(1)(state, dispatch);
}

const MdWysiwygEditor = React.forwardRef<MdWysiwygHandle, Props>(function MdWysiwygEditor(props, ref) {
    const host_ref = useRef<HTMLDivElement>(null);
    const view_ref = useRef<EditorView | null>(null);
    const on_change_ref = useRef(props.on_change);
    const on_save_ref = useRef(props.on_save);
    const on_selection_ref = useRef(props.on_selection_change);
    const on_source_mode_ref = useRef(props.on_source_mode_change);
    useEffect(() => {
        on_change_ref.current = props.on_change;
        on_save_ref.current = props.on_save;
        on_selection_ref.current = props.on_selection_change;
        on_source_mode_ref.current = props.on_source_mode_change;
    });

    useEffect(() => {
        if (!host_ref.current) {
            return;
        }
        const s = md_schema;
        const state = EditorState.create({
            doc: markdown_to_doc(props.value ?? ""),
            plugins: [
                // history 放最前：撤销/重做属于最基础的编辑能力，先注册便于阅读。
                // 这个插件在两种模式间共用 —— 切换模式只是替换文档内容，
                // 不重建 EditorView，所以源码模式与所见即所得共享同一个撤销栈。
                history(),
                // 源码模式的语法高亮（用 Decoration，不写进文档）
                build_source_highlight_plugin(),
                build_input_rules(),
                keymap({
                    // 撤销 / 重做：history 插件只负责记录，命令必须显式绑定键位才生效。
                    // Mod 在 Windows/Linux 上是 Ctrl、macOS 上是 Cmd，两种情况都覆盖到。
                    "Mod-z": undo,
                    "Mod-y": redo,          // Windows 习惯
                    "Mod-Shift-z": redo,    // macOS 习惯（同时也是 Windows Chrome 的重做键）
                    // 行内标记
                    "Mod-b": toggle_mark("strong"),
                    "Mod-i": toggle_mark("em"),
                    "Mod-Shift-x": toggle_mark("strike"),
                    "Mod-`": toggle_mark("code"),
                    // 块级
                    "Mod-1": (st, dp) => set_heading(1)(st, dp),
                    "Mod-2": (st, dp) => set_heading(2)(st, dp),
                    "Mod-3": (st, dp) => set_heading(3)(st, dp),
                    "Mod-0": (st, dp) => set_heading(0)(st, dp),
                    "Mod-Shift-8": toggle_bullet_list,
                    "Mod-Shift-9": toggle_ordered_list,
                    "Mod-Shift-.": toggle_blockquote,
                    // 列表缩进
                    "Tab": list_commands.sink,
                    "Shift-Tab": list_commands.lift,
                    // 表格内 Tab 跳格
                    "Mod-Enter": table_enter,
                    // 保存
                    "Mod-s": () => {
                        on_save_ref.current?.();
                        return true;
                    },
                }),
                // 表格编辑插件（含单元格选择、Tab 导航、拖拽列宽）
                tableEditing({allowTableNodeSelection: true}),
                columnResizing(),
                // 光标装饰
                dropCursor({color: "var(--primary, #1a73e8)", width: 2}),
                gapCursor(),
                // 基础键位：Enter 优先在代码块内换行、列表内拆项，其次正常分段
                keymap({
                    "Enter": chainCommands(
                        // 先尝试 Markdown 语法转换（```、#1、> 等 + 回车即时成型），
                        // 命中就消费掉这次 Enter；否则继续走后面的常规换行逻辑
                        convert_on_enter,
                        newlineInCode,
                        list_commands.split,
                        createParagraphNear,
                        liftEmptyBlock,
                        splitBlock,
                    ),
                    // Shift+Enter 插入硬换行（Markdown 中行尾两空格）
                    "Shift-Enter": (st, dp) => {
                        const {hard_break} = st.schema.nodes;
                        if (dp) {
                            dp(st.tr.replaceSelectionWith(hard_break.create()).scrollIntoView());
                        }
                        return true;
                    },
                    // 代码块内 Esc 退出（不用 exitCode 作为默认，避免误触）
                    "Mod-Enter": exitCode,
                    // 说明：Shift + 方向键的选区扩展交给浏览器原生处理。
                    // 自己绑 `extend_selection` 反而会覆盖原生行为（ProseMirror 没有 modify API，
                    // 手写位置推进在软换行、表格单元格、行内原子节点处都会算错）。
                }),
                keymap(baseKeymap),
            ],
        });

        const view = new EditorView(host_ref.current, {
            state,
            editable: () => props.editable !== false,
            // Ctrl/Cmd + 点击链接 → 新窗口打开。
            // 普通点击不拦截，交给 ProseMirror 正常放置光标，保证链接文字能像普通文字一样选中/编辑。
            // node 只有点在 link mark 覆盖的文本上时才是它所在的父节点，
            // 所以这里要自己从 mark 里取 href，而不是读 node.attrs。
            handleClickOn(view, pos, _node, _node_pos, event) {
                if (!is_jump_modifier(event)) {
                    return false;
                }
                // 优先从被点的 DOM 元素上取 href：ProseMirror 渲染出来的链接就是真 <a href="...">，
                // 比用文档位置反查 link mark 可靠得多（点击落在链接首尾时 marks() 可能取到空集）。
                const href = find_link_href_from_dom(event.target)
                    ?? find_link_href(view.state, pos);
                if (!href) {
                    return false;
                }
                window.open(href, "_blank", "noopener,noreferrer");
                return true;
            },
            // 按住 Ctrl/Cmd 时给编辑器根节点打标记，CSS 据此把链接切成「可点击」样式（小手 + 实线下划线）；
            // 同时承载源码模式下的输入接管（见下方 beforeinput / Enter 的说明）。
            handleDOMEvents: {
                keydown: (v, event) => {
                    if (is_jump_modifier(event)) {
                        v.dom.classList.add("md-ctrl-down");
                    }
                    // 源码模式下接管回车：必须只在块内插入换行符 \n。
                    // 不能交给默认的命令链 —— 那条链在代码块末尾会落到 splitBlock，
                    // 把文档拆成「代码块 + 段落」两块，源码模式的形态（单个代码块）随之被破坏，
                    // 后面的接管逻辑就全部失效了。
                    if (
                        is_source_doc(v.state.doc) &&
                        event.key === "Enter" &&
                        !event.ctrlKey && !event.metaKey && !event.altKey
                    ) {
                        event.preventDefault();
                        const {from, to} = v.state.selection;
                        v.dispatch(v.state.tr.insertText("\n", from, to).scrollIntoView());
                        return true;
                    }
                    return false;
                },
                keyup: (v, event) => {
                    // 松开任意一个修饰键都会回到非跳转状态，所以这里无条件移除
                    if (!is_jump_modifier(event)) {
                        v.dom.classList.remove("md-ctrl-down");
                    }
                    return false;
                },
                // 窗口失焦时（如 Alt+Tab 切走）按键状态不再准确，清掉标记避免样式残留
                blur: (v) => {
                    v.dom.classList.remove("md-ctrl-down");
                    return false;
                },
                // 源码模式下自己接管文本输入。
                // 为什么必须接管：ProseMirror 默认靠「读取浏览器产生的 DOM 变化，再反推文档位置」
                // 来处理输入。而源码模式的文档是一个内容为 text* 的代码块，
                // 里面的换行是普通字符 \n；浏览器在 contenteditable 里对换行的 DOM 表示
                // （另起一行 / <br> / 真实 \n 字符）与文档里的 \n 并不一一对应，
                // 反推过程会把已有的 \n 规范化成空格 —— 表现就是「一打字就把整篇 Markdown
                // 的段落结构吃掉」。
                // 这里在源码模式下直接由 JS 构造插入事务，完全绕开 DOM 反推，换行得以原样保留。
                //
                // 为什么选 beforeinput 而不是 handleTextInput / handleKeyDown：
                //   · handleTextInput 实测拦不住这类输入（浏览器走的是 DOM mutation 路线）；
                //   · handleKeyDown 收不到中文等非 ASCII 字符的按键（它们不产生 keydown，
                //     直接以 insertText 的形式出现），会漏掉中文输入；
                //   · beforeinput 对英文、中文、粘贴等所有文本插入都会触发，且带 data，
                //     是最完整、最可靠的接管点。preventDefault 之后浏览器不再改 DOM，
                //     我们再自己 dispatch 事务，ProseMirror 的 DOM 同步由它内部完成。
                // 所见即所得模式完全不接管，保持 ProseMirror 的原生行为。
                beforeinput: (view, event) => {
                    if (!is_source_doc(view.state.doc)) {
                        return false;
                    }
                    const e = event as InputEvent;
                    const type = e.inputType;
                    // 只接管「插入文本」这一类；删除、历史撤销等仍交回 ProseMirror 原生处理
                    if (type !== "insertText") {
                        return false;
                    }
                    const text = e.data;
                    if (text == null) {
                        return false;
                    }
                    e.preventDefault();
                    const {from, to} = view.state.selection;
                    // 换行统一以 \n 写入（浏览器有时会给 \r\n，先归一）
                    view.dispatch(
                        view.state.tr.insertText(text.replace(/\r\n?/g, "\n"), from, to).scrollIntoView()
                    );
                    return true;
                },
            },
            dispatchTransaction(tr) {
                const next = view.state.apply(tr);
                view.updateState(next);
                // 样式类必须跟着「文档形态」走，而不是只在切换时手工加/删：
                // 撤销/重做会把文档在两种形态之间来回切换，class 若不同步，
                // 就会出现「已经是代码块了但还按所见即所得排版」的错乱。
                const now_source = is_source_doc(next.doc);
                set_source_highlight_enabled(now_source);
                if (now_source) {
                    view.dom.classList.add("md-source-mode");
                } else {
                    view.dom.classList.remove("md-source-mode");
                }
                // 形态真的变了才通知外层，避免每次输入都触发一次 React 更新
                if (now_source !== is_source_doc(tr.before)) {
                    on_source_mode_ref.current?.(now_source);
                }
                if (tr.docChanged) {
                    // 源码模式下文档是一个 markdown 代码块，直接取块内文本；
                    // 若在这里走 doc_to_markdown，会被序列化成
                    // "```markdown ... ```" 这种带围栏的形式，与用户编辑的原文不符。
                    on_change_ref.current?.(
                        now_source ? next.doc.textContent : doc_to_markdown(next.doc)
                    );
                }
                // 选区/文档变化时通知外层刷新工具栏（位置与按钮状态）。
                // 不能靠 React 渲染时读 view.state —— 那时 ProseMirror 尚未应用新事务。
                if (tr.selectionSet || tr.docChanged) {
                    on_selection_ref.current?.();
                }
            },
            attributes: {
                class: "md-wysiwyg-content",
                spellcheck: "false",
            },
        });
        view_ref.current = view;

        // 若初始就要求源码模式，这里补一次形态切换。
        // 这次切换不进历史：它是「打开文件时的初始呈现」，不是用户的操作，
        // 否则用户一进来按 Ctrl+Z 就会莫名变回所见即所得形态。
        // 之后由用户点击模式按钮触发的切换才进历史（见 enter_source_mode 的说明）。
        // 注意不需要手工加 md-source-mode 类，也不需要设高亮开关 ——
        // dispatch 会走 dispatchTransaction，那里统一按文档形态同步这些状态。
        if (props.initial_source_mode && !is_source_doc(view.state.doc)) {
            const text = doc_to_markdown(view.state.doc);
            const block = view.state.schema.nodes.code_block.create(
                {language: "markdown"},
                text ? view.state.schema.text(text) : null,
            );
            const tr = view.state.tr;
            tr.replaceWith(0, view.state.doc.content.size, block);
            tr.setMeta("addToHistory", false);
            view.dispatch(tr);
        }

        const handle: MdWysiwygHandle = {
            // 源码模式下文档就是一个 markdown 代码块，取块内文本即为用户编辑的原文
            get_markdown: () => is_source_doc(view.state.doc)
                ? view.state.doc.textContent
                : doc_to_markdown(view.state.doc),
            set_markdown: (value) => {
                const doc = markdown_to_doc(value);
                view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
            },
            focus: () => view.focus(),
            get_view: () => view_ref.current,
            in_table: () => is_in_table(view.state),
            active_marks: () => {
                const marks = view.state.storedMarks ?? view.state.selection.$from.marks();
                return marks.map(m => m.type.name);
            },
            active_block: () => {
                const {$from} = view.state.selection;
                for (let d = $from.depth; d > 0; d--) {
                    const node = $from.node(d);
                    if (node.type.name === "heading") {
                        return {name: "heading", level: node.attrs.level};
                    }
                    if (node.type.name === "paragraph") {
                        return {name: "paragraph"};
                    }
                }
                return {name: "paragraph"};
            },
            insert_table: (cols = 3, rows = 3) => {
                const table = create_table_node(view.state.schema, cols, rows);
                if (!table) {
                    return;
                }
                const {from} = view.state.selection;
                // 表格不能嵌套在表格里：若光标在表格内，改插到当前表格之后
                const $from = view.state.doc.resolve(from);
                let insert_pos = from;
                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name === "table") {
                        insert_pos = $from.after(d);
                        break;
                    }
                }
                const tr = view.state.tr;
                if (insert_pos === from) {
                    tr.replaceSelectionWith(table);
                } else {
                    tr.insert(insert_pos, table);
                }
                view.dispatch(tr.scrollIntoView());
                // 光标移到新表格的第一个单元格，方便直接输入
                const first_cell = view.state.doc.resolve(
                    Math.min(insert_pos + 3, view.state.doc.content.size)
                );
                try {
                    view.dispatch(view.state.tr.setSelection(
                        (view.state.selection.constructor as any).near(first_cell)
                    ));
                } catch {
                    // 定位失败不影响插入结果
                }
            },
            get_headings: () => collect_headings(view.state),
            scroll_to_pos: (pos: number) => {
                // 越界保护：文档可能在两次事件之间被改短
                const max = view.state.doc.content.size;
                const target = Math.max(0, Math.min(pos, max));
                const node = view.state.doc.nodeAt(target);
                let selection;
                try {
                    // 定位到该标题内部（+1 进入节点内容），光标落在标题文字里
                    selection = node
                        ? TextSelection.near(view.state.doc.resolve(target + 1), 1)
                        : TextSelection.near(view.state.doc.resolve(target), 1);
                } catch {
                    selection = TextSelection.near(view.state.doc.resolve(0), 1);
                }
                view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
                view.focus();
            },
            // ---- 源码模式 ----
            // 切换模式的实现要点：不重建 EditorView，只替换文档内容。
            // 同一个 view（同一个 history 插件实例）意味着撤销栈跨越两种模式连续。
            //
            // 关于「切换事务要不要进历史」：
            // 一开始用 addToHistory: false 把它排除，结果是 —— 撤销在跨模式处直接失效。
            // 原因是 history 里存的是带位置的 Step，而 code_block 与 heading/paragraph
            // 是结构完全不同的文档，源码模式里记录的 Step 无法 rebase 到另一种结构上，
            // ProseMirror 会静默丢弃这些 Step，表现就是「按 Ctrl+Z 没反应」。
            //
            // 所以切换事务必须进历史：它作为一次「整篇替换」的断点存在，
            // 撤销时先撤销「切回所见即所得」这一步（视觉上就是又变回源码形态），
            // 再继续往回退到源码里的每一次输入 —— 每一步都能真实回退，符合直觉。
            is_source_mode: () => is_source_doc(view.state.doc),
            enter_source_mode: () => {
                if (is_source_doc(view.state.doc)) {
                    return;
                }
                const text = doc_to_markdown(view.state.doc);
                const block = view.state.schema.nodes.code_block.create(
                    {language: "markdown"},
                    text ? view.state.schema.text(text) : null,
                );
                const tr = view.state.tr;
                tr.replaceWith(0, view.state.doc.content.size, block);
                set_source_highlight_enabled(true);
                view.dispatch(tr);
                // 样式类打在编辑器根节点上，CSS 据此切换成等宽的源码排版
                view.dom.classList.add("md-source-mode");
            },
            exit_source_mode: () => {
                if (!is_source_doc(view.state.doc)) {
                    return;
                }
                const text = view.state.doc.textContent;
                const doc = markdown_to_doc(text);
                const tr = view.state.tr;
                tr.replaceWith(0, view.state.doc.content.size, doc.content);
                set_source_highlight_enabled(false);
                view.dispatch(tr);
                view.dom.classList.remove("md-source-mode");
            },
        };
        if (typeof ref === "function") {
            ref(handle);
        } else if (ref) {
            (ref as React.MutableRefObject<MdWysiwygHandle | null>).current = handle;
        }
        props.on_ready?.(handle);

        return () => {
            view.destroy();
            view_ref.current = null;
        };
        // 只在挂载时创建；切换文件由外层用 key 重新挂载
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div className={"md-wysiwyg"} ref={host_ref}/>;
});

// 从被点击的 DOM 元素向上找最近的 <a>，取出 href。
// ProseMirror 把链接 mark 渲染成真正的 <a href>，所以 DOM 是最直接、最可靠的来源。
function find_link_href_from_dom(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) {
        return null;
    }
    const anchor = target.closest("a[href]");
    const href = anchor?.getAttribute("href");
    return href ? href : null;
}

// 取出指定文档位置上的 link mark 的 href。
// 链接在 schema 里是 mark（不是 node），所以不能用 node.attrs 拿地址；
// 这里先看 storedMarks/光标处的 mark，再从该位置所在节点上找 link mark 兜底。
function find_link_href(state: EditorState, pos: number): string | null {
    // 位置可能落在节点的边界上，夹到合法范围内再解析
    const max = state.doc.content.size;
    const safe_pos = Math.max(0, Math.min(pos, max));
    let $pos;
    try {
        $pos = state.doc.resolve(safe_pos);
    } catch {
        return null;
    }
    // 优先看光标右侧（点击位置之后）的 mark，其次看左侧，覆盖点在文字首尾的情况
    for (const dir of [1, -1]) {
        const start = dir === 1 ? safe_pos : safe_pos - 1;
        if (start < 0 || start >= max) {
            continue;
        }
        try {
            const marks = state.doc.resolve(start).marks();
            const link = marks.find(m => m.type.name === "link");
            if (link?.attrs?.href) {
                return link.attrs.href as string;
            }
        } catch {
            // 解析失败继续尝试下一个方向
        }
    }
    // 兜底：直接取该位置所在父节点的 marks
    try {
        const parent = $pos.parent;
        const link = parent.marks.find(m => m.type.name === "link");
        if (link?.attrs?.href) {
            return link.attrs.href as string;
        }
    } catch {
        // 忽略
    }
    return null;
}

// 判断当前文档是否处于「源码模式」形态。
// 源码模式把整篇内容装进唯一的一个 markdown 代码块，用这个特征来识别，
// 不需要额外维护一份模式状态（避免状态与实际文档不一致）。
function is_source_doc(doc: PmNode): boolean {
    if (doc.childCount !== 1) {
        return false;
    }
    const only = doc.firstChild;
    return !!only && only.type.name === "code_block" && only.attrs.language === "markdown";
}

// 判断选区是否在表格内
function is_in_table(state: EditorState): boolean {
    const {$from} = state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (name === "table") {
            return true;
        }
    }
    return false;
}

/**
 * 遍历文档，按出现顺序收集全部 heading 节点。
 * 用 descendants 而不是逐层递归：ProseMirror 的 descendants 已经按文档顺序访问，
 * 且能自动覆盖 blockquote / list_item 等嵌套在块级容器里的标题。
 * pos 为标题节点的起始位置，供大纲点击时定位使用。
 */
function collect_headings(state: EditorState): OutlineItem[] {
    const items: OutlineItem[] = [];
    state.doc.descendants((node, pos) => {
        if (node.type.name !== "heading") {
            return true;
        }
        items.push({
            level: node.attrs.level as number,
            // textContent 已展开所有行内节点的文本，无需手动拼接
            text: node.textContent,
            pos,
        });
        return true;
    });
    return items;
}

/**
 * 构建一张空表格节点（表头行 + 若干数据行）。
 * prosemirror-tables 没有提供创建命令，这里按其节点角色自行组装。
 * 注意 tableNodeTypes 返回的是按 tableRole 索引的表（table / row / cell / header_cell），
 * 不是按节点名索引。
 */
function create_table_node(schema: any, cols: number, rows: number) {
    const types = tableNodeTypes(schema);
    const table = types.table;
    const row = types.row;
    const cell = types.cell;
    const header_cell = types.header_cell ?? types.cell;
    if (!table || !row || !cell) {
        return null;
    }
    const build_row = (cell_type: any) =>
        row.create(null, Array.from({length: cols}, () => cell_type.createAndFill()));
    const header_row = build_row(header_cell);
    const body_rows = Array.from({length: rows}, () => build_row(cell));
    return table.create(null, [header_row, ...body_rows]);
}

export default MdWysiwygEditor;
