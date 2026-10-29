import {mkdir, writeFile} from "fs/promises";
import pathLib from "path"; // 导入 path 模块
import {ai_agent_params_type} from "../ai_agent.tools";
import {enqueue_file_task} from "../utils/file_queue";

export const create_fs_entry_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "create_fs_entry",
        description: "创建文件或目录，支持初始化文件内容和递归创建目录",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "绝对路径的文件或目录"
                },
                type: {
                    type: "string",
                    enum: ["file", "dir"],
                    description: "创建类型：file=文件，dir=目录"
                },
                content: {
                    type: "string",
                    description: "文件初始内容，仅在 type=file 时生效"
                },
                recursive: {
                    type: "boolean",
                    description: "是否递归创建目录，仅在 type=dir 时生效，默认 true"
                }
            },
            required: ["path", "type"]
        }
    }
}


export const create_fs_entry_tool = async (
    session_id: string,
    {
        path,
        type = "file",
        content = "",
        recursive = true,
    }: {
        path: string;
        type?: "file" | "dir";
        content?: string;
        recursive?: boolean;
    },
) => {
    // 使用 pathLib.normalize 确保路径格式正确，处理跨平台差异
    const normalizedPath = pathLib.normalize(path);

    // 同一路径的写操作排进队列依次执行，避免和并发的 edit_file 互相覆盖
    return enqueue_file_task(normalizedPath, async () => {
        // =========================
        // 📁 创建目录
        // =========================
        if (type === "dir") {
            await mkdir(normalizedPath, { recursive });
            return { ok: true, type, path: normalizedPath, created: true };
        }

        // =========================
        // 📄 创建文件
        // =========================
        if (type === "file") {
            // 使用 pathLib.dirname 自动获取父目录，无需手动计算字符串位置
            const dir = pathLib.dirname(normalizedPath);

            await mkdir(dir, { recursive: true });
            await writeFile(normalizedPath, content ?? "", "utf-8");

            return {
                ok: true,
                type,
                path: normalizedPath,
                created: true,
                hasContent: !!content
            };
        }

        throw new Error("invalid type: must be file or dir");
    });
}
