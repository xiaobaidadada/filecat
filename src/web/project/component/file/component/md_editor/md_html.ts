import {Node as PmNode} from "prosemirror-model";
import {EditorView, NodeView} from "prosemirror-view";
import {fileHttp} from "../../../../util/config";
import hljs from "highlight.js";

/**
 * Markdown 里内嵌 HTML 的展示。
 *
 * 背景：Markdown 允许直接写 HTML（README 里那种 <p align="center"> 包一堆徽章）。
 * 如果按普通标签解析，标签本身会被拆成别的 PM 节点、原文就永久丢了 ——
 * 保存时用户写的 HTML 会被改写甚至消失。所以 schema 里把它单独做成
 * html_block / html_inline 节点，原文存在 attrs.value 里。
 *
 * 交互（对齐 Typora）：
 *   · 默认渲染成真的 HTML（徽章排一行、居中标题生效、链接可点）
 *   · 右上角有个「HTML」标签，点它这一块原地展开成源码可编辑
 *   · 再点收起，回到渲染态
 *
 * 「原地」是重点：不切源码模式、不移动文档光标，只是这个 NodeView
 * 在自己的 DOM 里换一套内容。所以整篇文档的布局不会跳动，
 * 其它块也不会被重排 —— 这正是 Typora 那个「HTML 方块」的手感。
 */

/**
 * HTML 原文在中间 HTML 里的承载方式：base64。
 *
 * 为什么要编码：原文里有引号、尖括号、换行，塞进 HTML 属性会破坏结构。
 * base64 只含 A-Za-z0-9+/=，放属性里绝对安全。
 * 用 encodeURIComponent 中转是为了中文等多字节字符不出乱码
 * （btoa 只接受 Latin-1）。
 */
export function encode_html(raw: string): string {
    return btoa(unescape(encodeURIComponent(raw)));
}

export function decode_html(encoded: string): string {
    return decodeURIComponent(escape(atob(encoded)));
}

/**
 * 当前文档所在的目录（web 路径，形如 `/测试/`）。
 *
 * HTML 块里的 `<img src="./xx.png">` 是相对**文档**说的，不是相对页面 URL。
 * 浏览器会按页面 URL 解析相对路径，在 filecat 里就会变成
 * `/file/filecat/测试/./xx.png` 这种不存在的地址 → 图裂。
 * 所以渲染前要把相对路径换成 filecat 的下载地址。
 *
 * 用模块级变量而不是 React context：NodeView 是 ProseMirror 内部构造的，
 * 拿不到组件树，只能走这种最轻的通道。同一时刻只会有一个 md 编辑器在编辑，
 * 不存在互相干扰。
 */
let doc_dir = "";

export function set_html_doc_dir(dir: string) {
    doc_dir = dir || "";
}

/** 把 Markdown 里的图片地址解析成可访问的 URL */
export function resolve_src(src: string): string {
    // 绝对 URL（http/https/data/blob）和站点绝对路径直接原样用
    if (/^(https?:|data:|blob:|\/\/|\/)/i.test(src)) {
        return src;
    }
    const path = src.replace(/^\.\//, "");
    return fileHttp.getDownloadUrl(doc_dir + path);
}

/** 允许保留的标签（其余一律按纯文本处理，防注入） */
const SAFE_TAGS = new Set([
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt",
    "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark",
    "ol", "p", "pre", "q", "s", "samp", "small", "span", "strong", "sub", "summary", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var", "wbr",
]);

/** 允许保留的属性（含 data-* 由下方单独放行） */
const SAFE_ATTRS = new Set([
    "align", "alt", "border", "cellpadding", "cellspacing", "class", "colspan", "height",
    "href", "id", "rowspan", "src", "style", "target", "title", "valign", "width",
]);

/**
 * 把一段 HTML 净化成可安全插入页面的 DOM。
 *
 * 只保留白名单标签与属性，并干掉一切 on* 事件属性与 javascript: 协议。
 * 用 DOMParser 解析而不是 innerHTML：解析出的文档是惰性的，
 * 图片不会在此时发起请求，也不会执行脚本。
 */
export function sanitize_html(raw: string): DocumentFragment {
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
    const holder = doc.body.firstElementChild;
    const out = document.createDocumentFragment();
    if (!holder) {
        return out;
    }
    const walk = (from: Node, to: Node) => {
        from.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                to.appendChild(document.createTextNode(child.textContent ?? ""));
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) {
                return;
            }
            const el = child as Element;
            if (!SAFE_TAGS.has(el.tagName.toLowerCase())) {
                // 不在白名单：扔掉标签本身，但保留里面的文字
                walk(el, to);
                return;
            }
            const copy = document.createElement(el.tagName.toLowerCase());
            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on")) {
                    continue;
                }
                if (!SAFE_ATTRS.has(name) && !name.startsWith("data-")) {
                    continue;
                }
                if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
                    continue;
                }
                // 图片的相对路径按「文档所在目录」解析，否则浏览器会按页面 URL 解析成不存在的位置
                if (name === "src") {
                    copy.setAttribute(name, resolve_src(attr.value));
                    continue;
                }
                copy.setAttribute(name, attr.value);
            }
            walk(el, copy);
            to.appendChild(copy);
        });
    };
    walk(holder, out);
    return out;
}

/**
 * HTML 块 / 行内 HTML 的 NodeView。
 *
 * 两种形态共存于同一个 DOM 容器里，靠 data-mode 切换：
 *   preview —— 渲染 HTML，右上角标签是暗的
 *   source  —— 显示原文，右上角标签是亮的（对应 Typora 的 HTML ✓）
 */
class HtmlBlockView implements NodeView {
    dom: HTMLElement;
    private node: PmNode;
    private view: EditorView;
    private get_pos: () => number;
    private render_box: HTMLElement;
    private source_box: HTMLElement;
    private source_input: HTMLTextAreaElement;
    private source_hl: HTMLElement;
    private source_hl_code: HTMLElement;
    private mode: "preview" | "source" = "preview";
    /** 源码编辑中的临时值；未编辑时为 null */
    private draft: string | null = null;

    constructor(node: PmNode, view: EditorView, get_pos: () => number) {
        this.node = node;
        this.view = view;
        this.get_pos = get_pos;

        this.dom = document.createElement("div");
        this.dom.className = "md-html-block";
        this.dom.setAttribute("data-mode", "preview");

        this.render_box = document.createElement("div");
        this.render_box.className = "md-html-block__render";

        this.source_box = document.createElement("div");
        this.source_box.className = "md-html-block__source";
        // 源码编辑区：透明文字的 textarea 叠在高亮层上。
        // 用两层而不是直接 contenteditable —— contenteditable 里放高亮 span，
        // 每次重新着色都会把 DOM 结构换掉、光标跳回开头；
        // 分层后 textarea 才是真正在编辑的东西，高亮层只是背景，光标由浏览器自己管。
        this.source_input = document.createElement("textarea");
        this.source_input.className = "md-html-block__input";
        this.source_input.setAttribute("spellcheck", "false");
        this.source_input.setAttribute("wrap", "off");

        this.source_hl = document.createElement("pre");
        this.source_hl.className = "md-html-block__highlight";
        this.source_hl.setAttribute("aria-hidden", "true");
        const hl_code = document.createElement("code");
        this.source_hl.appendChild(hl_code);
        this.source_hl_code = hl_code;

        this.source_box.append(this.source_hl, this.source_input);

        const toggle = document.createElement("span");
        toggle.className = "md-html-block__toggle";
        toggle.setAttribute("contenteditable", "false");
        toggle.textContent = "HTML";
        toggle.addEventListener("mousedown", e => {
            // 用 mousedown 并阻止默认行为：否则编辑器会先把文档光标挪过来，
            // 展开源码时还可能因为选区变化而让整块被重建。
            e.preventDefault();
            e.stopPropagation();
            this.toggle_mode();
        });

        // 失焦只把内容写回节点，不改变展开状态 ——
        // 展开/收起完全交给标签点击，这样失焦后源码仍在眼前，不会「一点别处就跳回渲染态」。
        this.source_input.addEventListener("blur", () => this.commit());
        this.source_input.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                e.preventDefault();
                this.draft = null;
                this.toggle_mode();
            }
            // 源码里打字不能冒泡给编辑器，否则会被它当成正文输入处理
            e.stopPropagation();
        });
        this.source_input.addEventListener("input", () => {
            this.draft = this.source_input.value;
            this.paint_highlight();
            // 打字到行末时浏览器会让 textarea 内部横向滚动，
            // 把位移同步给高亮层，两层才不会错开。
            this.source_hl.scrollLeft = this.source_input.scrollLeft;
        });
        // 反过来，用户拖动高亮层的横向滚动条时，textarea 也要跟上
        this.source_hl.addEventListener("scroll", () => {
            this.source_input.scrollLeft = this.source_hl.scrollLeft;
        });
        // 阻止一切会冒泡到编辑器的输入类事件
        for (const type of ["beforeinput", "paste", "input", "keyup", "keypress"]) {
            this.source_input.addEventListener(type, e => e.stopPropagation());
        }

        this.dom.append(this.render_box, this.source_box, toggle);
        this.render_box.replaceChildren(sanitize_html(node.attrs.value as string));
        this.set_source_value(node.attrs.value as string);
    }

    /** 设置源码区内容并重新着色 */
    private set_source_value(value: string) {
        this.source_input.value = value;
        this.paint_highlight();
    }

    /**
     * 给源码着色。
     *
     * 用 highlight.js 的 xml 语法（HTML 就是 XML 的近亲）——
     * 项目里代码块用的就是它，同一份实例、不额外打包。
     * 高亮层与 textarea 的字体、行高、内边距必须完全一致，
     * 否则文字会跟光标错位（样式写在 CSS 里，两边共用同一组数值）。
     */
    private paint_highlight() {
        const code = this.source_input.value;
        // 末尾补一个换行：pre 不会为结尾的空行留高度，
        // 不补的话最后一行会被 textarea 的滚动高度切掉。
        this.source_hl_code.innerHTML = hljs.highlight(code + "\n", {language: "xml", ignoreIllegals: true}).value;
    }

    private toggle_mode() {
        if (this.mode === "source") {
            this.commit();
            this.mode = "preview";
            this.dom.setAttribute("data-mode", "preview");
            return;
        }
        this.mode = "source";
        this.dom.setAttribute("data-mode", "source");
        this.set_source_value(this.node.attrs.value as string);
        this.draft = null;
        this.source_input.focus();
    }

    /** 把源码态的改动写回节点属性。不改变展开状态。 */
    private commit() {
        if (this.draft === null) {
            return;
        }
        const next = this.draft;
        this.draft = null;
        if (next === this.node.attrs.value) {
            return;
        }
        const pos = this.get_pos();
        const node = this.view.state.doc.nodeAt(pos);
        if (!node) {
            return;
        }
        this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {...node.attrs, value: next}),
        );
    }

    update(node: PmNode): boolean {
        if (node.type !== this.node.type) {
            return false;
        }
        this.node = node;
        // 正在源码态编辑（有未提交的草稿）时，别用外部值冲掉用户输入；
        // 其余情况（含源码态刚写回自己的改动）都要重画，保证渲染区跟着更新。
        if (this.draft === null) {
            this.render_box.replaceChildren(sanitize_html(node.attrs.value as string));
            if (this.mode === "preview") {
                this.set_source_value(node.attrs.value as string);
            }
        }
        return true;
    }

    /** 让 NodeView 内部的原生事件（点标签、源码区输入）不被编辑器截走 */
    stopEvent(event: Event): boolean {
        return this.dom.contains(event.target as globalThis.Node);
    }

    ignoreMutation(): boolean {
        // 渲染区是我们自己写的，编辑器不该据此反推文档内容
        return true;
    }
}

/** 行内 HTML 的 NodeView：渲染态显示原文（不渲染），点开可编辑 */
class HtmlInlineView implements NodeView {
    dom: HTMLElement;
    private node: PmNode;
    private view: EditorView;
    private get_pos: () => number;

    constructor(node: PmNode, view: EditorView, get_pos: () => number) {
        this.node = node;
        this.view = view;
        this.get_pos = get_pos;
        this.dom = document.createElement("span");
        this.dom.className = "md-html-inline";
        this.dom.setAttribute("contenteditable", "true");
        this.dom.textContent = node.attrs.value as string;
        this.dom.addEventListener("blur", () => this.commit());
        for (const type of ["beforeinput", "paste", "input"]) {
            this.dom.addEventListener(type, e => e.stopPropagation());
        }
    }

    private commit() {
        const next = this.dom.textContent ?? "";
        if (next === this.node.attrs.value) {
            return;
        }
        const pos = this.get_pos();
        const node = this.view.state.doc.nodeAt(pos);
        if (!node) {
            return;
        }
        this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {...node.attrs, value: next}),
        );
    }

    update(node: PmNode): boolean {
        if (node.type !== this.node.type) {
            return false;
        }
        this.node = node;
        return true;
    }

    stopEvent(event: Event): boolean {
        return this.dom.contains(event.target as globalThis.Node);
    }

    ignoreMutation(): boolean {
        return true;
    }
}

/**
 * NodeView 工厂集合，挂到 EditorProps.nodeViews 上。
 *
 * ProseMirror 的 NodeViewConstructor 签名是
 * (node, view, getPos, decorations, innerDecorations)，
 * 第三参 getPos 就是「当前这个节点在文档里的位置」—— 直接用它写回属性，
 * 不要自己缓存位置（节点前面的内容一变，位置就失效了）。
 */
export function md_node_views() {
    return {
        html_block: (node: PmNode, view: EditorView, get_pos: () => number) =>
            new HtmlBlockView(node, view, get_pos),
        html_inline: (node: PmNode, view: EditorView, get_pos: () => number) =>
            new HtmlInlineView(node, view, get_pos),
    };
}
