/**
 * 文件读取核心：按行范围读取文件，并输出带行号的内容。
 *
 * 设计参考 Claude Code 的 readFileInRange，主要解决三个问题：
 *  1. 大文件不能整个读进内存/上下文 —— 先按行截断，再按字节截断
 *  2. 平台换行差异（CRLF / LF）和 BOM 会污染行号计算 —— 读取时统一归一化
 *  3. 超长单行（压缩过的 js、min.css）会单独撑爆字节数 —— 按字节二次截断
 */

import {open, stat} from "fs/promises";
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
    const file_size = file_stat.size;
    const start_line = offset && offset > 0 ? offset : 1;
    const max_lines = limit && limit > 0 ? limit : DEFAULT_MAX_LINES;

    // 小文件一次性读进来，省掉流式处理的开销；
    // 大文件走流式，避免把几十 MB 一次性塞进内存
    const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024;
    if (file_size <= SMALL_FILE_THRESHOLD) {
        const handle = await open(file_path, "r");
        try {
            const buf = Buffer.allocUnsafe(file_size);
            await handle.read(buf, 0, file_size, 0);
            return slice_content(normalize(buf.toString("utf-8")), start_line, max_lines, max_bytes, true);
        } finally {
            await handle.close();
        }
    }

    // 大文件：流式逐块读取，凑够需要的行数就停，不读完整文件
    const CHUNK = 1024 * 1024;
    const handle = await open(file_path, "r");
    try {
        const collected: string[] = [];
        let position = 0;
        // 需要跳过的行数（start_line - 1）
        let remaining_skip = start_line - 1;
        let collected_bytes = 0;
        let truncated_by_bytes = false;
        let done = false;
        // 上一块末尾被切断的半行，需与本块开头拼接
        let carry = "";

        while (!done && position < file_size) {
            // 按剩余字节数分配缓冲，最后一块可能远小于 CHUNK，
            // 直接传 CHUNK 会让 handle.read 因越界抛 ERR_OUT_OF_RANGE
            const read_size = Math.min(CHUNK, file_size - position);
            const buf = Buffer.allocUnsafe(read_size);
            const {bytesRead} = await handle.read(buf, 0, read_size, position);
            if (bytesRead === 0) break;
            position += bytesRead;

            const text = carry + normalize(buf.subarray(0, bytesRead).toString("utf-8"));
            carry = "";
            const lines = text.split("\n");
            // 文件读完了，末尾的换行会切出一个空串，那不是真实的一行
            const at_eof = position >= file_size;
            if (at_eof && lines.length > 0 && lines[lines.length - 1] === "") {
                lines.pop();
            }

            for (let i = 0; i < lines.length; i++) {
                // 最后一段可能被块边界切断，暂存到 carry，等下一块拼上再处理。
                // 注意不能回退文件位置，否则同一行会被重复消费导致行号错位
                if (i === lines.length - 1 && !at_eof) {
                    carry = lines[i];
                    break;
                }
                if (remaining_skip > 0) {
                    remaining_skip--;
                    continue;
                }
                const line = lines[i];
                const line_bytes = Buffer.byteLength(line, "utf8");
                if (collected_bytes + line_bytes > max_bytes) {
                    truncated_by_bytes = true;
                    done = true;
                    break;
                }
                collected.push(line);
                collected_bytes += line_bytes;
                if (collected.length >= max_lines) {
                    done = true;
                    break;
                }
            }
        }

        // 文件末尾若有换行，split 会产生一个尾部空串，那不是真实的一行
        if (collected.length > 0 && collected[collected.length - 1] === "") {
            collected.pop();
        }

        const content = collected.join("\n");
        return {
            content,
            start_line,
            num_lines: collected.length,
            // 大文件不做全量扫描，不统计总行数，避免为了一个数字再读一遍
            total_lines: undefined,
            truncated_by_lines: collected.length >= max_lines,
            truncated_by_bytes,
            truncated_long_line: content.split("\n").some(l => l.length > MAX_LINE_LENGTH),
        };
    } finally {
        await handle.close();
    }
}

/** 从已读入的完整内容里切出指定行范围 */
function slice_content(
    content: string,
    start_line: number,
    max_lines: number,
    max_bytes: number,
    count_total: boolean,
): read_range_result {
    const all_lines = content.split("\n");
    // 末尾的换行会切出一个空元素，去掉它，避免总行数多算 1
    if (all_lines.length > 0 && all_lines[all_lines.length - 1] === "") all_lines.pop();

    const total_lines = count_total ? all_lines.length : undefined;
    const start_index = Math.min(start_line - 1, all_lines.length);

    const picked: string[] = [];
    let bytes = 0;
    let truncated_by_bytes = false;
    let truncated_long_line = false;

    for (let i = start_index; i < all_lines.length; i++) {
        if (picked.length >= max_lines) break;

        let line = all_lines[i];
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
 */
export function add_line_numbers(content: string, start_line: number): string {
    if (!content) return "";
    return content
        .split("\n")
        .map((line, i) => `${String(start_line + i).padStart(6, " ")}\t${line}`)
        .join("\n");
}
