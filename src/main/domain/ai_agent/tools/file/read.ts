import {readdir, stat} from "fs/promises";
import {read_file} from "../utils/file_read_core";
import pathModule from "path";
import {ai_agent_params_type} from "../ai_agent.tools";

export const read_file_schema:ai_agent_params_type = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "读取本地文本文件，返回整份内容。文件过大时可自行指定字符上限进行截断。只支持 UTF-8 编码。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件的绝对路径"
                },
                "max_chars": {
                    "type": "number",
                    "description": "最多返回的字符数，超出则截断。不传默认 4000000"
                }
            },
            "required": ["path"]
        }
    }
}

export const read_file_tool = async (
    session_id: string,
    { path, max_chars }: { path: string; max_chars?: number },
) => {
    const result = await read_file(path, max_chars);

    const hints: string[] = [];
    if (result.truncated) {
        hints.push(`文件超过单次返回上限，只返回了前 ${result.num_lines} 行，后续内容未返回`);
    }

    return JSON.stringify({
        file_path: path,
        num_lines: result.num_lines,
        truncated: result.truncated,
        file_content: result.content,
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
