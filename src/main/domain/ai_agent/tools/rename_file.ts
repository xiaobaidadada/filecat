import {rename} from "fs/promises";
import pathLib from "path";
import {access} from "fs/promises";
import {ai_agent_params_type} from "./ai_agent.constant";

export const rename_file_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "rename_file",
        description: "重命名或移动文件/目录。源路径和目标路径的父目录必须存在。",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "源文件或目录的绝对路径"
                },
                newPath: {
                    type: "string",
                    description: "目标新路径（绝对路径）"
                }
            },
            required: ["path", "newPath"]
        }
    }
};

export const rename_file_tool = async ({path, newPath}: {
    path: string;
    newPath: string;
}) => {
    try {
        const src = pathLib.normalize(path);
        const dst = pathLib.normalize(newPath);

        // 源必须存在
        await access(src);

        // 目标不能已存在，避免覆盖
        try {
            await access(dst);
            return {ok: false, message: `目标路径已存在：${dst}`};
        } catch {
            // 不存在才继续
        }

        await rename(src, dst);
        return {ok: true, message: `已重命名：${src} → ${dst}`, path: src, newPath: dst};
    } catch (e: any) {
        return {ok: false, message: `重命名失败: ${e.message}`};
    }
};
