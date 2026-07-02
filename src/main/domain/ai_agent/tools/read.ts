import {readdir, readFile, stat} from "fs/promises";
import {ai_agent_params_type} from "./ai_agent.constant";
import pathModule from "path";


export const read_file_schema:ai_agent_params_type = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "获取本地文本类型的文件的内容",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件的绝对路径"
                }
            },
            "required": ["path"]
        }
    }
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

/**
 * 递归构建树形目录结构字符串
 */
async function buildTree(dirPath: string, depth: number, ignore: string[], prefix: string = '', currentDepth: number = 0): Promise<string> {
    if (depth > 0 && currentDepth >= depth) return '';

    const entries = await readdir(dirPath, {withFileTypes: true});
    // 过滤掉忽略列表中的条目
    const filtered = entries.filter(e => !ignore.includes(e.name));

    let result = '';
    for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const nextPrefix = isLast ? '     ' : '│    ';

        result += `${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

        if (entry.isDirectory()) {
            const sub = await buildTree(
                pathModule.join(dirPath, entry.name),
                depth,
                ignore,
                prefix + nextPrefix,
                currentDepth + 1
            );
            result += sub;
        }
    }
    return result;
}

export const list_files_tool = async ({path = '.', depth = 1, ignore = ['node_modules']}: { path?: string; depth?: number; ignore?: string[] }) => {
    // 检查路径是否存在
    try {
        await stat(path);
    } catch {
        return `错误: 路径 "${path}" 不存在`;
    }

    const tree = await buildTree(path, depth, ignore);
    return `${path}/\n${tree}`;
}

export const read_file_tool = async ({path}) => {
    const content = await readFile(path, 'utf-8');
    return JSON.stringify({
        file_path: path,
        file_content: content,
    });
}