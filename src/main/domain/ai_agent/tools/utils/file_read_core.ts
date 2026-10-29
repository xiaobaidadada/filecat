/**
 * 文件读取核心：按行范围读取文件，并输出带行号的内容。
 *
 * 设计参考 Claude Code 的 readFileInRange，主要解决三个问题：
 *  1. 大文件不能整个读进内存/上下文 —— 先按行截断，再按字节截断
 *  2. 平台换行差异（CRLF / LF）和 BOM 会污染行号计算 —— 读取时统一归一化
 *  3. 超长单行（压缩过的 js、min.css）会单独撑爆字节数 —— 按字节二次截断
 */

import {readFile} from "fs/promises";
import {Stats} from "node:fs";

/** 默认最多返回的行数 */
export const DEFAULT_MAX_LINES = 2000;

/** 默认最多返回的字节数（256KB），超出则按字节截断 */
export const DEFAULT_MAX_BYTES = 256 * 1024;

/** 单行最长字符数，超出部分截断，防止压缩代码把上下文撑爆 */
export const MAX_LINE_LENGTH = 2000;

export interface read_range_result {
    /** 归一化后的内容（不含行号） */
    content: string;
    /** 实际返回的起始行号，1 开始 */
    start_line: number;
    /** 实际返回的行数 */
    num_lines: number;
    /** 文件总行数（仅在文件不大、做完整扫描时提供） */
    total_lines?: number;
    /** 是否因为行数上限被截断 */
    truncated_by_lines: boolean;
    /** 是否因为字节上限被截断 */
    truncated_by_bytes: boolean;
    /** 是否有单行被截断 */
    truncated_long_line: boolean;
}

/**
 * 去掉 UTF-8 BOM，并把 CRLF 统一成 LF。
 * 不做这步的话，行号会把 \r 算进去，模型看到的行和实际位置会对不上。
 */
function normalize(text: string): string {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

/**
 * 按行范围读取文件。
 *
 * @param file_path 文件绝对路径
 * @param offset 起始行号，1 开始（不传则从头读）
 * @param limit 读取行数（不传则用 DEFAULT_MAX_LINES）
 * @param max_bytes 字节上限（不传则用 DEFAULT_MAX_BYTES）
 * @param file_stat
 */
export async function read_file_in_range(
    file_stat: Stats,
    file_path: string,
    offset?: number,
    limit?: number,
    max_bytes: number = DEFAULT_MAX_BYTES,
): Promise<read_range_result> {
    const start_line = offset && offset > 0 ? offset : 1;
    const max_lines = limit && limit > 0 ? limit : DEFAULT_MAX_LINES;

    // readFile 一次读完即可。
    // 早先为了「避免大文件全塞内存」用 open + 分块循环，但那样每块都要
    // 解码 + 归一化 + split，还要处理跨块的半行拼接，复杂度高且容易出错；
    // 而 readFile 内部由 libuv 按块读取并合并，一次拿到完整 Buffer。
    //
    // 注意不能用 handle.read 只调一次：它的返回值可能小于请求长度，
    // 会导致内容被静默截断。readFile 会读满整个文件。
    const buf = await readFile(file_path);
    return slice_content(normalize(buf.toString("utf-8")), start_line, max_lines, max_bytes);
}


/**
 * 数行数：与 split("\n") 去掉末尾空元素后的长度等价，但不创建数组。
 * 空串按 0 行算（与原来 split 后 pop 得 [] 的行为一致）。
 */
function count_lines(content: string): number {
    if (!content) return 0;
    let count = 0;
    let pos = 0;
    while (true) {
        const nl = content.indexOf("\n", pos);
        if (nl === -1) break;
        count++;
        pos = nl + 1;
    }
    // 末尾没有换行时，最后一段也是一行
    if (content.charCodeAt(content.length - 1) !== 0x0a) count++;
    return count;
}

/**
 * 从已读入的完整内容里切出指定行范围。
 *
 * 不直接 content.split("\n")：大文件（上万行）split 会创建上万个字符串对象，
 * 而实际通常只需要前 2000 行。这里用 indexOf 定位换行符，只截取需要的区间，
 * 只有需要统计总行数时才完整扫一遍。
 */
function slice_content(
    content: string,
    start_line: number,
    max_lines: number,
    max_bytes: number,
): read_range_result {
    const picked: string[] = [];
    let bytes = 0;
    let truncated_by_bytes = false;
    let truncated_long_line = false;

    // 当前扫描位置，以及还需要跳过的行数
    let pos = 0;
    let skip = start_line - 1;

    // pos < length 而非 <=：文件以换行结尾时，末尾换行之后没有内容，
    // 不应该再产生一个空行
    while (pos < content.length) {
        if (picked.length >= max_lines) break;

        // 找下一个换行，找不到说明是最后一行
        let nl = content.indexOf("\n", pos);
        if (nl === -1) nl = content.length;

        if (skip > 0) {
            skip--;
        } else {
            let line = content.slice(pos, nl);
            if (line.length > MAX_LINE_LENGTH) {
                line = line.slice(0, MAX_LINE_LENGTH) + " … [本行过长已截断]";
                truncated_long_line = true;
            }
            const line_bytes = Buffer.byteLength(line, "utf8");
            if (bytes + line_bytes > max_bytes) {
                truncated_by_bytes = true;
                break;
            }
            picked.push(line);
            bytes += line_bytes;
        }

        pos = nl + 1;
    }

    // 统计总行数：计数用数换行符代替 split，避免为大文件造上万个字符串对象。
    // 旧版 split 全文后总能拿到总行数，这里保持一致：只要没被字节上限截断就给总数。
    let total_lines: number | undefined;
    if (!truncated_by_bytes) {
        total_lines = count_lines(content);
    }

    return {
        content: picked.join("\n"),
        start_line,
        num_lines: picked.length,
        total_lines,
        truncated_by_lines: picked.length >= max_lines,
        truncated_by_bytes,
        truncated_long_line,
    };
}

/**
 * 给内容加行号，格式与 cat -n 一致：行号右对齐 6 位 + Tab。
 * 保持这个格式是因为模型对 cat -n 的输出最熟悉，引用行号时不容易出错。
 *
 * 不用 split + map + join（会额外产生两个数组），直接在字符串上扫描换行符拼接。
 */
export function add_line_numbers(content: string, start_line: number): string {
    if (!content) return "";
    const out: string[] = [];
    let pos = 0;
    let line_no = start_line;
    while (true) {
        let nl = content.indexOf("\n", pos);
        if (nl === -1) {
            out.push(`${String(line_no).padStart(6, " ")}\t${content.slice(pos)}`);
            break;
        }
        out.push(`${String(line_no).padStart(6, " ")}\t${content.slice(pos, nl)}`);
        line_no++;
        pos = nl + 1;
        // 内容以换行结尾时不再产生额外行
        if (pos === content.length) break;
    }
    return out.join("\n");
}
