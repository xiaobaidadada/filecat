import {InputRule, inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, ellipsis} from "prosemirror-inputrules";
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

/**
 * 构造「行内标记」输入规则：敲完整对符号后把中间内容变成带 mark 的文字。
 *
 * 为什么自己写而不直接用库函数：prosemirror-inputrules 只提供
 * wrappingInputRule（包块）和 textblockTypeInputRule（换块类型），
 * 没有行内 mark 的版本 —— 官方示例里的 markInputRule 是手写的工具函数，
 * 并未进入包导出。
 *
 * 这里只处理最常见的「成对包裹」场景（`代码`、**粗体**、*斜体*、~~删除~~）：
 * 正则从 $$ 锚定，匹配区间的首尾各是一个标记符，中间是要保留并打 mark 的内容。
 *
 * @param regexp   形如 /(?:`)([^`]+)(?:`)$/，第 1 个捕获组是内容
 * @param mark_type schema 里的 mark 名（code / strong / em / strike）
 */
function mark_input_rule(regexp: RegExp, mark_type: string): InputRule {
    return new InputRule(regexp, (state, match, start, end) => {
        const mark = state.schema.marks[mark_type];
        const content = match[1];
        if (!mark || !content) {
            return null;
        }
        // 定位内容在整段匹配里的偏移：两侧标记符对称，直接用 indexOf 定位即可
        const offset = match[0].indexOf(content);
        if (offset < 0) {
            return null;
        }
        const text_start = start + offset;
        const text_end = text_start + content.length;
        const tr = state.tr;
        // 先删右侧标记符、再删左侧（从后往前，避免前面删除导致后面的位置失效）
        tr.delete(text_end, end);
        tr.delete(start, text_start);
        // 给剩下的内容打 mark，并把该 mark 设为后续输入继续继承的样式
        tr.addMark(start, start + content.length, mark.create());
        tr.removeStoredMark(mark);
        return tr;
    });
}

export function build_input_rules() {
    const s = md_schema;
    return inputRules({
        rules: [
            // # ～ ###### → 标题
            textblockTypeInputRule(/^(#{1,6})\s$/, s.nodes.heading, match => ({level: match[1].length})),
            // #1 ～ #6 → 标题（数字即级别）。与回车路径（convert_on_enter）保持同一套语义，
            // 让「敲 #3 再按空格」和「敲 #3 再按回车」得到完全相同的结果。
            // 注意必须放在上面那条后面：'#1 ' 与 '# ' 的分支互斥，顺序上先匹配更具体的形式更直观。
            textblockTypeInputRule(/^#([1-6])\s$/, s.nodes.heading, match => ({level: Number(match[1])})),
            // ``` 或 ```lang → 代码块
            textblockTypeInputRule(/^```([\w-]*)\s$/, s.nodes.code_block, match => ({language: match[1] ?? ""})),
            // > → 引用
            wrappingInputRule(/^\s*>\s$/, s.nodes.blockquote),
            // - * + → 无序列表
            wrappingInputRule(/^\s*([-+*])\s$/, s.nodes.bullet_list),
            // 1. → 有序列表
            wrappingInputRule(/^(\d+)\.\s$/, s.nodes.ordered_list, match => ({order: Number(match[1])})),

            // ---- 行内标记：敲完整对符号后即时成型 ----
            // ★ 这里的顺序与正则边界都不能随便改，原因是 '*' 与 '_' 同时被粗体和斜体复用：
            //
            //   敲 "**粗体**" 的过程中，第 3 个 '*' 落下的那一刻，文本是 "**粗体*"。
            //   此时粗体规则（要求首尾各两个 *）尚未成立，而裸的斜体规则
            //   /(?:\*)([^*]+)(?:\*)$/ 会把其中的 "*粗体*" 当成斜体命中，
            //   于是粗体还没成型就被斜体抢先吃掉了。
            //
            //   所以斜体规则必须排除「标记符前面还是同一个字符」的写法。
            //   这里用后向断言 (?<![*]) 而不是 (?:^|[^*])：后者会真实吃进
            //   左侧那个字符，导致 "a*斜体*" 这种写法把 a 一起删掉；
            //   零宽断言只做判断、不消耗字符，边界才安全。
            mark_input_rule(/(?:\*\*)([^*]+)(?:\*\*)$/, "strong"),
            mark_input_rule(/(?:__)([^_]+)(?:__)$/, "strong"),
            mark_input_rule(/(?<![*])\*([^*]+)\*$/, "em"),
            mark_input_rule(/(?<![_])_([^_]+)_$/, "em"),
            // ~~删除线~~（单波浪线不是 Markdown 语法，必须两个）
            mark_input_rule(/(?:~~)([^~]+)(?:~~)$/, "strike"),
            // `行内代码`：内容里不允许再出现反引号，与 Markdown 单反引号的规则一致
            mark_input_rule(/(?:`)([^`]+)(?:`)$/, "code"),

            // 智能标点
            ...smartQuotes,
            ellipsis,
        ],
    });
}

// ---------------------------------------------------------------------------
// Enter 键的语法转换
// ---------------------------------------------------------------------------

/**
 * 在光标所在段落里匹配 Markdown 块级语法。
 *
 * 只认「整段就是一个语法前缀」的情况（允许行首缩进），
 * 因为输入规则与回车转换都属于「边打字边成型」，语义必须是无歧义的：
 * 段落里已经有正文时不该被转换，否则会把正常内容吃掉。
 *
 * 返回转换结果；不匹配返回 null。
 */
function match_block_syntax(text: string): {
    /** 目标节点名 */
    type: string;
    /** 目标节点属性 */
    attrs?: Record<string, unknown>;
} | null {
    const t = text.trim();

    // 标题：
    //   "#1" ~ "#6"  → 数字即级别（写起来快，Typora 也有这种用法）
    //   "#" ~ "######" → 井号个数即级别
    const m_hash_num = /^#([1-6])$/.exec(t);
    if (m_hash_num) {
        return {type: "heading", attrs: {level: Number(m_hash_num[1])}};
    }
    const m_hash = /^(#{1,6})$/.exec(t);
    if (m_hash) {
        return {type: "heading", attrs: {level: m_hash[1].length}};
    }

    // 代码块：``` 或 ```语言
    const m_fence = /^```([\w-]*)$/.exec(t);
    if (m_fence) {
        return {type: "code_block", attrs: {language: m_fence[1] ?? ""}};
    }

    // 分割线：--- / *** / ___（三个及以上，允许中间有空格）
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t.replace(/\s+/g, ""))) {
        return {type: "horizontal_rule"};
    }

    // 引用：> 或 >（后面可跟空格）
    if (/^>\s*$/.test(t)) {
        return {type: "blockquote"};
    }

    // 无序列表：- / * / +
    if (/^[-+*]\s*$/.test(t)) {
        return {type: "bullet_list"};
    }

    // 有序列表：1. / 1)
    if (/^\d+[.)]?$/.test(t)) {
        return {type: "ordered_list"};
    }

    return null;
}

/**
 * Enter 时把当前段落按 Markdown 语法转成对应块结构。
 *
 * 为什么需要它：ProseMirror 的 input rule 只在「文本输入」时检查，
 * 而回车走的是 keymap，两者是两条独立路径。于是「敲 ```js 再回车」这种
 * 最常见的写法不会成型 —— 用户必须先多敲一个空格才行，手感很别扭。
 *
 * 这里把它补上：命中语法就转换并消费这次 Enter（不额外插入空行），
 * 与 Typora 的行为一致。未命中返回 false，交回给后续的 Enter 命令。
 */
export const convert_on_enter: Command = (state, dispatch) => {
    const {$from, empty} = state.selection;
    // 只在空选区、光标位于普通段落里时转换：避免破坏删除操作与其它块类型的输入
    if (!empty || $from.parent.type.name !== "paragraph") {
        return false;
    }
    const text = $from.parent.textContent;
    if (!text.trim()) {
        return false;
    }
    const matched = match_block_syntax(text);
    if (!matched) {
        return false;
    }
    // 引用块内不再展开嵌套引用：用户极少需要在引用里再套一层引用，
    // 而 '>' 在引用内误触的概率很高，会让人以为编辑器坏了。其余语法照常转换。
    if (matched.type === "blockquote" && $from.depth > 1) {
        return false;
    }

    const type = state.schema.nodes[matched.type];
    if (!type) {
        return false;
    }
    const start = $from.before($from.depth);
    const end = $from.after($from.depth);

    if (dispatch) {
        const tr = state.tr;
        // 整个段落替换成目标节点：Markdown 标记本身不再保留，
        // 与 input rule（敲空格成型）的行为保持一致。
        const node = type.createAndFill(matched.attrs) ?? type.create(matched.attrs);
        tr.replaceWith(start, end, node);
        tr.scrollIntoView();
        dispatch(tr);
    }
    return true;
};

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
