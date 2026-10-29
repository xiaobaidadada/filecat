/**
 * 文件读取核心：整体读取文件，超过字符上限时截断。
 *
 * 处理要点：
 *  1. 大文件不能整个塞进上下文 —— 超过字符上限就截断
 *  2. 统一换行符为 \n 返回给模型：模型无法分辨 \r\n 与 \n 的 token 差异，
 *     照抄时会把 \r 丢掉导致 edit_file 匹配失败，所以这里剥掉每行行尾的 \r
 *  3. 只支持 UTF-8，其它编码按 UTF-8 读出来就是乱码
 */

import {readFile} from "fs/promises";

/** 默认最多返回的字符数（400 万字符） */
export const DEFAULT_MAX_CHARS = 4 * 1000 * 1000;

export interface read_file_result {
    /** 文件内容，换行已归一化为 \n */
    content: string;
    /** 返回的行数 */
    num_lines: number;
    /** 是否因为字符上限被截断 */
    truncated: boolean;
}

/**
 * 归一化换行符：CRLF 与 CR 全部转成 LF。
 *
 * 模型看到的内容永远只有 \n，抄写时不会因为丢失 \r 而匹配失败。
 */
export function normalize_line_endings(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

/**
 * 还原换行符：把 LF 还原成原文件使用的换行符。
 *
 * 写入前用一次，保证文件本身的换行风格不被改动。
 */
export function restore_line_endings(text: string, eol: string): string {
    if (eol === "\n") return text;
    return text.replace(/\n/g, eol);
}

/** 判断文件使用的换行符：优先 CRLF，其次单独的 CR，否则按 LF */
export function detect_eol(text: string): string {
    if (text.includes("\r\n")) return "\r\n";
    if (text.includes("\r")) return "\r";
    return "\n";
}

/**
 * 读取整个文件。
 *
 * @param path 文件绝对路径
 * @param max_chars 字符上限，超出就截断
 */
export async function read_file(path: string, max_chars: number = DEFAULT_MAX_CHARS): Promise<read_file_result> {
    // readFile 内部由 libuv 按块读取并合并，一次拿到完整内容。
    // 不能用 handle.read 只调一次：返回值可能小于请求长度，会静默截断。
    // 内容统一归一化为 \n，模型拿到的文本可以直接用于 edit_file 匹配。
    const text = normalize_line_endings(await readFile(path, "utf-8"));

    // 超长单行不单独处理，统一由字符上限兜住
    if (text.length <= max_chars) {
        return {
            content: text,
            num_lines: count_lines(text),
            truncated: false,
        };
    }

    // 截断点回退到最近的换行符，避免把一行切成半截
    let cut = text.lastIndexOf("\n", max_chars);
    if (cut <= 0) cut = max_chars;

    const content = text.slice(0, cut);
    return {
        content,
        num_lines: count_lines(content),
        truncated: true,
    };
}

/** 计算行数：末尾换行之后没有内容，不算一行 */
function count_lines(text: string): number {
    if (!text) return 0;
    let count = 1;
    let pos = 0;
    while (true) {
        const nl = text.indexOf("\n", pos);
        if (nl === -1) break;
        count++;
        pos = nl + 1;
        if (pos === text.length) {
            count--;
            break;
        }
    }
    return count;
}
