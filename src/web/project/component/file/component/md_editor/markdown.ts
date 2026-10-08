// markdown-it 是 CommonJS 包（module.exports = 构造函数），@types 用 `export =` 声明，
// 所以要用默认导入（依赖 esModuleInterop / allowSyntheticDefaultImports）。
// 注意：不能用 `import MarkdownIt = require("markdown-it")` —— 该语法是 TS 专有，
// 要求模块编译为 CommonJS；前端走 babel（webpack），没有模块转换插件，会直接报错。
import MarkdownIt from "markdown-it";
import {DOMParser as PMDOMParser, Node as PMNode} from "prosemirror-model";
import {md_schema} from "./schema";

// Markdown ⇄ ProseMirror 文档 的双向转换。
//
// 解析方向：markdown-it 渲染成 HTML → ProseMirror 依据 schema 的 parseDOM 规则建文档。
// 序列化方向：自己实现，输出干净稳定的 Markdown。
//
// 之所以不复用 prosemirror-markdown：它的 schema 无法直接吃我们这份带表格的 schema，
// 而序列化规则本身很短，自己写更能控制输出格式（例如表格对齐行的写法）。

const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    // GFM 表格（默认开启，这里显式声明意图）
    typographer: false,
});

/** Markdown 文本 → ProseMirror 文档 */
export function markdown_to_doc(markdown: string): PMNode {
    const html = md.render(markdown ?? "");
    const container = document.createElement("div");
    container.innerHTML = html;
    return PMDOMParser.fromSchema(md_schema).parse(container);
}

// ---------------------------------------------------------------------------
// 序列化
// ---------------------------------------------------------------------------

// 转义 Markdown 中有特殊含义的字符
function escape_text(text: string): string {
    return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

// 单元格内的竖线必须转义，否则会把一行拆成更多列
function escape_cell(text: string): string {
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** 序列化行内内容（文本 + marks） */
function serialize_inline(node: PMNode): string {
    let out = "";
    node.forEach(child => {
        if (child.isText) {
            // 行内代码内部不做转义，否则反引号里的内容会变形
            const in_code = child.marks.some(m => m.type.name === "code");
            let text = in_code ? (child.text ?? "") : escape_text(child.text ?? "");
            for (const mark of child.marks) {
                switch (mark.type.name) {
                    case "code":
                        text = `\`${child.text ?? ""}\``;
                        break;
                    case "strong":
                        text = `**${text}**`;
                        break;
                    case "em":
                        text = `*${text}*`;
                        break;
                    case "strike":
                        text = `~~${text}~~`;
                        break;
                    case "link":
                        text = `[${text}](${mark.attrs.href}${mark.attrs.title ? ` "${mark.attrs.title}"` : ""})`;
                        break;
                }
            }
            out += text;
        } else if (child.type.name === "image") {
            const {src, alt, title} = child.attrs;
            out += `![${alt ?? ""}](${src}${title ? ` "${title}"` : ""})`;
        } else if (child.type.name === "hard_break") {
            out += "  \n";
        }
    });
    return out;
}

/** 序列化表格（含对齐行） */
function serialize_table(node: PMNode): string {
    const rows: {cells: string[], header_flags: boolean[]}[] = [];
    node.forEach(row => {
        const cells: string[] = [];
        const header_flags: boolean[] = [];
        row.forEach(cell => {
            cells.push(escape_cell(cell.textContent).trim());
            header_flags.push(cell.type.name === "table_header");
        });
        rows.push({cells, header_flags});
    });
    if (rows.length === 0) {
        return "";
    }
    const cols = Math.max(...rows.map(r => r.cells.length));
    const first_is_header = rows[0].header_flags.some(f => f);

    // 列宽：按显示宽度取该列最大值（表格对齐是 Markdown 表格可读性的关键）
    const widths = Array.from({length: cols}, (_, i) =>
        Math.max(3, ...rows.map(r => display_width(r.cells[i] ?? "")))
    );
    const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - display_width(text)));
    const line = (cells: string[]) =>
        `| ${Array.from({length: cols}, (_, i) => pad(cells[i] ?? "", widths[i])).join(" | ")} |`;

    const out: string[] = [];
    // 没有表头时补一行占位表头（Markdown 表格语法强制要求）
    if (first_is_header) {
        out.push(line(rows[0].cells));
        out.push(`| ${widths.map(w => "-".repeat(w)).join(" | ")} |`);
        for (let i = 1; i < rows.length; i++) {
            out.push(line(rows[i].cells));
        }
    } else {
        out.push(line(new Array(cols).fill("")));
        out.push(`| ${widths.map(w => "-".repeat(w)).join(" | ")} |`);
        for (const r of rows) {
            out.push(line(r.cells));
        }
    }
    return out.join("\n");
}

/** 可打印宽度：CJK / 全角字符按 2 列计算（否则中英混排的表格对不齐） */
function display_width(s: string): number {
    let w = 0;
    for (const ch of s) {
        const code = ch.codePointAt(0) ?? 0;
        const wide =
            (code >= 0x1100 && code <= 0x115f) ||
            (code >= 0x2e80 && code <= 0xa4cf) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xfe30 && code <= 0xfe6f) ||
            (code >= 0xff00 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6);
        w += wide ? 2 : 1;
    }
    return w;
}

/** 序列化单个块级节点（indent 用于列表内的嵌套层级） */
function serialize_block(node: PMNode, indent = ""): string {
    switch (node.type.name) {
        case "paragraph":
            return indent + serialize_inline(node);
        case "heading":
            return `${indent}${"#".repeat(node.attrs.level)} ${serialize_inline(node)}`;
        case "blockquote": {
            const inner = serialize_children(node, "");
            return inner.split("\n").map(l => `${indent}> ${l}`).join("\n");
        }
        case "code_block": {
            const lang = node.attrs.language ?? "";
            const text = node.textContent;
            // 内容里若含连续反引号，围栏必须比它更长，否则会被误判为围栏结束而截断
            let fence_len = 3;
            for (const run of text.match(/`+/g) ?? []) {
                fence_len = Math.max(fence_len, run.length + 1);
            }
            const fence = "`".repeat(fence_len);
            // 内容每行都要跟着 indent，否则在列表内围栏会被判定提前结束，内容漏到代码块外
            const body = text.split("\n").map(l => indent + l).join("\n");
            return `${indent}${fence}${lang}\n${body}\n${indent}${fence}`;
        }
        case "horizontal_rule":
            return `${indent}---`;
        case "bullet_list": {
            const lines: string[] = [];
            node.forEach((li, _off, index) => {
                lines.push(serialize_list_item(li, indent, `${indent}- `, `${indent}  `, index));
            });
            return lines.join("\n");
        }
        case "ordered_list": {
            const lines: string[] = [];
            const start = node.attrs.order ?? 1;
            node.forEach((li, _off, index) => {
                lines.push(serialize_list_item(li, indent, `${indent}${start + index}. `, `${indent}   `, index));
            });
            return lines.join("\n");
        }
        case "table":
            return serialize_table(node)
                .split("\n")
                .map(l => indent + l)
                .join("\n");
        default:
            return indent + serialize_inline(node);
    }
}

/** 列表项：首行接在 marker 之后，后续块按缩进对齐 */
function serialize_list_item(li: PMNode, indent: string, marker: string, child_indent: string, _index: number): string {
    const checkbox = li.attrs.checked;
    const box = checkbox === null ? "" : checkbox ? "[x] " : "[ ] ";
    const parts: string[] = [];
    li.forEach((child, _off, i) => {
        parts.push(i === 0 ? serialize_block(child, "") : serialize_block(child, child_indent));
    });
    const body_lines = parts.join("\n").split("\n");
    return marker + box + body_lines[0] + (body_lines.length > 1 ? "\n" + body_lines.slice(1).join("\n") : "");
}

/** 序列化一组块级节点，块之间空一行 */
function serialize_children(node: PMNode, indent = ""): string {
    const blocks: string[] = [];
    node.forEach(child => {
        blocks.push(serialize_block(child, indent));
    });
    return blocks.join("\n\n");
}

/** ProseMirror 文档 → Markdown 文本 */
export function doc_to_markdown(doc: PMNode): string {
    return serialize_children(doc).trim() + "\n";
}
