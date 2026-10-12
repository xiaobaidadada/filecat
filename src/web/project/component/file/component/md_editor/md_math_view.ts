import {Node as PmNode} from "prosemirror-model";
import {EditorView, NodeView} from "prosemirror-view";
import {Plugin} from "prosemirror-state";
import {mount_math, unwrap_math} from "./md_math";

/**
 * 「文档位置 → 公式 NodeView 实例」的注册表。
 *
 * ProseMirror 不会因为「选区移动」就调用 NodeView.update（文档没变），
 * 所以固定住「光标进出公式要切换形态」这件事，必须有个插件在旁边盯着选区，
 * 再把结果通知到对应实例。这个表就是插件与实例之间的通道。
 */
const views = new Map<number, MathView>();

export function register_math_view(pos: number, view: MathView) {
    views.set(pos, view);
}

export function unregister_math_view(view: MathView) {
    for (const [pos, v] of views) {
        if (v === view) {
            views.delete(pos);
            return;
        }
    }
}

/**
 * 数学公式在编辑器里的展示。
 *
 * 交互（对齐 Typora）：
 *   · 光标不在公式上时，显示 KaTeX 排版好的公式
 *   · 光标进入公式时，原地变回 LaTeX 源码，可以直接改
 *   · 改完光标移开，又变回排版结果
 *
 * 「原地」是重点：不动文档光标位置、不改变块的高度结构，
 * 只是这个 NodeView 在自己的 DOM 里换一套内容。
 *
 * 与 html_block 的区别在驱动方式：HTML 块靠点右上角标签切换，
 * 公式靠光标进出 —— 因为公式是要反复对照源码调的东西，
 * 让用户「先点源码再点回来」太笨。这也正是 Typora 的做法。
 *
 * 两种公式（行内 / 块级）共用这一个类：DOM 结构、编辑逻辑完全一样，
 * 区别只是外层标签与 CSS（块级居中、行内跟着文字走）。
 */

export class MathView implements NodeView {
    dom: HTMLElement;
    private node: PmNode;
    private view: EditorView;
    private get_pos: () => number;
    /** 排版结果的容器 */
    private render_box: HTMLElement;
    /** 源码编辑框（只在源码态显示） */
    private source_input: HTMLTextAreaElement;
    /** 当前是否处于源码态（光标在公式内） */
    private editing = false;
    /** 源码编辑中的临时值；未编辑时为 null */
    private draft: string | null = null;
    /** 上一次渲染用的 raw，避免同一内容反复重排 */
    private painted_raw = "";

    constructor(node: PmNode, view: EditorView, get_pos: () => number) {
        this.node = node;
        this.view = view;
        this.get_pos = get_pos;

        const is_block = node.type.name === "math_block";
        this.dom = document.createElement(is_block ? "div" : "span");
        this.dom.className = is_block ? "md-math md-math--block" : "md-math md-math--inline";
        this.dom.setAttribute("contenteditable", "false");

        this.render_box = document.createElement("span");
        this.render_box.className = "md-math__render";

        this.source_input = document.createElement("textarea");
        this.source_input.className = "md-math__source";
        this.source_input.setAttribute("spellcheck", "false");
        this.source_input.setAttribute("wrap", "off");
        this.source_input.setAttribute("rows", "1");

        this.dom.append(this.render_box, this.source_input);

        // 登记到全局表：选区变化时由插件按位置找到它
        register_math_view(get_pos(), this);

        // 源码区的事件不能冒泡给编辑器，否则会被当成正文输入处理
        this.source_input.addEventListener("input", () => {
            this.draft = this.source_input.value;
            this.auto_size();
        });
        // 失焦时把内容写回节点
        this.source_input.addEventListener("blur", () => this.commit());
        this.source_input.addEventListener("keydown", e => {
            e.stopPropagation();
            // Esc：放弃本次修改，回到渲染态
            if (e.key === "Escape") {
                e.preventDefault();
                this.draft = null;
                this.set_editing(false);
            }
        });
        for (const type of ["beforeinput", "paste", "input", "keyup", "keypress"]) {
            this.source_input.addEventListener(type, e => e.stopPropagation());
        }

        // 点击渲染区 = 进入编辑（选区也会跟着进到节点内）
        this.render_box.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
            this.focus_source();
        });

        this.paint(node);
    }

    /** 按当前状态刷新 DOM */
    private paint(node: PmNode) {
        const raw = node.attrs.raw as string;
        if (this.editing) {
            this.dom.setAttribute("data-mode", "source");
            if (this.draft === null) {
                this.source_input.value = raw;
            }
            this.auto_size();
            return;
        }
        this.dom.setAttribute("data-mode", "preview");
        if (this.painted_raw === raw) {
            return;
        }
        this.painted_raw = raw;
        const holder = this.render_box;
        holder.classList.add("md-math--loading");
        holder.textContent = "";
        // 渲染是异步的（KaTeX 首次要动态加载）；期间保留源码文本，
        // 让用户至少看到自己写的东西，而不是一块空白。
        holder.textContent = raw;
        mount_math(holder, node.attrs.tex as string, node.type.name === "math_block" ? "block" : "inline", raw);
    }

    /** 让 textarea 的高度跟着内容走，避免出现纵向滚动条 */
    private auto_size() {
        const el = this.source_input;
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
    }

    /** 进入源码态并把光标放进去 */
    private focus_source() {
        if (this.editing) {
            return;
        }
        this.set_editing(true);
        this.source_input.focus();
        // 光标放到末尾，方便接着改
        this.source_input.setSelectionRange(this.source_input.value.length, this.source_input.value.length);
    }

    private set_editing(on: boolean) {
        if (this.editing === on) {
            return;
        }
        this.editing = on;
        this.paint(this.node);
    }

    /** 由外部（选区变化）驱动：光标是否在这个节点内 */
    set_selected(selected: boolean) {
        if (selected) {
            this.focus_source();
        } else if (this.editing) {
            this.commit();
            this.set_editing(false);
        }
    }

    /** 把源码态的改动写回节点属性 */
    private commit() {
        if (this.draft === null) {
            return;
        }
        const next = this.draft;
        this.draft = null;
        if (next === this.node.attrs.raw) {
            return;
        }
        const pos = this.get_pos();
        const node = this.view.state.doc.nodeAt(pos);
        if (!node) {
            return;
        }
        // 用原始写法重新剥一次 tex：用户可能把 $a$ 改成了 $$a$$，
        // mode（行内/块级）由节点类型决定，不跟着变 —— 换行内/块级
        // 是结构变化，交给用户删掉重写，不在这里偷偷改。
        const parsed = unwrap_math(next);
        const tex = parsed?.tex ?? next;
        this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {...node.attrs, raw: next, tex}),
        );
        // 写回后清掉缓存标记，强制下一次重排
        this.painted_raw = "";
    }

    update(node: PmNode): boolean {
        if (node.type !== this.node.type) {
            return false;
        }
        const raw_changed = node.attrs.raw !== this.node.attrs.raw;
        this.node = node;
        if (raw_changed) {
            // 外部改了内容：清掉草稿，重画
            this.draft = null;
            this.painted_raw = "";
        }
        this.paint(node);
        return true;
    }

    /** 内部的原生事件（点渲染区、源码输入）不要被编辑器截走 */
    stopEvent(event: Event): boolean {
        return this.dom.contains(event.target as globalThis.Node);
    }

    ignoreMutation(): boolean {
        // 渲染区是我们自己写的，编辑器不该据此反推文档内容
        return true;
    }

    /** 公式是原子节点，不需要 ProseMirror 帮忙管 DOM */
    destroy() {
        this.draft = null;
        unregister_math_view(this);
    }
}

/**
 * 选区驱动的「光标进出公式」控制。
 *
 * 为什么不把这段放在 MathView 里：NodeView 拿不到「当前选区在哪」的全局视角，
 * 每个实例只能看到自己被 update 的时刻。而 ProseMirror 不会因为选区移动
 * 就调用 NodeView.update（文档没变），所以必须有个插件在旁边盯着选区。
 *
 * 用一个模块级注册表把「位置 → 实例」记下来，插件在选区变化时通知对应实例。
 * 同一时刻文档里可能有很多公式，但只有一个会被选中，所以按位置匹配即可。
 */

/** 公式节点在文档里占据的长度（atom 节点就是 1） */
const MATH_NODE_SIZE = 1;

/**
 * 选区变化时，通知「被选中的公式」进入编辑态、其余退出。
 *
 * 行内公式（光标紧挨着）也算进入：否则用户点到公式旁边时
 * 会看到一个只读的排版块、不知道该怎么改。
 */
export function sync_math_selection(view: EditorView) {
    const sel = view.state.selection;
    const from = sel.from;
    const to = sel.to;
    for (const [pos, math_view] of views) {
        // 位置在节点内部，或光标正好落在节点边界上
        const inside = to > pos && from <= pos + MATH_NODE_SIZE;
        math_view.set_selected(inside);
    }
}

/**
 * 选区监听插件：编辑器每次选区/文档变化后同步一次公式的编辑态。
 *
 * 用 ViewPlugin 而不是 StateField —— 这里只读状态、只改 DOM，
 * 不往文档里写东西，ViewPlugin 就是为这种场景准备的。
 */
export function build_math_plugin() {
    return new Plugin({
        view: (view: EditorView) => {
            // 挂载后先同步一次：刷新页面时光标可能正好停在一个公式上
            sync_math_selection(view);
            return {
                update: (v: EditorView, prev: any) => {
                    // 只有选区或文档变了才需要重算（滚动、焦点变化不触发）
                    if (v.state.selection === prev.selection && v.state.doc === prev.doc) {
                        return;
                    }
                    sync_math_selection(v);
                },
            };
        },
    });
}
