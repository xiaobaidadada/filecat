/**
 * 数学公式的渲染：行内 $...$ / \(...\)，块级 $$...$$ / \[...\]，以及 ```math 代码块。
 *
 * 与 graph_render.ts 同一套思路：源码字符串 → HTML 字符串，调用方拿到后
 * 直接塞进容器即可，不关心公式是怎么排出来的。
 *
 * 定界符的识别与剥离放在这里，是为了让编辑器（ProseMirror）和预览页
 * （markdown-it）共用同一份判断逻辑 —— 两边各写一套迟早会不一致。
 *
 * KaTeX 体积不小（约 270KB），全程动态 import：文档里真的出现公式才加载。
 *
 * 「合法就排版、不合法保留源码」是硬性约定：编辑器里正在输入的公式
 * 天然会有一段时间是不合法的，绝不能因此抛错打断编辑。
 */

import {decode_html} from "./md_html";
// KaTeX 的排版样式与字体。放在这里而不是各自组件里 ——
// 编辑器与预览页都 import 本模块，样式天然只有一份。
// 字体由 webpack 的字体规则产出（见 webpack.web.config.js）。
import "katex/dist/katex.min.css";

/** 渲染结果 */
export interface MathResult {
    /** 排版后的 HTML；失败时为空串 */
    html: string;
    /** 失败原因（语法错误等），渲染成功时为 null */
    error: string | null;
}

/** 公式的两种排布方式：行内（跟着文字走）与块级（独立成行居中） */
export type MathMode = "inline" | "block";

/** 支持公式的语言标记：```math / ```latex / ```katex 都当作公式代码块 */
export const MATH_LANGS = ["math", "latex", "katex"] as const;

export type MathLang = typeof MATH_LANGS[number];

/** 该语言标记是否表示一个公式代码块 */
export function is_math_lang(lang: string): lang is MathLang {
    return (MATH_LANGS as readonly string[]).includes(lang.toLowerCase());
}

/**
 * 定界符表：开头 / 结尾一一对应。
 *
 * 顺序有讲究 —— `$$` 必须排在 `$` 前面，否则 `$$x$$` 会被当成
 * 「空行内公式 + x + 空行内公式」。同理 `\(` 排在 `(` 之前没有意义，
 * 但保持成对书写更直观。
 */
const DELIMITERS: {open: string; close: string; mode: MathMode}[] = [
    {open: "$$", close: "$$", mode: "block"},
    {open: "\\[", close: "\\]", mode: "block"},
    {open: "\\(", close: "\\)", mode: "inline"},
    {open: "$", close: "$", mode: "inline"},
];

/** 剥离定界符后的公式 */
export interface UnwrappedMath {
    /** 定界符内部的 LaTeX 源码 */
    tex: string;
    mode: MathMode;
    /**
     * 原始写法，含定界符。保存时必须原样写回这个 ——
     * 用户写的是 \[ \]，不能擅自改写成 $$ $$，否则每次保存文件都在变。
     */
    raw: string;
}

/**
 * 从一段文本里剥出公式。
 *
 * 只在「整段就是公式」时才算数：块级要首尾都是定界符，行内同理。
 * 不做「从长文本里挑出公式」的活 —— 那是 markdown-it 解析器的事，
 * 这里只管单块内容的判定，保证两侧行为一致。
 *
 * 不匹配时返回 null，调用方按普通文本处理。
 */
export function unwrap_math(source: string): UnwrappedMath | null {
    const raw = source.trim();
    if (!raw) {
        return null;
    }
    for (const d of DELIMITERS) {
        // 最短合法长度：定界符占两头，中间至少有内容
        if (raw.length <= d.open.length + d.close.length) {
            continue;
        }
        if (!raw.startsWith(d.open) || !raw.endsWith(d.close)) {
            continue;
        }
        const tex = raw.slice(d.open.length, raw.length - d.close.length);
        // $$ 与 $ 的区分要再看一眼：以 $$ 开头却以单个 $ 结尾的不算合法
        if (d.open === "$" && raw.startsWith("$$")) {
            continue;
        }
        if (!tex.trim()) {
            continue;
        }
        return {tex, mode: d.mode, raw};
    }
    return null;
}

/**
 * 判断一段文本是行内公式还是块级公式 —— 只按定界符本身判断，
 * 不看上下文。markdown-it 的规则与 ProseMirror 的解析都依赖它。
 */
export function math_mode_of(source: string): MathMode | null {
    return unwrap_math(source)?.mode ?? null;
}

/** KaTeX 实例的加载缓存：并发调用只加载一次 */
let katex_task: Promise<typeof import("katex")> | null = null;

/**
 * 加载 KaTeX。
 *
 * katex 的 exports 里 "import" 指向 dist/katex.mjs —— 纯 ESM、只有命名导出，
 * 没有 default（webpack 会走这条 ESM 路径，拿 mod.default 只会得到 undefined）。
 * 所以这里按命名导出取整个模块命名空间。
 */
function load_katex(): Promise<typeof import("katex")> {
    if (!katex_task) {
        katex_task = import("katex");
    }
    return katex_task;
}

/** 渲染结果缓存：编辑器里光标一动就会重算，同一公式不该反复排版 */
const cache = new Map<string, MathResult>();

/** 缓存上限，防止长文档反复编辑把内存撑大 */
const CACHE_MAX = 500;

/**
 * 把 LaTeX 源码排成 HTML。
 *
 * 语法错误不抛错，而是把 reason 放进 error —— 编辑器里正在输入的公式
 * 天然会有一段时间是不合法的（比如 a^2+b 还没写完），抛错会打断编辑。
 */
export async function render_math(tex: string, mode: MathMode): Promise<MathResult> {
    const source = tex.trim();
    if (!source) {
        return {html: "", error: null};
    }
    const key = `${mode}\u0000${source}`;
    const hit = cache.get(key);
    if (hit) {
        return hit;
    }
    let result: MathResult;
    try {
        // 直接用命名导出的 renderToString（katex.mjs 没有 default 导出）
        const {renderToString} = await load_katex();
        const html = renderToString(source, {
            displayMode: mode === "block",
            // 语法错误交给我们自己展示，不要让它抛异常
            throwOnError: false,
            // 宽松模式：未知命令只提示不报错，中文、Unicode 都放行
            strict: false,
            trust: false,
            output: "html",
        });
        result = {html, error: null};
    } catch (e: any) {
        result = {html: "", error: e?.message ?? String(e)};
    }
    if (cache.size >= CACHE_MAX) {
        cache.clear();
    }
    cache.set(key, result);
    return result;
}

/** 清空渲染缓存（主题切换等需要强制重排的场景用） */
export function clear_math_cache() {
    cache.clear();
}

/**
 * 生成公式容器的 DOM —— 编辑器与预览页共用同一份结构，
 * 保证两处观感一致，也让 CSS 只需写一套。
 *
 * 失败时容器保留源码文本并标记 --error，用户能看到自己写的东西、
 * 也能继续改，不会出现「一块空白不知道哪错了」。
 */
export async function mount_math(holder: HTMLElement, tex: string, mode: MathMode, raw: string) {
    const res = await render_math(tex, mode);
    // 等待期间容器可能已被替换（文档重新解析、组件卸载）
    if (!holder.isConnected) {
        return;
    }
    holder.classList.remove("md-math--loading", "md-math--error");
    if (res.error) {
        holder.classList.add("md-math--error");
        holder.textContent = raw;
        holder.title = res.error;
        return;
    }
    holder.innerHTML = res.html;
}

// ---------------------------------------------------------------------------
// markdown-it 插件（预览页用）
// ---------------------------------------------------------------------------
//
// 编辑器那边走的是「markdown → HTML → ProseMirror 解析」，
// 预览页走的是「markdown → HTML → innerHTML」，两条链路都要能认出公式。
// 识别规则写在同一个文件里，两边行为才不会漂移。

/** 行内公式规则：$...$ 与 \(...\) */
function math_inline_rule(state: any, silent: boolean): boolean {
    const start = state.pos;
    const src = state.src;
    // $$ 开头是块级公式，行内规则不碰
    if (src.startsWith("$$", start)) {
        return false;
    }
    const pairs = [
        {open: "\\(", close: "\\)"},
        {open: "$", close: "$"},
    ];
    for (const p of pairs) {
        if (!src.startsWith(p.open, start)) {
            continue;
        }
        const from = start + p.open.length;
        const end = src.indexOf(p.close, from);
        if (end < 0) {
            continue;
        }
        const tex = src.slice(from, end);
        if (!tex.trim()) {
            continue;
        }
        // $ 行内公式：结尾 $ 后紧挨数字的不算（避免把「$5 到 $10」当公式）
        if (p.open === "$") {
            const after = src[end + 1];
            if (after !== undefined && /\d/.test(after)) {
                continue;
            }
        }
        if (!silent) {
            const token = state.push("math_inline", "span", 0);
            token.content = tex;
            // 带上含定界符的原文：保存时要原样写回，不能只剩剥好的公式体
            token.markup = p.open;
            token.meta = {raw: src.slice(start, end + p.close.length)};
        }
        state.pos = end + p.close.length;
        return true;
    }
    return false;
}

/** 块级公式规则：$$...$$ 与 \[...\]（可单行可跨行） */
function math_block_rule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
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
        // 单行闭合：$$\frac{a}{b}$$
        if (first.endsWith(p.close) && first.length > p.open.length + p.close.length) {
            if (silent) {
                return true;
            }
            const token = state.push("math_block", "div", 0);
            token.content = first.slice(p.open.length, first.length - p.close.length);
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
            const body: string[] = [];
            if (open_body.trim()) {
                body.push(open_body);
            }
            state.getLines(startLine + 1, line, state.tShift[startLine], false)
                .split("\n")
                .forEach((l: string) => body.push(l));
            body.push(text.trimEnd().slice(0, -p.close.length));
            const token = state.push("math_block", "div", 0);
            token.content = body.join("\n").trim();
            token.markup = p.open;
            // 含定界符的完整原文（按源码原样切，不重新拼装，避免多行时丢换行）
            token.meta = {raw: state.src.slice(start, state.eMarks[line]).trimEnd()};
            token.map = [startLine, line + 1];
            state.line = line + 1;
            return true;
        }
    }
    return false;
}

/**
 * 把公式能力装到 markdown-it 实例上。
 *
 * 渲染成 `<span data-math-inline="base64">` / `<div data-math-block="base64">` ——
 * 与编辑器侧完全同一份结构，于是两边可以用同一个 CSS、同一个挂载函数。
 * 原文走 base64（同 HTML 块的做法），避免 LaTeX 里的引号、尖括号破坏 HTML 属性。
 */
export function install_math(md: any, encode: (raw: string) => string) {
    md.inline.ruler.before("escape", "math_inline", math_inline_rule);
    md.block.ruler.before("fence", "math_block", math_block_rule, {
        alt: ["paragraph", "reference", "blockquote", "list"],
    });
    // 属性里放「含定界符的原文」：schema 那边靠它还原 raw 与 tex，
    // 保存时也是原样写回 raw —— 这是零 diff 的前提。
    md.renderer.rules.math_inline = (tokens: any[], idx: number) =>
        `<span data-math-inline="${encode(tokens[idx].meta.raw)}"></span>`;
    md.renderer.rules.math_block = (tokens: any[], idx: number) =>
        `<div data-math-block="${encode(tokens[idx].meta.raw)}"></div>`;

    // ```math / ```latex / ```katex 代码块也当公式，与编辑器侧同一套判定。
    // 代码块没有定界符，原文就是内容本身，补上 $$ 让它成为一个合法公式。
    const prev_fence = md.renderer.rules.fence || function (tokens: any[], idx: number, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
        if (is_math_lang(tokens[idx].info.trim())) {
            return `<div data-math-block="${encode(`$$\n${tokens[idx].content.trim()}\n$$`)}"></div>`;
        }
        return prev_fence(tokens, idx, options, env, self);
    };
}

/**
 * 渲染完成后，把页面里所有公式容器填上排版结果。
 *
 * 与 render_graph_blocks 同一节奏：DOM 出来后逐个异步填充，
 * 容器已经不在文档里的（内容被重新渲染过）直接跳过。
 */
export async function render_math_blocks(root: HTMLElement) {
    const holders = root.querySelectorAll<HTMLElement>("[data-math-inline], [data-math-block]");
    for (const holder of Array.from(holders)) {
        const inline_raw = holder.getAttribute("data-math-inline");
        const block_raw = holder.getAttribute("data-math-block");
        const encoded = inline_raw ?? block_raw;
        if (encoded === null) {
            continue;
        }
        const raw = decode_html(encoded);
        const parsed = unwrap_math(raw);
        if (!parsed) {
            continue;
        }
        const mode: MathMode = inline_raw !== null ? "inline" : "block";
        holder.classList.add("md-math", mode === "block" ? "md-math--block" : "md-math--inline");
        await mount_math(holder, parsed.tex, mode, parsed.raw);
    }
}

