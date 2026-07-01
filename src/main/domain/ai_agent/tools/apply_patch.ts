import { readFile, writeFile, unlink } from "fs/promises";
import * as Diff from "diff";
import path from "path";
import fs from "fs";
import { FileUtil } from "../../file/FileUtil";

export const apply_patch_tool = async ({ path: targetPath, text: patchText }: { path: string, text: string }) => {
    // 1. 严格校验绝对路径
    if (!path.isAbsolute(targetPath)) {
        return { ok: false, error: `路径必须是完整的绝对路径: ${targetPath}` };
    }

    if (!await FileUtil.access(targetPath)) {
        return { ok: false, error: `文件不存在: ${targetPath}` };
    }

    // 2. 解析补丁文本
    const patches = Diff.parsePatch(patchText);
    if (!patches || patches.length === 0) {
        return { ok: false, error: "无法解析补丁内容，请确保提供的是标准的 Unified Diff 格式" };
    }

    // 3. 限制一次只能处理一个文件
    if (patches.length > 1) {
        return { ok: false, error: "该工具一次只能修改一个文件，请针对每个文件分别调用本工具" };
    }

    const patch = patches[0];

    try {
        // 读取原文并备份
        const original = await readFile(targetPath, 'utf-8');
        const backupPath = `${targetPath}.bak`;
        await writeFile(backupPath, original);

        try {
            // 4. 将补丁应用到目标文件
            const patched = Diff.applyPatch(original, patch);

            if (patched === false) {
                throw new Error(`补丁上下文无法与当前文件匹配，请检查是否基于最新代码生成`);
            }

            await writeFile(targetPath, patched, 'utf-8');
            await unlink(backupPath);
            return { ok: true, message: `操作完成: 已成功更新文件 ${targetPath}` };

        } catch (err: any) {
            // 应用失败时回滚
            await writeFile(targetPath, original);
            await unlink(backupPath);
            throw err;
        }
    } catch (error: any) {
        return { ok: false, error: `更新文件 ${targetPath} 失败: ${error.message}` };
    }
};

export const apply_patch_schema = {
    type: "function",
    function: {
        name: "apply_patch",
        description: "高级代码补丁应用工具，一次仅限修改一个文件。必须使用标准的 Unified Diff 格式修改现有文件。优先使用 edit_file 修改文件，不要使用这个。",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "要修改的目标文件的完整绝对路径"
                },
                text: {
                    type: "string",
                    description: "仅针对该文件的标准 Unified Diff 格式文本。请提供上下文信息（@@ -x,y +x,y @@）以便准确匹配。"
                }
            },
            required: ["path", "text"]
        }
    }
};