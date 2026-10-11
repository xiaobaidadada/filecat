import {Plugin, PluginKey, TextSelection} from "prosemirror-state";
import {Decoration, DecorationSet, EditorView} from "prosemirror-view";
import {Node as PmNode} from "prosemirror-model";
import {is_graph_lang, render_graph, GraphLang, GraphResult} from "./graph_render";
import i18n from "../../../../util/in18resource";

/**
 * ```mermaid / ```svg 代码块的图形预览。
 *
 * 交互约定（与 Typora 一致）：
 *   · 光标在某个图形代码块内 —— 显示源码，方便编辑
 *   · 光标离开该代码块 —— 只看到渲染出来的图，源码不再占位
 *
 * 实现要点：
 *   1) 代码块用 Decoration.node 加 class 隐掉，图用 Decoration.widget 插在
 *      同一位置顶上 —— 这样源码和图不会同时出现。
 *      （不能用 Decoration.node 的 spec.nodeView 直接换掉：prosemirror-view
 *      并不支持在装饰上挂 nodeView，只有 EditorProps.nodeViews 支持。）
 *   2) 渲染是异步的（mermaid 首次还要动态加载约 1MB 的库），所以容器上先
 *      显示「渲染中」，结果回来后再写进去。直接改 DOM，不走 dispatch ——
 *      图形与文档无关，重新派发事务反而会让光标抖动。
 *   3) 结果按「语言 + 源码」缓存，同一段代码在光标反复进出时不重复渲染。
 *   4) 图不可编辑但可点击：单击/双击都把光标送进代码块，从而回到源码态。
 */

export const graph_key = new PluginKey("md-graph");

/** 语言 + 源码 → 渲染结果 */
const cache = new Map<string, GraphResult>();

/** 同一段代码正在渲染时去重，避免同一时刻发起多次相同渲染 */
const pending = new Map<string, Promise<GraphResult>>();

function cache_key(lang: GraphLang, code: string): string {
    return `${lang}\u0000${code}`;
}

function render_cached(lang: GraphLang, code: string): Promise<GraphResult> {
    const key = cache_key(lang, code);
    const hit = cache.get(key);
    if (hit) {
        return Promise.resolve(hit);
    }
    let task = pending.get(key);
    if (!task) {
        task = render_graph(lang, code).then(res => {
            cache.set(key, res);
            pending.delete(key);
            return res;
        });
        pending.set(key, task);
    }
    return task;
}

/**
 * 把光标送进对应的代码块，让图消失、露出源码供编辑。
 */
function enter_code(view: EditorView | null, start: number) {
    if (!view) {
        return;
    }
    const pos = Math.min(start + 1, view.state.doc.content.size);
    view.dispatch(view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(pos), 1),
    ));
    view.focus();
}

/**
 * 图的容器结构：
 *   <div class="md-graph">            ← 外层，管边框与悬停
 *     <div class="md-graph__body">…</div>  ← 图/错误/渲染中，内容可整体替换
 *     <span class="md-graph__hint">点击编辑</span>  ← 悬停才出现
 *   </div>
 * 图和提示分开放，替换图内容时不会把提示一起冲掉。
 */
function fill_body(body: HTMLElement, result: GraphResult) {
    if (result.error) {
        body.className = "md-graph__body";
        body.textContent = result.error;
        return;
    }
    body.className = "md-graph__body";
    body.innerHTML = result.svg;
}

function make_widget(code: string, lang: GraphLang, start: number, get_view: () => EditorView | null): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "md-graph";
    // 图是不可编辑内容：标 contenteditable=false，避免它被当成文本节点参与光标移动
    dom.setAttribute("contenteditable", "false");
    // 点击 / 双击都进入编辑（悬停时右上角出现「点击编辑」提示）
    const on_enter = () => enter_code(get_view(), start);
    dom.addEventListener("click", on_enter);
    dom.addEventListener("dblclick", on_enter);

    const body = document.createElement("div");
    body.className = "md-graph__body";
    const hint = document.createElement("span");
    hint.className = "md-graph__hint";
    hint.textContent = i18n.t("clk_edt");
    dom.append(body, hint);

    const hit = cache.get(cache_key(lang, code));
    if (hit) {
        if (hit.error) {
            dom.classList.add("md-graph--error");
        }
        fill_body(body, hit);
        return dom;
    }
    dom.classList.add("md-graph--loading");
    body.textContent = i18n.t("rendering");
    render_cached(lang, code).then(res => {
        // 节点可能已被 ProseMirror 回收，此时不再写入
        if (!dom.isConnected) {
            return;
        }
        dom.classList.remove("md-graph--loading");
        if (res.error) {
            dom.classList.add("md-graph--error");
        }
        fill_body(body, res);
    });
    return dom;
}

/** 光标（或选区）是否落在 [start, end] 区间内 */
function caret_inside(from: number, to: number, start: number, end: number): boolean {
    return from <= end && to >= start;
}

function build_decorations(state: any, get_view: () => EditorView | null): DecorationSet {
    const decorations: Decoration[] = [];
    const {from, to} = state.selection;
    state.doc.descendants((node: PmNode, pos: number) => {
        if (node.type.name !== "code_block") {
            return;
        }
        const lang = node.attrs.language;
        if (!is_graph_lang(lang)) {
            return;
        }
        const start = pos;
        const end = pos + node.nodeSize;
        // 光标在块内（含拖动选中）时显示源码，不加任何装饰
        if (caret_inside(from, to, start, end)) {
            return;
        }
        const code = node.textContent;
        if (!code.trim()) {
            return;
        }
        // 隐掉源码块，同一位置插上渲染好的图
        decorations.push(Decoration.node(start, end, {class: "md-graph-hidden"}));
        decorations.push(Decoration.widget(end, () => make_widget(code, lang, start, get_view), {
            // side: -1 —— 紧贴在代码块之前，视觉上就落在它原来的位置
            side: -1,
            // 图不参与选区：光标不该落进图里
            ignoreSelection: true,
            // key 带上位置与语言：两个相邻的图形块，前者的 end 就是后者的起点，
            // 位置相同；若 key 只用源码，内容相同的两个块会被 ProseMirror 视为
            // 同一个装饰而丢掉一个。
            key: `graph-${lang}-${start}-${code}`,
        }));
    });
    return DecorationSet.create(state.doc, decorations);
}

export function build_graph_plugin(): Plugin {
    // props.decorations 拿不到 view，而点图需要 view 才能派发事务，
    // 因此这里自己存一份引用，在 view 生命周期里维护。
    let view_ref: EditorView | null = null;
    return new Plugin({
        key: graph_key,
        // 装饰不放进 plugin state，而是在 props.decorations 里实时计算：
        // 只有「光标进出代码块」和「文档变化」两种时机需要重算，
        // 交给 ProseMirror 自己控制重绘节奏，比手工 dispatch 触发更稳（也避免循环）。
        props: {
            decorations(state) {
                const set = build_decorations(state, () => view_ref);
                return set.find().length ? set : null;
            },
        },
        view(editor_view) {
            view_ref = editor_view;
            return {
                destroy() {
                    view_ref = null;
                },
            };
        },
    });
}
