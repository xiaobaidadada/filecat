import {Schema, NodeSpec, MarkSpec} from "prosemirror-model";
import {tableNodes} from "prosemirror-tables";

// 所见即所得编辑器的文档模型。
//
// 表格部分使用 prosemirror-tables 官方给出的节点定义，它会把 table/table_row/table_cell
// 直接映射成真正的 <table>/<tr>/<td> DOM —— 这正是 Typora 那种「表格就是表格」的观感来源，
// 而不是像纯文本编辑器那样只显示一堆竖线字符。
//
// 其余节点按 Markdown 能表达的结构自定义，保证「文档 ⇄ Markdown」双向转换不丢信息。

// 表格节点（table / table_row / table_header / table_cell）
const table_node_specs = tableNodes({
    tableGroup: "block",
    cellContent: "block+",
    cellAttributes: {},
}) as Record<string, NodeSpec>;

// 行内通用属性（对齐）
const attrs_align: NodeSpec["attrs"] = {
    align: {default: null},
};

const nodes: Record<string, NodeSpec> = {
    // 文档根节点
    doc: {content: "block+"},

    // 段落
    paragraph: {
        content: "inline*",
        group: "block",
        attrs: attrs_align,
        parseDOM: [{tag: "p"}],
        toDOM(node) {
            return ["p", node.attrs.align ? {style: `text-align:${node.attrs.align}`} : {}, 0];
        },
    },

    // 标题 h1-h6
    heading: {
        content: "inline*",
        group: "block",
        attrs: {level: {default: 1}, ...attrs_align},
        defining: true,
        parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({tag: `h${level}`, attrs: {level}})),
        toDOM(node) {
            const style = node.attrs.align ? {style: `text-align:${node.attrs.align}`} : {};
            return [`h${node.attrs.level}`, style, 0];
        },
    },

    // 列表
    bullet_list: {
        group: "block",
        content: "list_item+",
        parseDOM: [{tag: "ul"}],
        toDOM() {
            return ["ul", 0];
        },
    },
    ordered_list: {
        group: "block",
        content: "list_item+",
        attrs: {order: {default: 1}},
        parseDOM: [{
            tag: "ol",
            getAttrs: dom => ({order: Number((dom as HTMLElement).getAttribute("start") ?? 1)}),
        }],
        toDOM(node) {
            return node.attrs.order === 1 ? ["ol", 0] : ["ol", {start: node.attrs.order}, 0];
        },
    },
    // 列表项：checked 为 null 表示普通项，true/false 表示任务列表
    list_item: {
        content: "paragraph block*",
        defining: true,
        attrs: {checked: {default: null}},
        parseDOM: [{
            tag: "li",
            getAttrs: (dom: HTMLElement | string) => {
                const el = dom as HTMLElement;
                const checkbox = el.querySelector("input[type=checkbox]");
                if (checkbox) {
                    return {checked: (checkbox as HTMLInputElement).checked};
                }
                const dc = el.getAttribute("data-checked");
                return {checked: dc === null ? null : dc === "true"};
            },
        }],
        toDOM(node) {
            if (node.attrs.checked !== null) {
                return ["li", {"data-checked": String(node.attrs.checked)}, 0];
            }
            return ["li", 0];
        },
    },

    // 引用块
    blockquote: {
        content: "block+",
        group: "block",
        defining: true,
        parseDOM: [{tag: "blockquote"}],
        toDOM() {
            return ["blockquote", 0];
        },
    },

    // 代码块（带语言）
    code_block: {
        content: "text*",
        group: "block",
        marks: "",
        defining: true,
        attrs: {language: {default: ""}},
        parseDOM: [{
            tag: "pre",
            preserveWhitespace: "full",
            getAttrs: (dom: HTMLElement | string) => {
                const el = dom as HTMLElement;
                const code = el.querySelector("code");
                const cls = code?.className ?? "";
                const m = /language-([\w-]+)/.exec(cls);
                return {language: m ? m[1] : ""};
            },
        }],
        toDOM(node) {
            return ["pre", {"data-language": node.attrs.language}, ["code", 0]];
        },
    },

    // 分割线
    horizontal_rule: {
        group: "block",
        parseDOM: [{tag: "hr"}],
        toDOM() {
            return ["hr"];
        },
    },

    // 硬换行
    hard_break: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{tag: "br"}],
        toDOM() {
            return ["br"];
        },
    },

    // 图片
    image: {
        inline: true,
        group: "inline",
        draggable: true,
        attrs: {src: {}, alt: {default: null}, title: {default: null}},
        parseDOM: [{
            tag: "img[src]",
            getAttrs: (dom: HTMLElement | string) => {
                const el = dom as HTMLElement;
                return {src: el.getAttribute("src"), alt: el.getAttribute("alt"), title: el.getAttribute("title")};
            },
        }],
        toDOM(node) {
            const {src, alt, title} = node.attrs;
            const a: Record<string, string> = {src};
            if (alt) a.alt = alt;
            if (title) a.title = title;
            return ["img", a];
        },
    },

    // 纯文本（仅用于代码块内容）
    text: {group: "inline"},

    // 表格节点（来自 prosemirror-tables）
    ...table_node_specs,
};

// 行内样式
const marks: Record<string, MarkSpec> = {
    strong: {
        parseDOM: [{tag: "strong"}, {tag: "b"}, {style: "font-weight=bold"}],
        toDOM() {
            return ["strong", 0];
        },
    },
    em: {
        parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
        toDOM() {
            return ["em", 0];
        },
    },
    strike: {
        parseDOM: [{tag: "s"}, {tag: "del"}, {tag: "strike"}],
        toDOM() {
            return ["s", 0];
        },
    },
    code: {
        // 代码块内的 code 不当作行内代码 mark
        parseDOM: [{
            tag: "code",
            getAttrs: dom => (dom as HTMLElement).parentElement?.tagName === "PRE" ? false : null,
        }],
        toDOM() {
            return ["code", 0];
        },
    },
    link: {
        attrs: {href: {}, title: {default: null}},
        inclusive: false,
        parseDOM: [{
            tag: "a[href]",
            getAttrs: (dom: HTMLElement | string) => {
                const el = dom as HTMLElement;
                return {href: el.getAttribute("href"), title: el.getAttribute("title")};
            },
        }],
        toDOM(node) {
            const {href, title} = node.attrs;
            return ["a", {href, title, rel: "noopener noreferrer", target: "_blank"}, 0];
        },
    },
};

export const md_schema = new Schema({nodes, marks});
