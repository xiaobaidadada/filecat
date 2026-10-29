import {readdir, readFile, stat} from "fs/promises";
import {ai_agent_params_type} from "../utils/ai_agent.constant";
import {add_line_numbers, read_file_in_range} from "../utils/file_read_core";
import {clear_session_file_state, mark_file_read} from "../utils/file_read_state";
import {register_session_cleaner} from "../session/session_cleanup";
import pathModule from "path";

// 会话结束时清掉这个会话记录的文件读取状态，避免缓存无限增长
register_session_cleaner("read_file", (session_id) => clear_session_file_state(session_id));

export const read_file_schema:ai_agent_params_type = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "读取本地文本文件内容，返回带行号的内容。文件较大时使用 offset/limit 分段读取，不要一次读完整个大文件。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件的绝对路径"
                },
                "offset": {
                    "type": "number",
                    "description": "从第几行开始读（1 开始计数），不传则从头开始"
                },
                "limit": {
                    "type": "number",
                    "description": "读取多少行，不传则默认 2000 行"
                }
            },
            "required": ["path"]
        }
    }
}

export const read_file_tool = async (
    session_id: string,
    { path, offset, limit }: { path: string; offset?: number; limit?: number },
) => {
    const info = await stat(path);

    // 目录不能按文本读，给出明确提示而不是抛 EISDIR
    if (info.isDirectory()) {
        return JSON.stringify({
            error: `${path} 是目录，不是文件。查看目录内容请使用 list_files。`
        });
    }
    const result = await read_file_in_range(info, path, offset, limit);

    // 记录读取状态，供 edit_file 判断文件是否在读取后被外部改动。
    //
    // 需要的是磁盘原文，而 result.content 是给模型看的：
    // 去掉了 BOM、CRLF 归一化成 LF、去掉了末尾换行，不能直接当缓存，
    // 否则 edit_file 每次都会误判「文件已被改动」。这里单独读一次原文。
    const content = await readFile(path, "utf-8");


    mark_file_read(session_id, path, {
        content,
        timestamp: Math.floor(info.mtimeMs),
        size: info.size,
        offset: offset && offset > 0 ? offset : undefined,
        limit: limit && limit > 0 ? limit : undefined,
    });

    // 一行都没读到，通常是 offset 超出了文件末尾
    if (result.num_lines === 0) {
        return JSON.stringify({
            error: `没有读到内容。文件共 ${result.total_lines ?? "未知"} 行，起始行 ${result.start_line} 已超出范围。`
        });
    }

    const end_line = result.start_line + result.num_lines - 1;

    // 把截断原因说清楚，模型才知道下一步该怎么继续读
    const hints: string[] = [];
    if (result.truncated_by_lines) {
        hints.push(`已达到单次最多 ${result.num_lines} 行的上限，如需继续请使用 offset=${end_line + 1}`);
    }
    if (result.truncated_by_bytes) {
        hints.push("已达到单次读取的字节上限，如需继续请使用 offset 分段读取");
    }
    if (result.truncated_long_line) {
        hints.push("文件中存在超长行，已按行截断显示");
    }

    return JSON.stringify({
        file_path: path,
        start_line: result.start_line,
        num_lines: result.num_lines,
        end_line,
        total_lines: result.total_lines,
        truncated: result.truncated_by_lines || result.truncated_by_bytes,
        file_content: add_line_numbers(result.content, result.start_line),
        hint: hints.length > 0 ? hints.join("；") : undefined,
    });
}

export const list_files_schema:ai_agent_params_type =   {
    type: "function",
    function: {
        name: "list_files",
        description: "列出指定目录下的文件和文件夹，以树形结构展示",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "要列出的目录路径，默认为当前目录"
                },
                depth: {
                    type: "number",
                    description: "递归打印的深度，默认为1（仅当前目录），设为0表示不限制深度"
                },
                ignore: {
                    type: "array",
                    items: { type: "string" },
                    description: "要忽略的文件/文件夹名称列表，默认为 [\"node_modules\"]（如 node_modules, .git, dist 等）"
                }
            },
            required: ['path']
        }
    }
}

// 目录项上限，避免在一个几万文件的目录下把结果全塞进上下文
const LIST_MAX_ENTRIES = 1000;

/**
 * 递归构建树形目录结构。
 *
 * 用数组收集行再统一 join，避免在循环里不断拼接字符串（每次 += 都会复制整个串）。
 * 同时顺带维护条目计数，超过上限就立即停止遍历：
 * 既省掉后续「数行数」的字符串二次处理，也避免在大目录下做无用的递归。
 */
async function buildTree(
    dirPath: string,
    depth: number,
    ignore: string[],
    out: string[],
    total: { count: number },
    prefix: string = '',
    currentDepth: number = 0,
): Promise<void> {
    if (depth > 0 && currentDepth >= depth) return;
    // 已超出上限，不再往下读目录
    if (total.count > LIST_MAX_ENTRIES) return;

    const entries = await readdir(dirPath, {withFileTypes: true});
    // 过滤掉忽略列表中的条目
    const filtered = entries.filter(e => !ignore.includes(e.name));

    for (let i = 0; i < filtered.length; i++) {
        if (total.count > LIST_MAX_ENTRIES) return;

        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const nextPrefix = isLast ? '     ' : '│    ';

        out.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}`);
        total.count++;

        if (entry.isDirectory()) {
            await buildTree(
                pathModule.join(dirPath, entry.name),
                depth,
                ignore,
                out,
                total,
                prefix + nextPrefix,
                currentDepth + 1
            );
        }
    }
}

export const list_files_tool = async (
    session_id: string,
    { path = '.', depth = 1, ignore = ['node_modules'] }: { path?: string; depth?: number; ignore?: string[] },
) => {
    // 检查路径是否存在
    try {
        await stat(path);
    } catch {
        return `错误: 路径 "${path}" 不存在`;
    }

    const lines: string[] = [];
    const total = {count: 0};
    await buildTree(path, depth, ignore, lines, total);

    // 条目过多时截断，并提示用更小的 depth 或加 ignore。
    // 计数在遍历时已维护，这里直接判断，不再把树拆成数组数行数。
    if (total.count > LIST_MAX_ENTRIES) {
        const head = lines.slice(0, LIST_MAX_ENTRIES).join('\n');
        return `${path}/\n${head}\n\n... 目录项过多，仅显示前 ${LIST_MAX_ENTRIES} 项（实际项数超过该上限）。请减小 depth、补充 ignore，或直接 list 子目录。`;
    }

    return `${path}/\n${lines.join('\n')}`;
}
