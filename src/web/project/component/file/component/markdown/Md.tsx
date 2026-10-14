import React, {useEffect, useRef} from "react";
import markdownit from 'markdown-it'
// 导入插件
import {light as emoji} from 'markdown-it-emoji';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import 'github-markdown-css/github-markdown.css';
import {join_url} from "../../../../../../common/StringUtil";
import {using_add_md__copy_button} from "../../FileUtil";
import {is_graph_lang, render_graph} from "../md_editor/graph_render";
import {is_mind_lang, prepare_mind} from "../md_editor/mind_graph";
import {install_math, render_math_blocks} from "../md_editor/md_math";
import {encode_html} from "../md_editor/md_html";
import i18n from "../../../../util/in18resource";

import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css' // 使用GitHub暗色主题
// 自定义 markdown-it 插件来为代码块添加复制按钮
const markdownItCopyButton = (md) => {
    const defaultRender = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const code = token.content.trim();
        const lang = token.info.trim();

        // 获取高亮后的HTML
        let highlightedCode = '';
        if (lang && hljs.getLanguage(lang)) {
            try {
                highlightedCode = hljs.highlight(code, { language: lang }).value;
            } catch (__) {
                highlightedCode = md.utils.escapeHtml(code);
            }
        } else {
            // 尝试自动检测语言
            try {
                highlightedCode = hljs.highlightAuto(code).value;
            } catch (__) {
                highlightedCode = md.utils.escapeHtml(code);
            }
        }

        // 添加复制按钮到代码块
        return `
      <div class="code-block-with-copy">
        <div class="code-header">
          <span class="code-language">${lang || 'code'}</span>
          <button class="copy-btn" data-code="${md.utils.escapeHtml(code)}">复制</button>
        </div>
        <pre><code class="hljs ${lang ? `language-${lang}` : ''}">${highlightedCode}</code></pre>
      </div>`;
    };


};
const markdownItAddPrefixToLinks = (md) => {
    // 保存默认的 link_open 渲染器
    const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    // 重写 link_open 渲染器
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]; // 获取当前的 token（表示 <a> 标签）
        // 找到 href 属性
        const hrefIndex = token.attrIndex('href');
        if (hrefIndex >= 0) {
            const hrefValue = token.attrs[hrefIndex][1]; // 获取原始的 href 值
            // href 为它添加 /file/ 前缀
            token.attrs[hrefIndex][1] = join_url(window.location.href, hrefValue);
        }
        // 调用默认的渲染器，继续正常渲染其他部分
        return defaultRender(tokens, idx, options, env, self);
    };
};
const md = new markdownit({
    html: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value;
                return `<pre class="hljs code-block-with-copy"><code class="hljs language-${lang}">${highlighted}</code></pre>`;
            } catch (__) {}
        }
        
        // 如果没有指定语言或语言不支持，尝试自动检测
        try {
            const highlighted = hljs.highlightAuto(str).value;
            return `<pre class="hljs code-block-with-copy"><code class="hljs">${highlighted}</code></pre>`;
        } catch (__) {}
        
        // 如果高亮失败，返回原始代码
        return `<pre class="hljs code-block-with-copy"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
});
md.use(emoji)       // 支持 Emoji
    .use(sub)         // 支持下标
    .use(sup)         // 支持上标
    .use(footnote)    // 支持脚注
    .use(taskLists)   // 支持任务列表
    .use(markdownItCopyButton) // 使用自定义插件
    .use(markdownItAddPrefixToLinks); // 使用自定义插件

// 数学公式：$...$ / \(...\) 行内，$$...$$ / \[...\] 块级，```math 代码块
// 识别规则与编辑器共用（见 md_editor/md_math.ts），两边行为保持一致
install_math(md, encode_html);

/**
 * 把 ```mermaid / ```svg 代码块换成渲染后的图。
 * markdown-it 的 fence 渲染器统一把代码块包成
 *   <div class="code-block-with-copy"><div class="code-header">…</div><pre><code class="hljs language-xxx">
 * 因此要替换的是最外层容器，否则会留下「语言标签 + 复制按钮」的空壳。
 */
async function render_graph_blocks(root: HTMLElement) {
    const codes = root.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
    for (const code of Array.from(codes)) {
        const lang = language_of(code);
        const is_graph = is_graph_lang(lang);
        const is_mind = is_mind_lang(lang);
        if (!is_graph && !is_mind) {
            continue;
        }
        const target = code.closest(".code-block-with-copy") ?? code.parentElement;
        if (!target) {
            continue;
        }
        const source = code.textContent ?? "";
        const holder = document.createElement("div");
        target.replaceWith(holder);
        if (is_mind) {
            await mount_mind_block(holder, source);
            continue;
        }
        holder.className = "md-graph md-graph--loading";
        holder.textContent = i18n.t("rendering");
        const res = await render_graph(lang as any, source);
        // 组件可能已卸载，或这段内容已被重新渲染
        if (!holder.isConnected) {
            continue;
        }
        if (res.error) {
            holder.className = "md-graph md-graph--error";
            holder.textContent = res.error;
        } else {
            holder.className = "md-graph";
            holder.innerHTML = res.svg;
        }
    }
}

/** 预览页的思维导图代码块：容器已挂到文档，直接初始化只读导图 */
async function mount_mind_block(holder: HTMLElement, source: string) {
    holder.className = "md-graph md-graph--mind md-graph--loading";
    holder.textContent = i18n.t("rendering");
    const task = await prepare_mind(source);
    // 内容可能已被重新渲染，容器不在文档里就不要再初始化
    if (!holder.isConnected) {
        return;
    }
    holder.className = "md-graph md-graph--mind";
    holder.textContent = "";
    task.mount(holder);
}

/** 从 code 元素的 class 里取出语言名（hljs language-mermaid → mermaid） */
function language_of(code: HTMLElement): string {
    const hit = code.className.match(/language-([\w-]+)/);
    return hit ? hit[1] : "";
}

export default function Md(props: {context: string}) {
    const ref = useRef<HTMLDivElement>(null);
    using_add_md__copy_button();
    // 不用 dangerouslySetInnerHTML：React 每次重渲染都会重设 innerHTML，
    // 会把 render_graph_blocks 替换出来的图形冲掉（而 context 没变时 effect 不会重跑）。
    // 改为手动写入，保证「写入 HTML → 渲染图形」在同一个 effect 里连续完成。
    useEffect(() => {
        if (!ref.current) {
            return;
        }
        ref.current.innerHTML = md.render(props.context ?? "");
        render_graph_blocks(ref.current);
        render_math_blocks(ref.current);
    }, [props.context]);
    return <div ref={ref}/>;
}