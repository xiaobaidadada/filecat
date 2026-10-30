/**
 * 有界输出缓冲：只保留最近的一段输出。
 *
 * 命令输出可能非常大（cat 一个大文件、编译日志），全量留在内存里会撑爆进程。
 * 这里保留尾部而不是头部：命令出错时，真正的错误信息通常在最末尾，
 * 开头那些启动日志反而是次要的。
 *
 * 同时限制「行数」和「字节数」，任一超出就截断，因为两种极端都可能出现：
 *   - 每行都极短但行数极多（例如逐行打印）
 *   - 单行极长但没有换行（例如压缩过的 JSON、base64）
 */

/** 默认保留的最大字节数 */
export const DEFAULT_MAX_BYTES = 50 * 1024;

/** 默认保留的最大行数 */
export const DEFAULT_MAX_LINES = 2000;

/** 截断提示，放在结果末尾，让模型知道前面的内容被丢掉了 */
export const TRUNCATE_NOTICE = "\n...(输出过长，仅保留末尾部分)";

export class OutputTail {
    private text = "";
    private truncated = false;

    constructor(
        private readonly max_bytes: number = DEFAULT_MAX_BYTES,
        private readonly max_lines: number = DEFAULT_MAX_LINES,
    ) {
    }

    /** 追加一段输出 */
    append(chunk: string): void {
        if (!chunk) return;
        this.text += chunk;
        const bounded = tail(this.text, this.max_bytes, this.max_lines);
        // 一旦截断过就一直标记为截断，即使后续内容又把长度压下来了
        this.truncated = this.truncated || bounded.truncated;
        this.text = bounded.text;
    }

    /** 当前保留的内容 */
    value(): string {
        return this.text;
    }

    /** 是否发生过截断 */
    is_truncated(): boolean {
        return this.truncated;
    }

    /** 取出内容，被截断过就自动带上提示 */
    result(): string {
        return this.truncated ? this.text + TRUNCATE_NOTICE : this.text;
    }
}

/**
 * 取字符串的尾部，同时满足字节数和行数上限。
 *
 * 按字节截断时必须避免把一个多字节字符切成两半，否则会产生乱码。
 * 处理方式是：截断位置如果落在某个字符的中间（UTF-8 的续字节），
 * 就往后移动到该字符的起始字节。
 */
export function tail(value: string, max_bytes: number, max_lines: number): { text: string; truncated: boolean } {
    let truncated = false;
    let text = value;

    // 先按行数截断
    if (max_lines > 0) {
        let newline_count = 0;
        let cut_index = -1;
        // 从末尾往前数，找到第 max_lines 个换行
        for (let i = text.length - 1; i >= 0; i--) {
            if (text.charCodeAt(i) === 10) {
                newline_count++;
                if (newline_count > max_lines) {
                    cut_index = i + 1;
                    break;
                }
            }
        }
        if (cut_index > 0) {
            text = text.slice(cut_index);
            truncated = true;
        }
    }

    // 再按字节数截断
    if (max_bytes > 0) {
        const byte_length = Buffer.byteLength(text, "utf8");
        if (byte_length > max_bytes) {
            const bytes = Buffer.from(text, "utf8");
            let start = bytes.length - max_bytes;
            // 往后跳过 UTF-8 续字节（0b10xxxxxx），避免切碎多字节字符
            while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
                start++;
            }
            text = bytes.subarray(start).toString("utf8");
            truncated = true;
        }
    }

    return { text, truncated };
}
