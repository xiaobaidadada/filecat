import React, {useEffect} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import markdownit from 'markdown-it'
// 导入插件
import {light as emoji} from 'markdown-it-emoji';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import 'github-markdown-css/github-markdown.css';
import {NotySucess} from "../../../util/noty";
import {join_url} from "../../../../../common/StringUtil";

// import hljs from 'highlight.js' // https://highlightjs.org

// Actual default values
// const md = markdownit({
//     highlight: function (str, lang) {
//         if (lang && hljs.getLanguage(lang)) {
//             try {
//                 return hljs.highlight(str, { language: lang }).value;
//             } catch (__) {}
//         }
//
//         return ''; // use external default escaping
//     }
// });
// 自定义 markdown-it 插件来为代码块添加复制按钮
const markdownItCopyButton = (md) => {
    const defaultRender = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const code = token.content.trim();

        // 添加复制按钮到代码块
        return `
      <div class="code-block-with-copy">
        <button class="copy-btn" data-code="${md.utils.escapeHtml(code)}">复制</button>
        <pre><code>${md.utils.escapeHtml(code)}</code></pre>
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
            token.attrs[hrefIndex][1] = join_url(window.location.href , hrefValue);
        }
        // 调用默认的渲染器，继续正常渲染其他部分
        return defaultRender(tokens, idx, options, env, self);
    };
};
const md = new markdownit({
    html: true,
    highlight: function (str, lang) {
        return `<pre class="custom-code-block"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
});
md.use(emoji)       // 支持 Emoji
    .use(sub)         // 支持下标
    .use(sup)         // 支持上标
    .use(footnote)    // 支持脚注
    .use(taskLists)   // 支持任务列表
    .use(markdownItCopyButton) // 使用自定义插件
    .use(markdownItAddPrefixToLinks); // 使用自定义插件

export function MarkDown(props) {
    const [markdown, set_markdown] = useRecoilState($stroe.markdown)
    const copyToClipboard = (text) => {
        // 创建一个不可见的textarea元素
        const textArea = document.createElement('textarea');
        textArea.value = text;

        // 让textarea不可见
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';

        // 把textarea添加到DOM中
        document.body.appendChild(textArea);

        // 选中textarea中的文本
        textArea.select();
        textArea.setSelectionRange(0, 99999); // 对移动设备的支持

        try {
            // 使用execCommand复制
            const successful = document.execCommand('copy');
            if (successful) {
                NotySucess('复制成功');
            } else {
                console.error('复制失败');
            }
        } catch (err) {
            console.error('复制失败：', err);
        }

        // 移除textarea元素
        document.body.removeChild(textArea);
    };
    useEffect(() => {
        // 在组件渲染完成后为复制按钮添加事件处理
        const copyButtons = document.querySelectorAll('.copy-btn');
        copyButtons.forEach(button => {
            button.addEventListener('click', function () {
                const code = this.getAttribute('data-code');
                copyToClipboard(code);
            });
        });

        // 清理事件绑定，防止重复绑定
        return () => {
            copyButtons.forEach(button => {
                button.removeEventListener('click', function () {
                    const code = this.getAttribute('data-code');
                    copyToClipboard(code);
                });
            });
        };
    }, [markdown]); // 每次 markdownText 改变时重新绑定事件
    if (!markdown.context) {
        return ;
    }
    function cancel () {
        set_markdown({context:"",filename:""})
    }


    return <div id={"md-container"}>
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
            <title key={2}>{markdown.filename}</title>]}>
        </Header>
        <div className={"md-context markdown-body "}>
            <div dangerouslySetInnerHTML={{ __html: md.render(markdown.context) }} />
        </div>
    </div>
}