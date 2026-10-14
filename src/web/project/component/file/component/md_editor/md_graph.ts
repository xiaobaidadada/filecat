import {Plugin, PluginKey, TextSelection} from "prosemirror-state";
import {Decoration, DecorationSet, EditorView} from "prosemirror-view";
import {Node as PmNode} from "prosemirror-model";
import {is_graph_lang, render_graph, GraphLang, GraphResult} from "./graph_render";
import {is_mind_lang, prepare_mind, MindMount} from "./mind_graph";
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
 *   4) 图的交互：单击图 → 全屏放大；点右上角悬停出现的「点击编辑」按钮 → 光标
 *      进入代码块回到源码态。放大与编辑分开，避免查看图形时误触发编辑。
 */

export const graph_key = new PluginKey("md-graph");

/**
 * 打开全屏思维导图编辑器。
 * @param code 当前代码块内容（原始文本）
 * @param write_back 编辑完成后写回代码块（传入新的数据文本）
 */
export type OpenMindHandler = (code: string, write_back: (data_str: string) => void) => void;

/** 语言 + 源码 → 渲染结果 */
const cache = new Map<string, GraphResult>();

/** 同一段代码正在渲染时去重，避免同一时刻发起多次相同渲染 */
const pending = new Map<string, Promise<GraphResult>>();

/** 思维导图结果是组件而非字符串，单独缓存（key 与图形一致，前缀区分） */
const mind_cache = new Map<string, MindMount>();
const mind_pending = new Map<string, Promise<MindMount>>();

function cache_key(lang: string, code: string): string {
    return `${lang}\u0000${code}`;
}

/**
 * 带缓存的异步渲染：同一「语言 + 源码」只算一次，进行中的请求去重。
 * 图形（mermaid/svg）与思维导图结果类型不同，各自用一份 Map 存储。
 */
function make_cached<T>(store: Map<string, T>, running: Map<string, Promise<T>>, build: (lang: string, code: string) => Promise<T>) {
    return (lang: string, code: string): Promise<T> => {
        const key = cache_key(lang, code);
        const hit = store.get(key);
        if (hit) {
            return Promise.resolve(hit);
        }
        let task = running.get(key);
        if (!task) {
            task = build(lang, code).then(res => {
                store.set(key, res);
                running.delete(key);
                return res;
            });
            running.set(key, task);
        }
        return task;
    };
}

const render_cached = make_cached(cache, pending, (lang, code) => render_graph(lang as GraphLang, code));
const mind_cached = make_cached(mind_cache, mind_pending, (lang, code) => prepare_mind(code));

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
 * 全屏放大预览（只读查看）。仅用于 mermaid / svg 图形，思维导图走项目编辑器。
 *
 * 为什么自己画一层遮罩，而不是复用全局的 `$stroe.file_preview`：
 *   1) 编辑器本身就是一个 z-index:1000 的全屏浮层，file_preview 也是 1000，
 *      两者同层，谁盖住谁取决于挂载顺序，不可靠；这里用更高的 z-index 保证在最上层。
 *   2) 图形是 SVG 字符串而不是可访问的 URL，走 file_preview 得先转 blob URL，
 *      还要管 revoke，反而更绕。
 *
 * 交互：点遮罩空白处或右上角关闭按钮退出。
 */
function open_zoom(mount: (el: HTMLElement) => (() => void) | void) {
    const mask = document.createElement("div");
    mask.className = "md-graph-zoom";

    const body = document.createElement("div");
    body.className = "md-graph-zoom__body";
    // 挂载内容返回的卸载函数（目前 svg/mermaid 无需卸载，保留扩展位）
    let unmount: (() => void) | void;

    const close = document.createElement("button");
    close.className = "md-graph-zoom__close";
    close.type = "button";
    close.title = i18n.t("取消");
    close.innerHTML = '<i class="material-icons">close</i>';

    // 点遮罩空白处关闭；点图本身不关闭（方便以后扩展缩放/拖动）
    const on_mask_click = (e: MouseEvent) => {
        if (e.target === mask) {
            destroy();
        }
    };
    const on_key = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            destroy();
        }
    };
    function destroy() {
        if (typeof unmount === "function") {
            unmount();
        }
        document.removeEventListener("keydown", on_key);
        mask.remove();
    }

    mask.addEventListener("click", on_mask_click);
    close.addEventListener("click", destroy);
    document.addEventListener("keydown", on_key);
    mask.append(body, close);
    document.body.appendChild(mask);
    // 挂到文档后再挂载内容（思维导图要求容器在文档内）
    unmount = mount(body);
}

/**
 * 把编辑后的导图数据写回对应的 ```smm-mind 代码块。
 *
 * 用文档里实际的节点位置重新定位（旧 start 在编辑期间可能已失效），
 * 再整块替换代码块文字，保持为一个干净的事务（可撤销）。
 */
function set_code_data(view: EditorView | null, start: number, old_code: string, data_str: string) {
    if (!view || data_str === old_code) {
        return;
    }
    const doc = view.state.doc;
    // 优先用原位置，位置漂移时按内容找（同一文档中内容相同的块取第一个）
    let target: {from: number; to: number} | null = null;
    const node = doc.nodeAt(start);
    if (node && node.type.name === "code_block" && node.textContent === old_code) {
        target = {from: start + 1, to: start + node.nodeSize - 1};
    } else {
        doc.descendants((n, pos) => {
            if (target) {
                return false;
            }
            if (n.type.name === "code_block" && n.attrs.language === "smm-mind" && n.textContent === old_code) {
                target = {from: pos + 1, to: pos + n.nodeSize - 1};
                return false;
            }
            return true;
        });
    }
    if (!target) {
        return;
    }
    const tr = view.state.tr.replaceWith(target.from, target.to, view.state.schema.text(data_str));
    view.dispatch(tr);
}

/**
 * 「点击编辑」按钮：悬停时出现在图形右上角，点了把光标送回源码。
 * 图形与思维导图的 widget 共用。
 */
function make_edit_button(get_view: () => EditorView | null, start: number): HTMLButtonElement {
    const edit = document.createElement("button");
    edit.className = "md-graph__edit";
    edit.type = "button";
    edit.textContent = i18n.t("clk_edt");
    // 按钮点击不能冒泡到容器，否则会同时触发容器的点击（放大 / 打开导图编辑器）
    edit.addEventListener("click", (e) => {
        e.stopPropagation();
        enter_code(get_view(), start);
    });
    return edit;
}

/**
 * 图的容器结构：
 *   <div class="md-graph">            ← 外层，管边框与悬停
 *     <div class="md-graph__body">…</div>  ← 图/错误/渲染中，内容可整体替换
 *     <button class="md-graph__edit">点击编辑</button>  ← 悬停才出现
 *   </div>
 * 图和按钮分开放，替换图内容时不会把按钮一起冲掉。
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

    const body = document.createElement("div");
    body.className = "md-graph__body";
    // 点图 = 放大查看。进入编辑要专门点右上角的「点击编辑」按钮，
    // 避免查看图形时误触发编辑。
    body.addEventListener("click", () => {
        const hit = cache.get(cache_key(lang, code));
        if (hit && !hit.error && hit.svg) {
            open_zoom(el => {
                el.innerHTML = hit.svg;
            });
        }
    });

    dom.append(body, make_edit_button(get_view, start));

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

/**
 * 思维导图代码块的挂载节点。
 *
 * 与 make_widget 的区别：simple-mind-map 是命令式组件，必须在元素挂载到文档
 * 之后才能实例化，因此这里先把容器建好，等数据准备好后再真正 mount。
 * 节点被 ProseMirror 回收（重建 widget）时需销毁实例，避免内存泄漏。
 */
function make_mind_widget(
    code: string,
    lang: string,
    start: number,
    get_view: () => EditorView | null,
    on_open_mind?: OpenMindHandler,
): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "md-graph md-graph--mind";
    dom.setAttribute("contenteditable", "false");
    dom.textContent = i18n.t("rendering");

    const edit = make_edit_button(get_view, start);

    // 当前挂载的实例销毁函数；widget 被 ProseMirror 移除时需销毁，避免实例残留
    let instance: {destroy: () => void} | null = null;
    // 由 build_decorations 的 widget destroy 回调调用
    (dom as any).__unmount = () => {
        instance?.destroy();
        instance = null;
    };

    // 数据/库准备好后再初始化导图实例；节点已被回收则跳过。
    // 直接挂在 dom 上（simple-mind-map 要求容器有确定的宽高，见 .md-graph--mind 的样式）。
    mind_cached(lang, code).then(mount => {
        if (!dom.isConnected) {
            return;
        }
        // 清掉「渲染中」占位文案，再放编辑按钮
        dom.textContent = "";
        dom.append(edit);
        // mount 内部会等容器进入文档且有尺寸后再构造导图
        mount.mount(dom).then(inst => {
            // 期间 widget 可能已被移除，避免实例泄漏
            if (!dom.isConnected) {
                inst.destroy();
                return;
            }
            instance = inst;
        }).catch(err => {
            // 构造失败（如容器被回收）不影响编辑器，仅记录
            console.error("[mind] mount failed", err);
        });
    });
    // 点导图 = 打开全屏思维导图编辑器（复用项目的 .mind 编辑器）。
    // 编辑器保存时把数据写回这个代码块；「点击编辑」按钮则回源码态改 JSON 文字。
    dom.addEventListener("click", () => {
        on_open_mind?.(code, (data_str) => set_code_data(get_view(), start, code, data_str));
    });
    return dom;
}

/** 光标（或选区）是否落在 [start, end] 区间内 */
function caret_inside(from: number, to: number, start: number, end: number): boolean {
    return from <= end && to >= start;
}

function build_decorations(state: any, get_view: () => EditorView | null, on_open_mind?: OpenMindHandler): DecorationSet {
    const decorations: Decoration[] = [];
    const {from, to} = state.selection;
    state.doc.descendants((node: PmNode, pos: number) => {
        if (node.type.name !== "code_block") {
            return;
        }
        const lang = node.attrs.language;
        const is_graph = is_graph_lang(lang);
        const is_mind = is_mind_lang(lang);
        if (!is_graph && !is_mind) {
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
        // key 带上位置与语言：两个相邻的图形块，前者的 end 就是后者的起点，
        // 位置相同；若 key 只用源码，内容相同的两个块会被 ProseMirror 视为
        // 同一个装饰而丢掉一个。
        const widget_key = `graph-${lang}-${start}-${code}`;
        if (is_mind) {
            // 思维导图是命令式组件：widget 移除时要销毁实例
            decorations.push(Decoration.widget(
                end,
                () => make_mind_widget(code, lang, start, get_view, on_open_mind),
                {
                    side: -1,
                    ignoreSelection: true,
                    key: widget_key,
                    destroy: (node: Node) => (node as any).__unmount?.(),
                },
            ));
            return;
        }
        decorations.push(Decoration.widget(end, () => make_widget(code, lang as GraphLang, start, get_view), {
            // side: -1 —— 紧贴在代码块之前，视觉上就落在它原来的位置
            side: -1,
            // 图不参与选区：光标不该落进图里
            ignoreSelection: true,
            key: widget_key,
        }));
    });
    return DecorationSet.create(state.doc, decorations);
}

export function build_graph_plugin(on_open_mind?: OpenMindHandler): Plugin {
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
                const set = build_decorations(state, () => view_ref, on_open_mind);
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
