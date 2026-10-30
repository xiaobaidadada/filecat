import { readFile, writeFile } from "fs/promises";
import { ai_agent_params_type } from "../ai_agent.tools";
import { detect_eol, normalize_line_endings, restore_line_endings } from "../utils/file_read_core";
import { enqueue_file_task } from "../utils/file_queue";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";

/**
 * 生成简单的行级 diff，让模型确认这次改了什么。
 * 只输出被替换的片段，不做完整文件的 LCS。
 */
function build_diff(old_string: string, new_string: string): string {
    const lines: string[] = [];
    for (const line of old_string.split('\n')) lines.push(`- ${line}`);
    for (const line of new_string.split('\n')) lines.push(`+ ${line}`);
    return lines.join('\n');
}

export const edit_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "edit_file",
        description: "编辑文件，用 oldString 精确匹配文件中唯一的片段并替换成 newString。oldString 必须与文件内容完全一致（含缩进、空行、引号），建议先 read_file 拿到原文后照抄。匹配不到或出现多次都会失败。只支持 UTF-8 编码。",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "文件的绝对路径" },
                oldString: { type: "string", description: "需要被替换的旧代码段，必须与文件内容逐字符一致（含准确缩进）" },
                newString: { type: "string", description: "替换后的新代码段" },
                replaceAll: { type: "boolean", description: "是否替换所有匹配项" }
            },
            required: ["path", "oldString", "newString"]
        }
    }
};

export const edit_file_tool = async (
    ctx: Ai_agent_tool_ctx,
    { path, oldString, newString, replaceAll = false }: {
        path: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    },
) => {
    if (oldString === newString) {
        return { ok: false, message: "修改失败: oldString 和 newString 相同，无需修改" };
    }

    // 同一文件的多次编辑排进队列依次执行，避免并发读写互相覆盖
    return enqueue_file_task(path, async () => {
        try {
            // 检测原文件换行风格后归一化为 \n 再匹配，
            // 保证模型从 read_file 抄来的 LF 内容能匹配上 CRLF 文件
            const raw_content = await readFile(path, "utf-8");
            const eol = detect_eol(raw_content);
            const content = normalize_line_endings(raw_content);

            const index = content.indexOf(oldString);
            if (index === -1) {
                return { ok: false, message: "修改失败: 文件中找不到 oldString，请重新 read_file 后按原文照抄（注意缩进和空行）" };
            }

            let updated_content: string;
            if (replaceAll) {
                updated_content = content.split(oldString).join(newString);
            } else {
                if (index !== content.lastIndexOf(oldString)) {
                    return { ok: false, message: "修改失败: oldString 在文件中出现了多次，请提供更多上下文以唯一定位，或设置 replaceAll=true 替换全部" };
                }
                updated_content = content.substring(0, index) + newString + content.substring(index + oldString.length);
            }

            // 写回前还原成原文件的换行风格，不改动文件行尾
            updated_content = restore_line_endings(updated_content, eol);
            await writeFile(path, updated_content, 'utf-8');

            return {
                ok: true,
                message: "文件修改成功",
                diff: build_diff(oldString, newString),
            };
        } catch (e: any) {
            return { ok: false, message: `修改失败: ${e.message}` };
        }
    });
};
