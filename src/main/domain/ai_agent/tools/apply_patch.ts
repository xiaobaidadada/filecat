import { readFile, writeFile, unlink } from "fs/promises";
import * as Diff from "diff";
import { FileUtil } from "../../file/FileUtil";
import path from "path";
import fs from "fs";

/**
 * 健壮的补丁解析器
 */
function parseCustomPatch(patchText: string) {
    const operations: any[] = [];
    const blocks = patchText.split(/\*\*\* /).filter(b => b.trim() !== "");

    for (const block of blocks) {
        const lines = block.split('\n');
        const header = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();

        if (header.startsWith('Add File:')) {
            operations.push({ type: 'add', path: header.replace('Add File:', '').trim(), content });
        } else if (header.startsWith('Delete File:')) {
            operations.push({ type: 'delete', path: header.replace('Delete File:', '').trim() });
        } else if (header.startsWith('Update File:')) {
            operations.push({ type: 'update', path: header.replace('Update File:', '').trim(), content });
        }
    }
    return operations;
}

export const apply_patch_tool = async ({ patchText }: { patchText: string }) => {
    const operations = parseCustomPatch(patchText);
    const results = [];

    for (const op of operations) {
        // 校验是否为绝对路径
        if (!path.isAbsolute(op.path)) {
            return { ok: false, error: `路径必须是绝对路径: ${op.path}` };
        }

        try {
            switch (op.type) {
                case 'add':
                    await writeFile(op.path, op.content, 'utf-8');
                    results.push(`已创建: ${op.path}`);
                    break;

                case 'delete':
                    if (fs.existsSync(op.path)) {
                        await FileUtil.remove(op.path);
                        results.push(`已删除: ${op.path}`);
                    }
                    break;

                case 'update':
                    if (!fs.existsSync(op.path)) throw new Error(`文件不存在: ${op.path}`);

                    const original = await readFile(op.path, 'utf-8');
                    const backupPath = `${op.path}.bak`;
                    await writeFile(backupPath, original);

                    try {
                        const patched = Diff.applyPatch(original, op.content);
                        if (patched === false) throw new Error(`补丁内容无法与当前文件匹配`);
                        await writeFile(op.path, patched, 'utf-8');
                        await unlink(backupPath);
                        results.push(`已更新: ${op.path}`);
                    } catch (err: any) {
                        await writeFile(op.path, original);
                        await unlink(backupPath);
                        throw err;
                    }
                    break;
            }
        } catch (error: any) {
            return { ok: false, error: `操作 ${op.type} 失败: ${error.message}` };
        }
    }

    return { ok: true, message: `操作完成: ${results.join(', ')}` };
};

export const apply_patch_schema = {
    type: "function",
    function: {
        name: "apply_patch",
        description: "高级补丁应用工具。所有路径参数必须使用完整的绝对路径。",
        parameters: {
            type: "object",
            properties: {
                patchText: {
                    type: "string",
                    description: "包含 *** Add/Delete/Update File (必须是绝对路径) 的补丁块。"
                }
            },
            required: ["patchText"]
        }
    }
};