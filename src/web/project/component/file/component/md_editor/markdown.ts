// markdown-it 是 CommonJS 包（module.exports = 构造函数），@types 用 `export =` 声明，
// 所以要用默认导入（依赖 esModuleInterop / allowSyntheticDefaultImports）。
// 注意：不能用 `import MarkdownIt = require("markdown-it")` —— 该语法是 TS 专有，
// 要求模块编译为 CommonJS；前端走 babel（webpack），没有模块转换插件，会直接报错。
import MarkdownIt from "markdown-it";
import {DOMParser as PMDOMParser, Node as PMNode} from "prosemirror-model";
import {md_schema} from "./schema";
import {encode_html} from "./md_html";
import {is_math_lang} from "./md_math";

// Markdown ⇄ ProseMirror 文档 的双向转换。
//
// 解析方向：markdown-it 先渲染成 HTML，再由 ProseMirror 按 schema 的 parseDOM 建文档。
// 但 HTML 块是例外 —— 见 parse_html_block。
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

/**
 * 把 HTML 块包进一个带标记的容器，让它在渲染成 HTML 后仍能被认出来。
 *
 * 默认行为是 `<p align="center">...</p>` 原样输出，DOMParser 会把它当普通
 * 段落拆掉、原文永久丢失 —— 保存时用户写的 HTML 就被改写没了。
 * 包一层 `<div data-html-block="原文">` 后，schema 里同名规则就能接住整段原文。
 * 原文用 base64 承载（见 md_html 的 encode_html），避免破坏属性结构。
 */
md.renderer.rules.html_block = (tokens, idx) => {
    return `<div data-html-block="${encode_html(tokens[idx].content)}"></div>`;
};

/** 行内 HTML 同理，换成 span 承载原文 */
md.renderer.rules.html_inline = (tokens, idx) => {
    return `<span data-html-inline="${encode_html(tokens[idx].content)}"></span>`;
};

// ---------------------------------------------------------------------------
// 数学公式
// ---------------------------------------------------------------------------
//
// 两种入口：
//   · 行内 $...$ / \(...\)
//   · 块级 $$...$$ / \[...\]
//
// 块级公式在 Markdown 里通常是独立成段的一行，交给 md.block 规则处理；
// 行内公式交给 md.inline 规则，插在普通文本流里。
//
// 都走「渲染成带标记的 HTML 容器 + 原文用 base64 承载」这条路，
// 与 HTML 块同一个原理：schema 里同名规则接住整段原文，不改写用户写的东西。

/** 判断某个内联 token 序列是不是一整段公式（用于行内公式的判定） */
function parse_inline_math(state: any, silent: boolean): boolean {
    const start = state.pos;
    const src = state.src;
    const delims = [
        {open: "\\(", close: "\\)"},
        {open: "$", close: "$"},
    ];
    // $$ 开头是块级公式的领地，行内规则不碰，否则会把 $$ 拆成两个 $
    if (src.startsWith("$$", start)) {
        return false;
    }
    for (const d of delims) {
        if (!src.startsWith(d.open, start)) {
            continue;
        }
        const from = start + d.open.length;
        const end = src.indexOf(d.close, from);
        if (end < 0) {
            continue;
        }
        const tex = src.slice(from, end);
        if (!tex.trim()) {
            continue;
        }
        // $ 行内公式遵循 CommonMark 社区惯例：结尾的 $ 后面不能紧挨数字，
        // 避免把「价格 $5 到 $10」这种文本误判成公式
        if (d.open === "$") {
            const after = src[end + 1];
            if (after !== undefined && /\d/.test(after)) {
                continue;
            }
        }
        if (!silent) {
            const token = state.push("math_inline", "span", 0);
            token.content = tex;
            token.markup = d.open;
            // 含定界符的原文：schema 靠它还原 raw/tex，保存时原样写回
            token.meta = {raw: src.slice(start, end + d.close.length)};
        }
        state.pos = end + d.close.length;
        return true;
    }
    return false;
}

/** 块级公式：$$...$$ 或 \[...\] 独占一段 */
function parse_block_math(state: any, startLine: number, endLine: number, silent: boolean): boolean {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const first = state.src.slice(start, max).trim();
    const pairs = [
        {open: "\\[", close: "\\]"},
        {open: "$$", close: "$$"},
    ];
    for (const p of pairs) {
        if (!first.startsWith(p.open)) {
            continue;
        }
        // 同一行就闭合：$$\frac{a}{b}$$
        if (first.endsWith(p.close) && first.length > p.open.length + p.close.length) {
            if (silent) {
                return true;
            }
            const tex = first.slice(p.open.length, first.length - p.close.length);
            const token = state.push("math_block", "div", 0);
            token.content = tex;
            token.markup = p.open;
            token.meta = {raw: first};
            token.map = [startLine, startLine + 1];
            state.line = startLine + 1;
            return true;
        }
        // 跨行：往后找闭合行
        const open_body = first.slice(p.open.length);
        for (let line = startLine + 1; line < endLine; line++) {
            const ls = state.bMarks[line] + state.tShift[line];
            const le = state.eMarks[line];
            const text = state.src.slice(ls, le);
            if (!text.trimEnd().endsWith(p.close)) {
                continue;
            }
            if (silent) {
                return true;
            }
            const body = [open_body, ...state.getLines(startLine + 1, line, state.tShift[startLine], false).split("\n")]
                .filter((l, i) => !(i === 0 && !l.trim()));
            const last_line = text.trimEnd().slice(0, -p.close.length);
            body.push(last_line);
            const token = state.push("math_block", "div", 0);
            token.content = body.join("\n").trim();
            token.markup = p.open;
            token.map = [startLine, line + 1];
            // 含定界符的完整原文（按源码原样切，不重新拼装，避免多行时丢换行）
            token.meta = {raw: state.src.slice(start, state.eMarks[line]).trimEnd()};
            state.line = line + 1;
            return true;
        }
    }
    return false;
}

// 行内规则插在「转义符」之后、"emphasis" 之前，保证 $ 优先于其它行内语法
md.inline.ruler.before("escape", "math_inline", parse_inline_math);
// 块级规则插在 "fence" 之前，让 $$ / \[ 先于普通段落被识别
md.block.ruler.before("fence", "math_block", parse_block_math, {alt: ["paragraph", "reference", "blockquote", "list"]});

md.renderer.rules.math_inline = (tokens, idx) => {
    return `<span data-math-inline="${encode_html(tokens[idx].meta.raw as string)}"></span>`;
};

md.renderer.rules.math_block = (tokens, idx) => {
    return `<div data-math-block="${encode_html(tokens[idx].meta.raw as string)}"></div>`;
};

// ```math / ```latex / ```katex 代码块也当公式处理：同样渲染成公式容器，
// 原文包在容器里。用代码块写公式是网上 md 的常见写法，不接管就会漏。
// 代码块本身没有定界符，补上 $$ 让它成为合法公式（与预览页同一处理）。
const default_fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().toLowerCase();
    if (is_math_lang(lang)) {
        return `<div data-math-block="${encode_html(`$$\n${token.content.trim()}\n$$`)}"></div>`;
    }
    return default_fence(tokens, idx, options, env, self);
};

/** Markdown 文本 → ProseMirror 文档 */
export function markdown_to_doc(markdown: string): PMNode {
    const html = md.render(markdown ?? "");
    // 用 DOMParser 而不是 container.innerHTML：
    // innerHTML 解析出的 <img src="./x.png"> 属于「活动文档」的一部分，
    // 浏览器会立即按页面 URL 去请求它（相对路径必然 404，还会污染控制台）；
    // DOMParser 产出的是惰性文档，不会发起任何资源请求。
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return PMDOMParser.fromSchema(md_schema).parse(parsed.body);
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
        } else if (child.type.name === "html_inline") {
            // 行内 HTML 原样输出，不做转义
            out += child.attrs.value;
        } else if (child.type.name === "math_inline") {
            // 行内公式原样输出（含用户写的定界符），保证保存内容零变化
            out += child.attrs.raw;
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
        case "html_block": {
            // HTML 块原样输出（含多行）。
            // 末尾的换行必须去掉：块之间由 serialize_children 用空行连接，
            // 原文自带的收尾 \n 会在连接处多顶出一个空行。
            const text = (node.attrs.value as string).replace(/\n+$/, "");
            return text.split("\n").map((l: string) => indent + l).join("\n");
        }
        case "math_block": {
            // 块级公式原样输出。多行公式每行都要跟着 indent，
            // 否则在列表/引用里会漏到块外。
            const text = (node.attrs.raw as string).replace(/\n+$/, "");
            return text.split("\n").map((l: string) => indent + l).join("\n");
        }
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
function serialize_children(node: PMNode | {forEach: (cb: (child: PMNode) => void) => void}, indent = ""): string {
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

/**
 * 把一段选区（Slice）序列化成 Markdown 文本，供复制到外部时使用。
 *
 * 为什么要单独做：ProseMirror 默认的 text/plain 输出是「渲染后的纯文本」，
 * 复制出去会丢掉 # 标题、```js 围栏、** 加粗 等标记，
 * 粘贴到别处就变成一堆没有格式的裸文字。这里改走 Markdown 原文序列化，
 * 复制到任何文本编辑器里都是合法的 Markdown。
 *
 * 一个例外：源码模式下整篇文档就是一个 ```markdown 代码块，
 * 全选复制时若照常序列化，会平白多出一层 ``` 外框，粘到另一个 md 里
 * 就变成「整篇被包进代码块」。这种「内容本身就是 Markdown 原文」的情况，
 * 直接取代码块内部文本即可。
 *
 * slice.content 是 Fragment，与节点一样支持 forEach，可直接复用 serialize_children。
 */
export function slice_to_markdown(slice: {content: PMNode | any}): string {
    const nodes: PMNode[] = [];
    slice.content.forEach((child: PMNode) => nodes.push(child));
    if (nodes.length === 1 && nodes[0].type.name === "code_block" && nodes[0].attrs.language === "markdown") {
        // 源码模式：内容已经是 Markdown 源码，去掉外层围栏再输出
        return nodes[0].textContent.replace(/\n*$/, "") + "\n";
    }
    return serialize_children(slice.content).trim() + "\n";
}
