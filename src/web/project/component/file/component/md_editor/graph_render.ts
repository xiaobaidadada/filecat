/**
 * 图形代码块的渲染：```mermaid 与 ```svg。
 *
 * 两者统一成「源码字符串 → SVG 字符串」的形式，调用方（编辑器 / 预览页）
 * 拿到 svg 后直接塞进容器即可，不需要关心具体是哪种语言。
 *
 * mermaid 体积很大（gzip 后约 1MB），全程动态 import：
 * 只有文档里真的出现 ```mermaid 代码块时才会去加载它，不影响首屏。
 * ```svg 则完全零依赖，浏览器原生就能画。
 *
 * 两者都遵循「合法就画、不合法给提示」，不抛错 ——
 * 编辑器里正在输入的代码天然会有一段时间是不合法的。
 */

/** 渲染结果 */
export interface GraphResult {
    /** 渲染成功的 SVG 源码；失败时为空串 */
    svg: string;
    /** 失败原因（语法错误等），渲染成功时为 null */
    error: string | null;
}

/** 需要渲染成图形的代码块语言 */
export const GRAPH_LANGS = ["mermaid", "svg"] as const;

export type GraphLang = typeof GRAPH_LANGS[number];

/** 该语言是否走图形渲染 */
export function is_graph_lang(lang: string): lang is GraphLang {
    return (GRAPH_LANGS as readonly string[]).includes(lang);
}

/** mermaid 实例的加载缓存：并发调用只加载一次 */
let mermaid_task: Promise<any> | null = null;

function load_mermaid(): Promise<any> {
    if (!mermaid_task) {
        mermaid_task = import("mermaid").then(mod => {
            const mermaid = mod.default;
            mermaid.initialize({
                // 由我们手动调用 render，不需要它自动扫描 DOM
                startOnLoad: false,
                // 只输出 SVG，不往页面里注入临时容器
                securityLevel: "loose",
                theme: "default",
                fontFamily: "inherit",
                // 语法错误交给我们自己展示，不让它往 DOM 里插错误图
                suppressErrorRendering: true,
            });
            return mermaid;
        });
    }
    return mermaid_task;
}

/** 自增 id：mermaid.render 要求每次调用有唯一 id，重复会串图 */
let render_seq = 0;

/**
 * 把 mermaid 源码渲染成 SVG 字符串。
 * 语法错误不抛错，而是把错误信息放到 result.error 里 —— 编辑器里正在输入的
 * 代码天然会有一段时间是不合法的，抛错会打断编辑。
 */
async function render_mermaid(code: string): Promise<GraphResult> {
    const text = code.trim();
    if (!text) {
        return {svg: "", error: null};
    }
    const mermaid = await load_mermaid();
    const id = `md-mermaid-${++render_seq}`;
    try {
        const {svg} = await mermaid.render(id, text);
        return {svg, error: null};
    } catch (e: any) {
        // render 失败时 mermaid 可能把半成品节点留在 body 里，清掉避免页面出脏东西
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        return {svg: "", error: e?.message ?? String(e)};
    }
}

/**
 * 直接使用写好的 SVG 源码。
 * 零依赖 —— 浏览器自己会解析，这里只做一次「能不能被解析」的校验，
 * 让写错的标签能给出提示而不是默默什么都不显示。
 */
function render_svg(code: string): GraphResult {
    const text = code.trim();
    if (!text) {
        return {svg: "", error: null};
    }
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    // 解析失败时浏览器会把错误塞进 parsererror 节点
    const err = doc.querySelector("parsererror");
    if (err) {
        return {svg: "", error: err.textContent?.trim() || "SVG 解析失败"};
    }
    return {svg: text, error: null};
}

/** 按语言渲染，统一入口 */
export async function render_graph(lang: GraphLang, code: string): Promise<GraphResult> {
    if (lang === "svg") {
        return render_svg(code);
    }
    return render_mermaid(code);
}
