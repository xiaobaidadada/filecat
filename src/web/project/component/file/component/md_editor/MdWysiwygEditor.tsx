import React, {useEffect, useRef} from "react";
import {EditorState, TextSelection} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {history} from "prosemirror-history";
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
    build_input_rules,
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
}

interface Props {
    value: string;
    on_change?: (markdown: string) => void;
    on_save?: () => void;
    /**
     * 选区/文档变化时通知外层（用于刷新工具栏的位置与按钮状态）。
     */
    on_selection_change?: () => void;
    /** 是否可编辑 */
    editable?: boolean;
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
    useEffect(() => {
        on_change_ref.current = props.on_change;
        on_save_ref.current = props.on_save;
        on_selection_ref.current = props.on_selection_change;
    });

    useEffect(() => {
        if (!host_ref.current) {
            return;
        }
        const s = md_schema;
        const state = EditorState.create({
            doc: markdown_to_doc(props.value ?? ""),
            plugins: [
                build_input_rules(),
                keymap({
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
                history(),
                // 基础键位：Enter 优先在代码块内换行、列表内拆项，其次正常分段
                keymap({
                    "Enter": chainCommands(
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
            dispatchTransaction(tr) {
                const next = view.state.apply(tr);
                view.updateState(next);
                if (tr.docChanged) {
                    on_change_ref.current?.(doc_to_markdown(next.doc));
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

        const handle: MdWysiwygHandle = {
            get_markdown: () => doc_to_markdown(view.state.doc),
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
