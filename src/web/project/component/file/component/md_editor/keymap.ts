import {inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, ellipsis} from "prosemirror-inputrules";
import {md_schema} from "./schema";
import {Command} from "prosemirror-state";
import {toggleMark} from "prosemirror-commands";
import {liftListItem, sinkListItem, splitListItem, wrapInList} from "prosemirror-schema-list";

// 输入规则与常用编辑命令的组装。
//
// 输入规则负责「边打字边成型」：在普通段落里键入 Markdown 语法并空格后即时转成对应结构，
// 这是所见即所得编辑器最基本的手感（# → 标题、- → 列表、> → 引用、``` → 代码块）。

// ---------------------------------------------------------------------------
// 输入规则
// ---------------------------------------------------------------------------

export function build_input_rules() {
    const s = md_schema;
    return inputRules({
        rules: [
            // # ～ ###### → 标题
            textblockTypeInputRule(/^(#{1,6})\s$/, s.nodes.heading, match => ({level: match[1].length})),
            // ``` 或 ```lang → 代码块
            textblockTypeInputRule(/^```([\w-]*)\s$/, s.nodes.code_block, match => ({language: match[1] ?? ""})),
            // > → 引用
            wrappingInputRule(/^\s*>\s$/, s.nodes.blockquote),
            // - * + → 无序列表
            wrappingInputRule(/^\s*([-+*])\s$/, s.nodes.bullet_list),
            // 1. → 有序列表
            wrappingInputRule(/^(\d+)\.\s$/, s.nodes.ordered_list, match => ({order: Number(match[1])})),
            // 智能标点
            ...smartQuotes,
            ellipsis,
        ],
    });
}

// ---------------------------------------------------------------------------
// 常用命令（工具栏与快捷键共用）
// ---------------------------------------------------------------------------

/** 切换行内标记（加粗 / 斜体 / 删除线 / 行内代码） */
export function toggle_mark(mark_name: string): Command {
    return (state, dispatch) => {
        const mark = state.schema.marks[mark_name];
        if (!mark) {
            return false;
        }
        return toggleMark(mark)(state, dispatch);
    };
}

/** 设置当前块类型（段落 / 标题），已是指定级别时退回段落（用于工具栏按钮的开关效果） */
export function set_block_type(node_name: string, attrs: Record<string, unknown> = {}): Command {
    return (state, dispatch) => {
        const type = state.schema.nodes[node_name];
        if (!type) {
            return false;
        }
        const {$from, $to} = state.selection;
        const range = $from.blockRange($to);
        if (!range) {
            return false;
        }
        const current = $from.parent;
        const is_same = current.type === type &&
            Object.entries(attrs).every(([k, v]) => current.attrs[k] === v);
        const target = is_same ? state.schema.nodes.paragraph : type;
        const target_attrs = is_same ? {} : attrs;
        if (dispatch) {
            dispatch(state.tr.setBlockType(range.start, range.end, target, target_attrs));
        }
        return true;
    };
}

/** 包裹为无序列表 */
export const toggle_bullet_list: Command = (state, dispatch) => {
    return wrapInList(state.schema.nodes.bullet_list)(state, dispatch);
};

/** 包裹为有序列表 */
export const toggle_ordered_list: Command = (state, dispatch) => {
    return wrapInList(state.schema.nodes.ordered_list)(state, dispatch);
};

/** 包裹为引用块；已在引用内则取消包裹 */
export const toggle_blockquote: Command = (state, dispatch) => {
    const {blockquote} = state.schema.nodes;
    const {$from, $to} = state.selection;
    const range = $from.blockRange($to);
    if (!range) {
        return false;
    }
    // 已在引用块内：用 lift 把它抬出来（交给 state 的事务处理，避免手写位置计算）
    if (range.parent.type === blockquote && range.depth > 0) {
        const pos = $from.before(range.depth);
        const node = state.tr.doc.nodeAt(pos);
        if (node && node.childCount === 1) {
            if (dispatch) {
                dispatch(state.tr.replaceWith(pos, pos + node.nodeSize, node.child(0)).scrollIntoView());
            }
            return true;
        }
        // 引用内多个块：只把当前段落移出引用
        if (dispatch) {
            const tr = state.tr;
            const paragraph = $from.parent;
            const insert_at = $from.after(range.depth);
            tr.delete(range.start, range.end);
            tr.insert(insert_at, paragraph);
            dispatch(tr.scrollIntoView());
        }
        return true;
    }
    if (dispatch) {
        dispatch(state.tr.wrap(range, [{type: blockquote}]).scrollIntoView());
    }
    return true;
};

/** 列表项操作（Tab 缩进 / Shift-Tab 反缩进 / Enter 拆分） */
export const list_commands = {
    sink: sinkListItem(md_schema.nodes.list_item),
    lift: liftListItem(md_schema.nodes.list_item),
    split: splitListItem(md_schema.nodes.list_item),
    wrap_bullet: toggle_bullet_list,
    wrap_ordered: toggle_ordered_list,
};
