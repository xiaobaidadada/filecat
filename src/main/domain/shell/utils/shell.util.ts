

export const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    italic: "\x1b[3m",
    underline: "\x1b[4m",

    user: "\x1b[34m",   // 蓝色
    ai: "\x1b[32m",     // 绿色
    dim: "\x1b[90m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    red: "\x1b[31m",

    // 背景色
    bg_black: "\x1b[40m",

    // reset 组合
    bold_reset: "\x1b[22m",
    italic_reset: "\x1b[23m",
    underline_reset: "\x1b[24m",
};

/**
 * 流式 Markdown → ANSI 转换器
 *
 * 将常见的 Markdown 语法转为 xterm.js 可识别的 ANSI/VT 转义序列。
 * 支持流式场景：维护内部状态，每次 push 新的 chunk 并返回已转换的输出。
 *
 * 支持的语法：
 *  - **粗体**  → ANSI bold
 *  - *斜体*    → ANSI italic
 *  - `行内代码` → ANSI cyan
 *  - ```代码块``` → ANSI dim + 缩进
 *  - # 标题    → ANSI bold + underline
 *  - - 无序列表 → 保持缩进
 *  - [链接](url) → ANSI underline
 *  - > 引用    → ANSI dim
 *  - --- 分割线 → 一整行 ─
 *
 * 使用方式（流式）：
 *   const converter = new MarkdownToAnsiConverter();
 *   for (const chunk of aiStream) {
 *       const ansiText = converter.push(chunk);
 *       terminal.write(ansiText);
 *   }
 *   terminal.write(converter.flush());
 */
export class MarkdownToAnsiConverter {
    private buffer = ""; // 一直追加最新的输出数据

    private inCodeBlock = false; // 当前是代码块
    private codeBlockLang = ""; // 当前代码块的语言
    private codeBlockContent = ""; // 当前代码块的内容

    /**
     * 喂入一个新的 chunk，返回可以安全发送给 xterm.js 的 ANSI 文本。
     * 注意：由于需要处理跨 chunk 的语法（如 **粗体可能跨 chunk），
     * 会保留最后一个不完整标记在 buffer 中，直到确认完整。
     */
    push(chunk: string): string {
        this.buffer += chunk;
        let output = "";

        // 处理代码块（```...```）
        if (this.inCodeBlock) {
            const endIdx = this.buffer.indexOf("\n```");
            if (endIdx !== -1) {
                // 代码块结束
                this.codeBlockContent += this.buffer.slice(0, endIdx);
                output += this.renderCodeBlock(this.codeBlockContent, this.codeBlockLang);
                this.buffer = this.buffer.slice(endIdx + 4); // 跳过 \n```
                this.inCodeBlock = false;
                this.codeBlockContent = "";
                this.codeBlockLang = "";
                // 继续处理剩余内容
                output += this.push(""); // 递归处理剩余
            } else {
                // 还没结束，保留最后几个字符防止截断
                const safeLen = Math.max(0, this.buffer.length - 10);
                this.codeBlockContent += this.buffer.slice(0, safeLen);
                this.buffer = this.buffer.slice(safeLen);
                return "";
            }
            return output;
        }

        // 检测代码块开始
        const codeBlockStart = this.buffer.match(/\n```(\w*)\n/);
        if (codeBlockStart && codeBlockStart.index !== undefined) {
            const idx = codeBlockStart.index;
            const preContent = this.buffer.slice(0, idx + 1); // 包含换行
            output += this.renderInline(preContent);
            this.inCodeBlock = true;
            this.codeBlockLang = codeBlockStart[1] || "";
            this.buffer = this.buffer.slice(idx + codeBlockStart[0].length);
            // 递归处理剩余
            output += this.push("");
            return output;
        }

        // 还没有代码块，安全渲染行内内容
        // 保留最后一个不完整行（可能包含跨 chunk 标记）
        const lastNewline = this.buffer.lastIndexOf("\n");
        if (lastNewline === -1) {
            // 没有换行，全部保留等待
            return "";
        }

        const safePart = this.buffer.slice(0, lastNewline + 1);
        this.buffer = this.buffer.slice(lastNewline + 1);
        output += this.renderInline(safePart);
        return output;
    }

    /** 刷新缓冲区，返回剩余的 ANSI 文本（调用在流结束时） */
    flush(): string {
        if (this.inCodeBlock) {
            const out = this.renderCodeBlock(this.codeBlockContent + this.buffer, this.codeBlockLang);
            this.inCodeBlock = false;
            this.codeBlockContent = "";
            this.codeBlockLang = "";
            this.buffer = "";
            return out;
        }
        const out = this.renderInline(this.buffer);
        this.buffer = "";
        return out;
    }

    /** 重置状态 */
    reset() {
        this.buffer = "";
        this.inCodeBlock = false;
        this.codeBlockContent = "";
        this.codeBlockLang = "";
    }

    // ---- 内部渲染方法 ----

    private renderCodeBlock(content: string, lang: string): string {
        const lines = content.split("\n");
        const header = lang ? `${ANSI.dim}┌─ ${lang}${ANSI.reset}\n` : `${ANSI.dim}┌─ code${ANSI.reset}\n`;
        const body = lines.map(l => `${ANSI.dim}│ ${ANSI.cyan}${l}${ANSI.reset}`).join("\n");
        const footer = `\n${ANSI.dim}└─${"─".repeat(Math.min(40, content.length || 4))}${ANSI.reset}\n`;
        return header + body + footer;
    }

    // 核心 渲染一行 按行渲染输出 text 是一行
    private renderInline(text: string): string {
        if (!text) return "";
        let result = text;

        // 顺序很重要：先处理多字符标记，再处理单字符

        // 1. 标题 # ## ### ...
        result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, title) => {
            const level = hashes.length;
            const colors = [ANSI.red, ANSI.yellow, ANSI.green, ANSI.blue, ANSI.magenta, ANSI.cyan];
            const c = colors[Math.min(level - 1, colors.length - 1)];
            return `\n${ANSI.bold}${c}${title}${ANSI.reset}`;
        });

        // 2. 分割线 --- / *** / ___
        result = result.replace(/^(?:---|\*\*\*|___)\s*$/gm, () => {
            return `${ANSI.dim}${"─".repeat(40)}${ANSI.reset}`;
        });

        // 3. 引用 > text
        result = result.replace(/^>\s?(.*)$/gm, (_, quote) => {
            return `${ANSI.dim}▎${ANSI.italic}${quote}${ANSI.reset}`;
        });

        // 4. 行内代码 `code`
        result = result.replace(/`([^`]+)`/g, (_, code) => {
            return `${ANSI.bg_black}${ANSI.cyan} ${code} ${ANSI.reset}`;
        });

        // 5. 粗体+斜体 ***text*** 或 ___text___
        result = result.replace(/\*{3}(.+?)\*{3}/g, (_, t) =>
            `${ANSI.bold}${ANSI.italic}${t}${ANSI.italic_reset}${ANSI.bold_reset}`
        );
        result = result.replace(/_{3}(.+?)_{3}/g, (_, t) =>
            `${ANSI.bold}${ANSI.italic}${t}${ANSI.italic_reset}${ANSI.bold_reset}`
        );

        // 6. 粗体 **text** 或 __text__
        result = result.replace(/\*\*(.+?)\*\*/g, (_, t) =>
            `${ANSI.bold}${t}${ANSI.bold_reset}`
        );
        result = result.replace(/__(.+?)__/g, (_, t) =>
            `${ANSI.bold}${t}${ANSI.bold_reset}`
        );

        // 7. 斜体 *text* 或 _text_（注意不要匹配 ** 中的 *）
        result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) =>
            `${ANSI.italic}${t}${ANSI.italic_reset}`
        );
        result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (_, t) =>
            `${ANSI.italic}${t}${ANSI.italic_reset}`
        );

        // 8. 链接 [text](url)
        result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, (_, t) => {
            return `${ANSI.underline}${ANSI.blue}${t}${ANSI.underline_reset}${ANSI.reset}`;
        });

        // 9. 图片 ![alt](url) - 只是标记一下
        result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => {
            return `${ANSI.dim}[image: ${alt || "img"}]${ANSI.reset}`;
        });

        // 10. 删除线 ~~text~~
        result = result.replace(/~~(.+?)~~/g, (_, t) => {
            return `${ANSI.dim}${t}${ANSI.reset}`; // ANSI 没有删除线，用 dim 代替
        });

        // 11. 无序列表 - 或 * （开头）
        result = result.replace(/^(\s*)[-*]\s/gm, (_, indent) => {
            return `${indent}${ANSI.green}•${ANSI.reset} `;
        });

        // 12. 有序列表 1. 2. ...
        result = result.replace(/^(\s*)(\d+)\.\s/gm, (_, indent, num) => {
            return `${indent}${ANSI.green}${num}.${ANSI.reset} `;
        });

        return result;
    }
}

export class ShellUtil {

    public static render_progress(percent) {
        const width = 30; // 进度条宽度
        const filled = Math.round((percent / 100) * width);
        const empty = width - filled;

        const bar = "█".repeat(filled) + "░".repeat(empty);

        return `\r\x1b[K[${bar}] ${percent}%`;
    }

    public static color(text: string, type: "user" | "ai") {
        const color = type === "user" ? ANSI.user : ANSI.ai;
        return `${color}${text}${ANSI.reset}`;
    }

    public static write_line(text: string) {
        // 清空当前行 + 回到行首 + 输出
        return `\r\x1b[2K${text}`
    }
}