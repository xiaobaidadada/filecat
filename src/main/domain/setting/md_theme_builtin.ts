/**
 * 内置的 md 编辑器主题。
 *
 * key 就是主题名，同时也是写进主题目录的文件名（首次启动时铺一份）。
 * 铺完之后就和用户自己建的主题没区别了，随便改随便删。
 *
 * 选择器统一写 Typora 的 `#write`，由前端注入时改写成实际容器
 * （编辑器用 .md-editor-sheet，预览用预览容器），
 * 这样内置主题与用户导入的 Typora 主题走完全相同的处理流程。
 *
 * 内容参考 Typora 自带主题的视觉，但只保留与 markdown 正文相关的规则：
 * 去掉侧边栏/控件/源码模式等 Typora 专有样式，也去掉外部字体文件依赖。
 */
export const MD_THEME_BUILTIN_CSS: Record<string, string> = {
    "GitHub": `/* GitHub 风格 */
#write {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #24292e;
    background: #ffffff;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
#write h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
#write h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
#write h3 { font-size: 1.25em; }
#write h4 { font-size: 1em; }
#write h5 { font-size: 0.875em; }
#write h6 { font-size: 0.85em; color: #6a737d; }
#write p { margin: 0 0 1em; }
#write a { color: #0366d6; text-decoration: none; }
#write a:hover { text-decoration: underline; }
#write blockquote {
    padding: 0 1em;
    color: #6a737d;
    border-left: 0.25em solid #dfe2e5;
    margin: 0 0 1em;
}
#write code {
    padding: 0.2em 0.4em;
    font-size: 85%;
    background-color: rgba(27, 31, 35, 0.05);
    border-radius: 3px;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}
#write pre {
    padding: 1em;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    background-color: #f6f8fa;
    border-radius: 6px;
    margin-bottom: 1em;
}
#write pre code { background: transparent; padding: 0; font-size: 100%; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
#write table th, #write table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
#write table th { font-weight: 600; background: #f6f8fa; }
#write ul, #write ol { padding-left: 2em; margin-bottom: 1em; }
#write li { margin: 0.25em 0; }
#write hr { height: 0.25em; padding: 0; margin: 1.5em 0; background-color: #e1e4e8; border: 0; }
#write img { max-width: 100%; }`,

    "Newsprint": `/* Newsprint 风格：衬线、报纸排版 */
#write {
    font-family: "PT Serif", Georgia, "Songti SC", "SimSun", serif;
    font-size: 16px;
    line-height: 1.7;
    color: #333;
    background: #f9f9f9;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    font-family: "PT Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: bold;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
}
#write h1 { font-size: 1.8em; text-align: center; }
#write h2 { font-size: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
#write h3 { font-size: 1.3em; }
#write p { margin: 0 0 1em; }
#write a { color: #c0392b; }
#write blockquote {
    font-style: italic;
    color: #666;
    border-left: 4px solid #ccc;
    padding-left: 1em;
    margin: 0 0 1em;
}
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #efefef;
    padding: 0.15em 0.35em;
    border-radius: 2px;
}
#write pre {
    background: #efefef;
    padding: 1em;
    overflow: auto;
    border-left: 3px solid #ccc;
    margin-bottom: 1em;
}
#write pre code { background: transparent; padding: 0; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
#write table th, #write table td { border: 1px solid #ccc; padding: 6px 10px; }
#write table th { background: #eaeaea; }
#write ul, #write ol { padding-left: 1.8em; margin-bottom: 1em; }
#write hr { border: 0; border-top: 1px solid #ccc; margin: 1.6em 0; }`,

    "Night": `/* Night 风格：深色 */
#write {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #b8bfc6;
    background: #363b40;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    color: #e0e0e0;
    font-weight: 600;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
#write h1 { font-size: 1.9em; border-bottom: 1px solid #4a4f55; padding-bottom: 0.3em; }
#write h2 { font-size: 1.5em; border-bottom: 1px solid #4a4f55; padding-bottom: 0.3em; }
#write p { margin: 0 0 1em; }
#write a { color: #4a89dc; }
#write blockquote {
    border-left: 3px solid #4a89dc;
    padding-left: 1em;
    color: #909aa0;
    margin: 0 0 1em;
}
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #2b3035;
    color: #e8bf6a;
    padding: 0.15em 0.35em;
    border-radius: 3px;
}
#write pre {
    background: #2b3035;
    padding: 1em;
    overflow: auto;
    border-radius: 4px;
    margin-bottom: 1em;
}
#write pre code { background: transparent; padding: 0; color: #b8bfc6; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
#write table th, #write table td { border: 1px solid #4a4f55; padding: 6px 10px; }
#write table th { background: #2e3033; color: #e0e0e0; }
#write ul, #write ol { padding-left: 1.8em; margin-bottom: 1em; }
#write hr { border: 0; border-top: 1px solid #4a4f55; margin: 1.6em 0; }`,

    "Pixyll": `/* Pixyll 风格：宽行距、极简 */
#write {
    font-family: "Merriweather", Georgia, "Songti SC", serif;
    font-size: 17px;
    line-height: 1.9;
    color: #333;
    background: #fff;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    font-family: "Lato", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: 300;
    color: #222;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
}
#write h1 { font-size: 2.1em; }
#write h2 { font-size: 1.6em; }
#write p { margin: 0 0 1.4em; }
#write a { color: #0074d9; text-decoration: none; }
#write a:hover { text-decoration: underline; }
#write blockquote { color: #666; font-style: italic; border-left: 3px solid #eee; padding-left: 1em; }
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.88em;
    background: #f5f5f5;
    padding: 0.15em 0.4em;
    border-radius: 3px;
}
#write pre { background: #f5f5f5; padding: 1em; overflow: auto; border-radius: 4px; margin-bottom: 1.2em; }
#write pre code { background: transparent; padding: 0; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1.2em; }
#write table th, #write table td { border: 1px solid #eee; padding: 8px 12px; }
#write table th { background: #fafafa; font-weight: 500; }
#write ul, #write ol { padding-left: 1.8em; margin-bottom: 1.2em; }
#write hr { border: 0; border-top: 1px solid #eee; margin: 2em 0; }`,

    "Whitey": `/* Whitey 风格：大字号、衬线、留白多 */
#write {
    font-family: "Vollkorn", Palatino, Georgia, "Songti SC", serif;
    font-size: 19px;
    line-height: 1.7;
    color: #333;
    background: #fefefe;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    font-family: "Vollkorn", Georgia, serif;
    font-weight: normal;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}
#write h1 { font-size: 2em; }
#write h2 { font-size: 1.6em; }
#write h3 { font-size: 1.3em; }
#write p { margin: 0 0 1.2em; }
#write a { color: #000; border-bottom: 1px solid #999; text-decoration: none; }
#write blockquote { border-left: 4px solid #ddd; padding-left: 1.2em; color: #555; font-style: italic; }
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.85em;
    background: #f0f0f0;
    padding: 0.15em 0.35em;
}
#write pre { background: #f0f0f0; padding: 1em; overflow: auto; margin-bottom: 1.2em; }
#write pre code { background: transparent; padding: 0; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1.2em; }
#write table th, #write table td { border: 1px solid #ddd; padding: 8px 12px; }
#write ul, #write ol { padding-left: 1.8em; margin-bottom: 1.2em; }
#write hr { border: 0; border-top: 2px solid #ddd; margin: 2em 0; }`,

    "Resume": `/* Resume 风格：紧凑、适合简历 */
#write {
    font-family: "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: #333;
    background: #fff;
}
#write h1 {
    font-size: 1.9em;
    text-align: center;
    letter-spacing: 0.05em;
    margin-top: 0.4em;
    margin-bottom: 0.8em;
}
#write h2 {
    font-size: 1.25em;
    margin-top: 1.3em;
    margin-bottom: 0.5em;
    padding-bottom: 0.2em;
    border-bottom: 2px solid #333;
}
#write h3 { font-size: 1.05em; margin-top: 1em; margin-bottom: 0.3em; }
#write p { margin: 0 0 0.7em; }
#write a { color: #0366d6; text-decoration: none; }
#write blockquote { border-left: 3px solid #ddd; padding-left: 0.9em; color: #666; margin: 0 0 0.8em; }
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #f2f2f2;
    padding: 0.1em 0.3em;
    border-radius: 3px;
}
#write pre { background: #f2f2f2; padding: 0.9em; overflow: auto; border-radius: 4px; margin-bottom: 0.9em; }
#write pre code { background: transparent; padding: 0; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 0.9em; }
#write table th, #write table td { border: 1px solid #ddd; padding: 5px 10px; }
#write table th { background: #f7f7f7; }
#write ul, #write ol { padding-left: 1.6em; margin-bottom: 0.8em; }
#write li { margin: 0.15em 0; }
#write hr { border: 0; border-top: 1px solid #ddd; margin: 1.2em 0; }`,

    "Vue": `/* Vue 风格：绿主色、圆角、柔和 */
#write {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #34495e;
    background: #fff;
}
#write h1, #write h2, #write h3, #write h4, #write h5, #write h6 {
    color: #273849;
    font-weight: 600;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
#write h1 { font-size: 1.9em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
#write h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
#write h3 { font-size: 1.25em; }
#write p { margin: 0 0 1em; }
#write a { color: #42b983; text-decoration: none; }
#write a:hover { text-decoration: underline; }
#write blockquote {
    border-left: 4px solid #42b983;
    background: #f8f8f8;
    padding: 0.6em 1em;
    color: #666;
    margin: 0 0 1em;
}
#write code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.88em;
    color: #476582;
    background: rgba(27, 31, 35, 0.05);
    padding: 0.2em 0.4em;
    border-radius: 3px;
}
#write pre {
    background: #f8f8f8;
    padding: 1em;
    overflow: auto;
    border-radius: 6px;
    margin-bottom: 1em;
}
#write pre code { background: transparent; padding: 0; color: inherit; }
#write table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
#write table th, #write table td { border: 1px solid #dfe2e5; padding: 6px 13px; }
#write table th { background: #f6f8fa; font-weight: 600; }
#write ul, #write ol { padding-left: 2em; margin-bottom: 1em; }
#write hr { border: 0; border-top: 1px solid #eaecef; margin: 1.6em 0; }`,
};
