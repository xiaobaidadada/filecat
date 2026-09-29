/**
 * md 主题编辑页用到的两个常量：
 *   MD_THEME_TEMPLATE       新建主题时预填的 css 模板，逐条说明常用属性
 *   MD_THEME_PREVIEW_DEFAULT 预览用的示例文档（覆盖所有 markdown 元素）
 */

/**
 * 新建主题的 css 模板。
 * 选择器直接写 .md-editor-sheet —— 编辑器和主题预览共用的正文容器类名。
 * css 原样注入，不做任何改写：写什么就生效什么（写 body 这类全局选择器会真的全局生效，慎用）。
 */
export const MD_THEME_TEMPLATE = `/* ===== md 主题 =====
   选择器请从 .md-editor-sheet 开始写 —— 它是正文容器的类名，
   编辑器与右侧预览用的是同一个类名，一处书写、两处生效。

   注意：css 原样注入页面，不做任何改写。
   写成 body、h1 这种全局选择器会真的作用到整个后台界面，不要这么写。

   下面每一组都可以直接改，不需要的整段删掉即可。
   ============================================ */

/* ---------- 正文 ---------- */
.md-editor-sheet {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; /* 字体 */
    font-size: 16px;        /* 字号 */
    line-height: 1.7;       /* 行高：1.7 约为字号的 1.7 倍 */
    color: #333333;         /* 文字颜色 */
}

/* ---------- 整页底色 ----------
   底色必须写在 .md-editor-scroll（滚动容器）上，不要写在 .md-editor-sheet。
   纸张高度只有一屏，写在纸张上的底色长文档一滚就露底（上半截有色、下半截变回灰）。
   深色主题尤其要注意：这一条不写，滚动时就会白一半黑一半。 */
.md-editor-scroll {
    background: #ffffff;
}

/* ---------- 标题 h1 ~ h6 ---------- */
.md-editor-sheet h1 {
    font-size: 2em;                       /* 相对正文字号的倍数 */
    font-weight: 600;                     /* 字重：400 常规 / 600 半粗 / 700 粗 */
    color: #1a1a1a;
    margin-top: 1.4em;
    margin-bottom: 0.6em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #eaecef;     /* 标题下划线，不需要就删掉这行 */
}
.md-editor-sheet h2 { font-size: 1.5em; font-weight: 600; margin-top: 1.3em; margin-bottom: 0.6em; }
.md-editor-sheet h3 { font-size: 1.25em; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.5em; }
.md-editor-sheet h4 { font-size: 1em;    font-weight: 600; margin-top: 1.1em; margin-bottom: 0.5em; }
.md-editor-sheet h5 { font-size: 0.9em;  font-weight: 600; margin-top: 1em;   margin-bottom: 0.5em; }
.md-editor-sheet h6 { font-size: 0.85em; font-weight: 600; color: #6a737d;    margin-top: 1em; margin-bottom: 0.5em; }

/* ---------- 段落与行内元素 ---------- */
.md-editor-sheet p {
    margin: 0 0 1em;        /* 段落间距：上 右 下 左，下边距控制段与段的距离 */
}
.md-editor-sheet strong { font-weight: 600; }                  /* 加粗文字 */
.md-editor-sheet em { font-style: italic; }                    /* 斜体文字 */
.md-editor-sheet a { color: #0366d6; text-decoration: none; }  /* 链接颜色；加下划线写 underline */
.md-editor-sheet a:hover { text-decoration: underline; }       /* 鼠标悬停时的链接样式 */
.md-editor-sheet del { color: #999999; }                       /* 删除线文字 */

/* ---------- 引用 ---------- */
.md-editor-sheet blockquote {
    margin: 0 0 1em;
    padding: 0.4em 1em;
    color: #6a737d;                     /* 引用文字颜色 */
    border-left: 4px solid #dfe2e5;     /* 左侧竖线，这是引用最明显的特征 */
    background: #f6f8fa;                /* 引用底色，不需要就删掉 */
}

/* ---------- 代码 ---------- */
.md-editor-sheet code {
    font-family: Consolas, Monaco, "Courier New", monospace; /* 等宽字体 */
    font-size: 0.88em;
    color: #476582;                     /* 行内代码文字色 */
    background: rgba(27, 31, 35, 0.05); /* 行内代码底色 */
    padding: 0.2em 0.4em;
    border-radius: 3px;                 /* 圆角 */
}
.md-editor-sheet pre {
    padding: 1em;
    overflow: auto;                     /* 内容太宽时出现横向滚动条 */
    background: #f6f8fa;                /* 代码块底色 */
    border-radius: 6px;
    margin: 0 0 1em;
}
.md-editor-sheet pre code {
    background: transparent;            /* 代码块里的 code 不要再叠一层底色 */
    padding: 0;
}

/* ---------- 列表 ---------- */
.md-editor-sheet ul, .md-editor-sheet ol {
    padding-left: 2em;      /* 缩进 */
    margin: 0 0 1em;
}
.md-editor-sheet li { margin: 0.25em 0; }       /* 列表项之间的间距 */

/* ---------- 表格 ---------- */
.md-editor-sheet table {
    width: 100%;
    border-collapse: collapse;   /* 相邻边框合并成一条线 */
    margin: 0 0 1em;
}
.md-editor-sheet table th, .md-editor-sheet table td {
    padding: 6px 13px;
    border: 1px solid #dfe2e5;   /* 单元格边框 */
}
.md-editor-sheet table th {
    font-weight: 600;
    background: #f6f8fa;         /* 表头底色 */
}

/* ---------- 分割线 ---------- */
.md-editor-sheet hr {
    height: 1px;                 /* 线的粗细 */
    border: 0;
    background: #e1e4e8;         /* 线的颜色 */
    margin: 1.6em 0;
}

/* ---------- 图片 ---------- */
.md-editor-sheet img {
    max-width: 100%;             /* 防止大图撑破版面 */
    border-radius: 4px;
}
`;

/**
 * 预览用的示例文档。
 * 覆盖 h1~h6、列表、引用、代码、表格、分割线、图片等所有元素，
 * 这样调主题时能一次看全效果，不用等打开一个内容丰富的文件。
 */
export const MD_THEME_PREVIEW_DEFAULT = `# 一级标题 Heading 1

## 二级标题 Heading 2

### 三级标题 Heading 3

#### 四级标题 Heading 4

##### 五级标题 Heading 5

###### 六级标题 Heading 6

这是一段普通正文，用来观察字体、字号、行高和文字颜色。中间可以包含 **加粗文字**、*斜体文字*、~~删除线~~、\`行内代码\` 以及 [一个链接](https://github.com/xiaobaidadada/filecat)。

> 这是一段引用文字。
> 引用通常用来强调摘录的内容，左侧一般会有一条竖线。

- 无序列表第一项
- 无序列表第二项
  - 嵌套的子项
- 无序列表第三项

1. 有序列表第一项
2. 有序列表第二项
3. 有序列表第三项

\`\`\`javascript
// 代码块
function greet(name) {
    console.log(\`Hello, \${name}!\`);
}
greet("filecat");
\`\`\`

| 列一 | 列二 | 列三 |
| --- | --- | --- |
| 内容 A | 内容 B | 内容 C |
| 内容 D | 内容 E | 内容 F |

---

最后一段正文，用于观察段落之间的间距。
`;
