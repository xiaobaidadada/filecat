
export const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",

    user: "\x1b[34m",   // 蓝色
    ai: "\x1b[32m",     // 绿色
    dim: "\x1b[90m"
};

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