import {Plugin, PluginKey} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import {Node as PmNode} from "prosemirror-model";
// 与 Markdown 预览页（Md.tsx）保持一致，直接用整包：
// 这样两份代码共用同一份已注册全部语言的 hljs，不会额外打一份进去。
import hljs from "highlight.js";

/**
 * 源码模式的语法高亮插件。
 *
 * 源码模式下，整篇文档被表示为一个 code_block（language="markdown"），
 * 里面的纯文本就是 Markdown 原文。这里把 highlight.js 的着色结果转换成
 * ProseMirror 的 Decoration，让文本在保持「可编辑的纯文本」的同时带上颜色。
 *
 * 为什么用 Decoration 而不是 mark：
 *   code_block 的 schema 定义了 marks: ""，块内不允许任何 mark；
 *   而 Decoration 只是渲染层的内联样式覆盖，不写入文档、不参与保存，正好合适。
 *
 * 只在源码模式下生效：它取决于一个由外部写入的 module 级开关，
 * 因为该插件随 EditorView 一起创建，无法通过 props 直接传入。
 */
export const md_source_highlight_key = new PluginKey("md_source_highlight");

// 是否处于源码模式。由 MdWysiwygEditor 在切换时同步。
let source_mode = false;

export function set_source_highlight_enabled(enabled: boolean) {
    source_mode = enabled;
}

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
    let result;
    try {
        result = hljs.highlight(text, {language: "markdown", ignoreIllegals: true});
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
 * 创建源码模式高亮插件。
 * 装饰在文档变化时按需重建 —— 这里用 state 保存并配合 apply 做增量，
 * 但源码模式被整体替换的场景较多，直接全量重建更简单可靠（单块文本，开销很小）。
 */
export function build_source_highlight_plugin(): Plugin {
    return new Plugin({
        key: md_source_highlight_key,
        state: {
            init: (_, state) => DecorationSet.empty,
            apply: (tr, _old, _old_state, new_state) => {
                if (!source_mode) {
                    return DecorationSet.empty;
                }
                // 文档没变就沿用旧装饰，省掉一次高亮计算
                if (!tr.docChanged) {
                    return md_source_highlight_key.getState(new_state) ?? DecorationSet.empty;
                }
                return build_decoration_set(new_state.doc);
            },
        },
        props: {
            decorations(state) {
                if (!source_mode) {
                    return null;
                }
                // init/apply 之外（例如首次挂载）兜底计算一次
                const set = md_source_highlight_key.getState(state);
                if (!set || !set.find().length) {
                    return build_decoration_set(state.doc);
                }
                return set;
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
