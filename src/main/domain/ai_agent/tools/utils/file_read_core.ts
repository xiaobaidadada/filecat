/**
 * 文件读取核心：整体读取文件，超长时按字符数截断。
 *
 * 处理要点：
 *  1. 大文件不能整个塞进上下文 —— 超过字符上限就截断
 *  2. 平台换行差异（CRLF / LF）和 BOM 会污染长度计算 —— 读取时统一归一化
 *  3. 超长单行（压缩过的 js、min.css）会单独撑爆长度 —— 单行也截断
 */

import {readFile} from "fs/promises";

/** 默认最多返回的字符数（400 万字符） */
export const DEFAULT_MAX_CHARS = 4 * 1000 * 1000;

/** 单行最长字符数，超出部分截断，防止压缩代码把上下文撑爆 */
export const MAX_LINE_LENGTH = 2000;

export interface read_file_result {
    /** 归一化后的内容 */
    content: string;
    /** 返回的行数 */
    num_lines: number;
    /** 是否因为字符上限被截断 */
    truncated_by_chars: boolean;
    /** 是否有单行被截断 */
    truncated_long_line: boolean;
}

/**
 * 去掉 UTF-8 BOM，并把 CRLF 统一成 LF。
 * 不做这步的话，\r 会被当成内容的一部分。
 */
function normalize(text: string): string {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

/**
 * 读取整个文件。
 *
 * @param path 文件绝对路径
 * @param max_chars 字符上限，超出就截断
 * @param max_line_length 单行字符上限，超出就截断该行
 */
export async function read_file(
    path: string,
    max_chars: number ,
    max_line_length: number ,
): Promise<read_file_result> {
    max_chars = max_chars || DEFAULT_MAX_CHARS;
    max_line_length = max_line_length || MAX_LINE_LENGTH;
    // readFile 内部由 libuv 按块读取并合并，一次拿到完整 Buffer。
    // 不能用 handle.read 只调一次：返回值可能小于请求长度，会静默截断。
    const buf = await readFile(path);
    const text = normalize(buf.toString("utf-8"));

    const lines: string[] = [];
    let chars = 0;
    let truncated_by_chars = false;
    let truncated_long_line = false;

    let pos = 0;
    // pos < length 而非 <=：文件以换行结尾时，末尾换行之后没有内容，不该再产生空行
    while (pos < text.length) {
        let nl = text.indexOf("\n", pos);
        if (nl === -1) nl = text.length;

        let line = text.slice(pos, nl);
        if (line.length > max_line_length) {
            line = line.slice(0, max_line_length) + " … [本行过长已截断]";
            truncated_long_line = true;
        }

        // +1 是换行符本身占的字符
        if (chars + line.length + 1 > max_chars) {
            truncated_by_chars = true;
            break;
        }
        lines.push(line);
        chars += line.length + 1;

        pos = nl + 1;
    }

    return {
        content: lines.join("\n"),
        num_lines: lines.length,
        truncated_by_chars,
        truncated_long_line,
    };
}
