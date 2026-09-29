
export const MD_THEME_BUILTIN_CSS: Record<string, string> = {
    "GitHub": `/* GitHub 风格 */
.md-editor-sheet {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #24292e;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #ffffff;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
.md-editor-sheet h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
.md-editor-sheet h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
.md-editor-sheet h3 { font-size: 1.25em; }
.md-editor-sheet h4 { font-size: 1em; }
.md-editor-sheet h5 { font-size: 0.875em; }
.md-editor-sheet h6 { font-size: 0.85em; color: #6a737d; }
.md-editor-sheet p { margin: 0 0 1em; }
.md-editor-sheet a { color: #0366d6; text-decoration: none; }
.md-editor-sheet a:hover { text-decoration: underline; }
.md-editor-sheet blockquote {
    padding: 0 1em;
    color: #6a737d;
    border-left: 0.25em solid #dfe2e5;
    margin: 0 0 1em;
}
.md-editor-sheet code {
    padding: 0.2em 0.4em;
    font-size: 85%;
    background-color: rgba(27, 31, 35, 0.05);
    border-radius: 3px;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}
.md-editor-sheet pre {
    padding: 1em;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    background-color: #f6f8fa;
    border-radius: 6px;
    margin-bottom: 1em;
}
.md-editor-sheet pre code { background: transparent; padding: 0; font-size: 100%; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
.md-editor-sheet table th, .md-editor-sheet table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
.md-editor-sheet table th { font-weight: 600; background: #f6f8fa; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 2em; margin-bottom: 1em; }
.md-editor-sheet li { margin: 0.25em 0; }
.md-editor-sheet hr { height: 0.25em; padding: 0; margin: 1.5em 0; background-color: #e1e4e8; border: 0; }
.md-editor-sheet img { max-width: 100%; }`,

    "Newsprint": `/* Newsprint 风格：衬线、报纸排版 */
.md-editor-sheet {
    font-family: "PT Serif", Georgia, "Songti SC", "SimSun", serif;
    font-size: 16px;
    line-height: 1.7;
    color: #333;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #f9f9f9;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    font-family: "PT Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: bold;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
}
.md-editor-sheet h1 { font-size: 1.8em; text-align: center; }
.md-editor-sheet h2 { font-size: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
.md-editor-sheet h3 { font-size: 1.3em; }
.md-editor-sheet p { margin: 0 0 1em; }
.md-editor-sheet a { color: #c0392b; }
.md-editor-sheet blockquote {
    font-style: italic;
    color: #666;
    border-left: 4px solid #ccc;
    padding-left: 1em;
    margin: 0 0 1em;
}
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #efefef;
    padding: 0.15em 0.35em;
    border-radius: 2px;
}
.md-editor-sheet pre {
    background: #efefef;
    padding: 1em;
    overflow: auto;
    border-left: 3px solid #ccc;
    margin-bottom: 1em;
}
.md-editor-sheet pre code { background: transparent; padding: 0; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #ccc; padding: 6px 10px; }
.md-editor-sheet table th { background: #eaeaea; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 1.8em; margin-bottom: 1em; }
.md-editor-sheet hr { border: 0; border-top: 1px solid #ccc; margin: 1.6em 0; }`,

    "Night": `/* Night 风格：深色 */
.md-editor-sheet {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #b8bfc6;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #363b40;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    color: #e0e0e0;
    font-weight: 600;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
.md-editor-sheet h1 { font-size: 1.9em; border-bottom: 1px solid #4a4f55; padding-bottom: 0.3em; }
.md-editor-sheet h2 { font-size: 1.5em; border-bottom: 1px solid #4a4f55; padding-bottom: 0.3em; }
.md-editor-sheet p { margin: 0 0 1em; }
.md-editor-sheet a { color: #4a89dc; }
.md-editor-sheet blockquote {
    border-left: 3px solid #4a89dc;
    padding-left: 1em;
    color: #909aa0;
    margin: 0 0 1em;
}
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #2b3035;
    color: #e8bf6a;
    padding: 0.15em 0.35em;
    border-radius: 3px;
}
.md-editor-sheet pre {
    background: #2b3035;
    padding: 1em;
    overflow: auto;
    border-radius: 4px;
    margin-bottom: 1em;
}
.md-editor-sheet pre code { background: transparent; padding: 0; color: #b8bfc6; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #4a4f55; padding: 6px 10px; }
.md-editor-sheet table th { background: #2e3033; color: #e0e0e0; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 1.8em; margin-bottom: 1em; }
.md-editor-sheet hr { border: 0; border-top: 1px solid #4a4f55; margin: 1.6em 0; }`,

    "Pixyll": `/* Pixyll 风格：宽行距、极简 */
.md-editor-sheet {
    font-family: "Merriweather", Georgia, "Songti SC", serif;
    font-size: 17px;
    line-height: 1.9;
    color: #333;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #fff;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    font-family: "Lato", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: 300;
    color: #222;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
}
.md-editor-sheet h1 { font-size: 2.1em; }
.md-editor-sheet h2 { font-size: 1.6em; }
.md-editor-sheet p { margin: 0 0 1.4em; }
.md-editor-sheet a { color: #0074d9; text-decoration: none; }
.md-editor-sheet a:hover { text-decoration: underline; }
.md-editor-sheet blockquote { color: #666; font-style: italic; border-left: 3px solid #eee; padding-left: 1em; }
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.88em;
    background: #f5f5f5;
    padding: 0.15em 0.4em;
    border-radius: 3px;
}
.md-editor-sheet pre { background: #f5f5f5; padding: 1em; overflow: auto; border-radius: 4px; margin-bottom: 1.2em; }
.md-editor-sheet pre code { background: transparent; padding: 0; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1.2em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #eee; padding: 8px 12px; }
.md-editor-sheet table th { background: #fafafa; font-weight: 500; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 1.8em; margin-bottom: 1.2em; }
.md-editor-sheet hr { border: 0; border-top: 1px solid #eee; margin: 2em 0; }`,

    "Whitey": `/* Whitey 风格：大字号、衬线、留白多 */
.md-editor-sheet {
    font-family: "Vollkorn", Palatino, Georgia, "Songti SC", serif;
    font-size: 19px;
    line-height: 1.7;
    color: #333;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #fefefe;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    font-family: "Vollkorn", Georgia, serif;
    font-weight: normal;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}
.md-editor-sheet h1 { font-size: 2em; }
.md-editor-sheet h2 { font-size: 1.6em; }
.md-editor-sheet h3 { font-size: 1.3em; }
.md-editor-sheet p { margin: 0 0 1.2em; }
.md-editor-sheet a { color: #000; border-bottom: 1px solid #999; text-decoration: none; }
.md-editor-sheet blockquote { border-left: 4px solid #ddd; padding-left: 1.2em; color: #555; font-style: italic; }
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.85em;
    background: #f0f0f0;
    padding: 0.15em 0.35em;
}
.md-editor-sheet pre { background: #f0f0f0; padding: 1em; overflow: auto; margin-bottom: 1.2em; }
.md-editor-sheet pre code { background: transparent; padding: 0; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1.2em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #ddd; padding: 8px 12px; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 1.8em; margin-bottom: 1.2em; }
.md-editor-sheet hr { border: 0; border-top: 2px solid #ddd; margin: 2em 0; }`,

    "Resume": `/* Resume 风格：紧凑、适合简历 */
.md-editor-sheet {
    font-family: "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: #333;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #fff;
}
.md-editor-sheet h1 {
    font-size: 1.9em;
    text-align: center;
    letter-spacing: 0.05em;
    margin-top: 0.4em;
    margin-bottom: 0.8em;
}
.md-editor-sheet h2 {
    font-size: 1.25em;
    margin-top: 1.3em;
    margin-bottom: 0.5em;
    padding-bottom: 0.2em;
    border-bottom: 2px solid #333;
}
.md-editor-sheet h3 { font-size: 1.05em; margin-top: 1em; margin-bottom: 0.3em; }
.md-editor-sheet p { margin: 0 0 0.7em; }
.md-editor-sheet a { color: #0366d6; text-decoration: none; }
.md-editor-sheet blockquote { border-left: 3px solid #ddd; padding-left: 0.9em; color: #666; margin: 0 0 0.8em; }
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #f2f2f2;
    padding: 0.1em 0.3em;
    border-radius: 3px;
}
.md-editor-sheet pre { background: #f2f2f2; padding: 0.9em; overflow: auto; border-radius: 4px; margin-bottom: 0.9em; }
.md-editor-sheet pre code { background: transparent; padding: 0; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 0.9em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #ddd; padding: 5px 10px; }
.md-editor-sheet table th { background: #f7f7f7; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 1.6em; margin-bottom: 0.8em; }
.md-editor-sheet li { margin: 0.15em 0; }
.md-editor-sheet hr { border: 0; border-top: 1px solid #ddd; margin: 1.2em 0; }`,

    "Vue": `/* Vue 风格：绿主色、圆角、柔和 */
.md-editor-sheet {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #34495e;
}
/* 整页底色写在滚动容器上，写在纸张上长文档一滚就会露底 */
.md-editor-scroll {
    background: #fff;
}
.md-editor-sheet h1, .md-editor-sheet h2, .md-editor-sheet h3, .md-editor-sheet h4, .md-editor-sheet h5, .md-editor-sheet h6 {
    color: #273849;
    font-weight: 600;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
}
.md-editor-sheet h1 { font-size: 1.9em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
.md-editor-sheet h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
.md-editor-sheet h3 { font-size: 1.25em; }
.md-editor-sheet p { margin: 0 0 1em; }
.md-editor-sheet a { color: #42b983; text-decoration: none; }
.md-editor-sheet a:hover { text-decoration: underline; }
.md-editor-sheet blockquote {
    border-left: 4px solid #42b983;
    background: #f8f8f8;
    padding: 0.6em 1em;
    color: #666;
    margin: 0 0 1em;
}
.md-editor-sheet code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.88em;
    color: #476582;
    background: rgba(27, 31, 35, 0.05);
    padding: 0.2em 0.4em;
    border-radius: 3px;
}
.md-editor-sheet pre {
    background: #f8f8f8;
    padding: 1em;
    overflow: auto;
    border-radius: 6px;
    margin-bottom: 1em;
}
.md-editor-sheet pre code { background: transparent; padding: 0; color: inherit; }
.md-editor-sheet table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
.md-editor-sheet table th, .md-editor-sheet table td { border: 1px solid #dfe2e5; padding: 6px 13px; }
.md-editor-sheet table th { background: #f6f8fa; font-weight: 600; }
.md-editor-sheet ul, .md-editor-sheet ol { padding-left: 2em; margin-bottom: 1em; }
.md-editor-sheet hr { border: 0; border-top: 1px solid #eaecef; margin: 1.6em 0; }`,
};
