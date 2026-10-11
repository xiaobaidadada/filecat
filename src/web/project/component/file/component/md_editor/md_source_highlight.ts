import {Plugin, PluginKey} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import {Node as PmNode} from "prosemirror-model";
// 与 Markdown 预览页（Md.tsx）保持一致，直接用整包：
// 这样两份代码共用同一份已注册全部语言的 hljs，不会额外打一份进去。
import hljs from "highlight.js";

/**
 * 代码块的语法高亮插件。
 *
 * 文档里的每个 code_block 都按自身 language 属性着色，用 highlight.js 算好 token 后
 * 转成 ProseMirror 的 Decoration，文本保持「可编辑的纯文本」形态，只是渲染层上了色。
 *
 * 覆盖两种场景：
 *   1) 源码模式 —— 整篇文档就是一个 code_block（language="markdown"），等于整篇 Markdown 高亮
 *   2) 所见即所得 —— 文档里的 ```js / ```go 等代码块各自上色
 *
 * 为什么用 Decoration 而不是 mark：
 *   code_block 的 schema 定义了 marks: ""，块内不允许任何 mark；
 *   而 Decoration 只是渲染层的内联样式覆盖，不写入文档、不参与保存，正好合适。
 */
export const md_source_highlight_key = new PluginKey("md_source_highlight");

/**
 * 遍历 highlight.js 的 token 树，把带 scope 的节点拍平成 [from, to, class] 区间。
 *
 * highlight.js 的 _emitter.rootNode 结构形如：
 *   { children: [ {scope: "section", children: ["# 标题"]}, {children: []}, ... ] }
 * 注意它不提供每个 token 的起止位置，需要自己按文本长度累加。
 */
function flatten_tokens(nodes: any[], base: number, out: {from: number, to: number, cls: string}[]): number {
    let pos = base;
    for (const node of nodes) {
        if (typeof node === "string") {
            pos += node.length;
            continue;
        }
        const start = pos;
        if (Array.isArray(node.children)) {
            pos = flatten_tokens(node.children, pos, out);
        }
        // 有 scope 的节点才会着色；外层与内层可能同时有 scope（如 fenced code 内的子 token），
        // 内层后 push，渲染时内层 class 会覆盖外层，效果与 highlight.js 一致
        if (node.scope) {
            out.push({from: start, to: pos, cls: `hljs-${node.scope}`});
        }
    }
    return pos;
}

/**
 * 为一个代码块生成装饰区间。
 * @param node  代码块节点
 * @param pos   代码块在文档中的起始位置（Decoration 需要文档绝对位置）
 */
function build_decorations(node: PmNode, pos: number): Decoration[] {
    const text = node.textContent;
    if (!text) {
        return [];
    }
    // 用节点自己的语言；没写语言（``` 后面空的）时按纯文本处理，不做任何着色
    const lang = node.attrs.language ?? "";
    if (!lang || !hljs.getLanguage(lang)) {
        return [];
    }
    let result;
    try {
        result = hljs.highlight(text, {language: lang, ignoreIllegals: true});
    } catch {
        // 高亮失败（版本差异、非法内容等）不影响编辑，直接不着色
        return [];
    }
    const tokens: {from: number, to: number, cls: string}[] = [];
    const root = (result as any)._emitter?.rootNode;
    if (root?.children) {
        flatten_tokens(root.children, 0, tokens);
    }
    // 代码块内容从 pos + 1 开始（pos 是 pre 节点本身的位置，+1 进入其内容）
    const content_start = pos + 1;
    const decos: Decoration[] = [];
    for (const t of tokens) {
        // 裁剪到文本长度内：highlight.js 有时会在末尾补换行，越界的区间会被 ProseMirror 拒绝
        const from = Math.min(t.from, text.length);
        const to = Math.min(t.to, text.length);
        if (from >= to) {
            continue;
        }
        decos.push(Decoration.inline(content_start + from, content_start + to, {class: t.cls}));
    }
    return decos;
}

/**
 * 创建代码块高亮插件。
 *
 * 装饰不走 plugin state，而是在 props.decorations 里实时计算：
 * 只有文档变化才需要重算，交给 ProseMirror 自己控制重绘时机即可。
 * （plugin state 里的 DecorationSet 不会自动作用于渲染层，必须从这里返回。）
 */
export function build_source_highlight_plugin(): Plugin {
    return new Plugin({
        key: md_source_highlight_key,
        props: {
            decorations(state) {
                const set = build_decoration_set(state.doc);
                return set.find().length ? set : null;
            },
        },
    });
}

/** 扫描整篇文档，为其中的 markdown 代码块生成装饰集合 */
function build_decoration_set(doc: PmNode): DecorationSet {
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
        if (node.type.name !== "code_block") {
            return true;
        }
        decos.push(...build_decorations(node, pos));
        return false;
    });
    return DecorationSet.create(doc, decos);
}
