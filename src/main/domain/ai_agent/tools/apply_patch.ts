import {readFile, writeFile} from "fs/promises";
import * as Diff from "diff";
import {FileUtil} from "../../file/FileUtil";


// 补丁解析逻辑
function parseCustomPatch(patchText: string) {
    const lines = patchText.split('\n');
    const ops: any[] = [];
    let currentOp: any = null;
    let buffer: string[] = [];

    for (const line of lines) {
        if (line.startsWith('*** ')) {
            if (currentOp) {
                currentOp.content = buffer.join('\n');
                ops.push(currentOp);
            }
            buffer = [];
            if (line.includes('Add File:')) currentOp = { type: 'add', path: line.split('Add File:')[1].trim() };
            else if (line.includes('Delete File:')) currentOp = { type: 'delete', path: line.split('Delete File:')[1].trim() };
            else if (line.includes('Update File:')) currentOp = { type: 'update', path: line.split('Update File:')[1].trim() };
        } else if (currentOp) {
            buffer.push(line);
        }
    }
    if (currentOp) { currentOp.content = buffer.join('\n'); ops.push(currentOp); }
    return ops;
}



export const apply_patch_tool = async ({ patchText }: { patchText: string }) => {
    const operations = parseCustomPatch(patchText);
    for (const op of operations) {
        switch (op.type) {
            case 'add':
                await writeFile(op.path, op.content.replace(/^\+/gm, ''), 'utf-8');
                break;
            case 'delete':
                await FileUtil.remove(op.path);
                break;
            case 'update':
                const original = await readFile(op.path, 'utf-8');
                const patched = Diff.applyPatch(original, op.content, { fuzzFactor: 2 });
                if (patched === false) throw new Error(`应用补丁失败: ${op.path}`);
                await writeFile(op.path, patched, 'utf-8');
                break;
        }
    }
    return { ok: true, message: `成功应用了 ${operations.length} 个操作` };
}


export const apply_patch_schema = {
    type: "function",
    function: {
        name: "apply_patch",
        description: "高级补丁应用工具，支持通过特定格式同时添加、更新或删除多个文件。使用 *** Begin Patch ... *** End Patch 格式。",
        parameters: {
            type: "object",
            properties: {
                patchText: {
                    type: "string",
                    description: "包含 *** Add/Delete/Update File 等 Header 的完整补丁内容"
                }
            },
            required: ["patchText"]
        }
    }
}