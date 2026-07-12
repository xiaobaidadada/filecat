import { readFile, writeFile } from "fs/promises";
import { ai_agent_params_type } from "./ai_agent.constant";

// 1. Replacer 工具策略集
// 策略1: 精确匹配
export const SimpleReplacer = function* (_content: string, find: string) {
    yield find;
};

// 策略2: 忽略首尾空格和缩进匹配 (增强鲁棒性)
export const LineTrimmedReplacer = function* (content: string, find: string) {
    const normalize = (s: string) => s.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
    const findNormalized = normalize(find);

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const chunk = lines.slice(i, i + find.split('\n').length).join('\n');
        if (normalize(chunk) === findNormalized) {
            yield chunk; // 找到逻辑匹配的块，返回原始内容
        }
    }
};

// 2. 核心替换函数
export function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
    const strategies = [SimpleReplacer, LineTrimmedReplacer];

    for (const replacer of strategies) {
        for (const search of replacer(content, oldString)) {
            const index = content.indexOf(search);
            if (index === -1) continue;

            if (replaceAll) {
                return content.split(search).join(newString);
            }

            // 确保是唯一匹配，防止误修改
            const lastIndex = content.lastIndexOf(search);
            if (index !== lastIndex) continue;

            return content.substring(0, index) + newString + content.substring(index + search.length);
        }
    }
    throw new Error("无法定位旧代码段，请检查缩进或提供更多上下文。");
}

// 3. 导出工具工具与定义
export const edit_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "edit_file",
        description: "编辑文件，通过智能匹配旧字符串进行替换。如果文件较大，建议先使用 read_file 获取上下文。",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "文件的绝对路径" },
                oldString: { type: "string", description: "需要被替换的旧代码段（包含准确缩进）" },
                newString: { type: "string", description: "替换后的新代码段" },
                replaceAll: { type: "boolean", description: "是否替换所有匹配项" }
            },
            required: ["path", "oldString", "newString"]
        }
    }
};

export const edit_file_tool = async ({ path, oldString, newString, replaceAll = false }: {
    path: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean
}) => {
    try {
        const content = await readFile(path, 'utf-8');
        const updatedContent = replace(content, oldString, newString, replaceAll);
        await writeFile(path, updatedContent, 'utf-8');
        return { ok: true, message: "文件修改成功" };
    } catch (e: any) {
        return { ok: false, message: `修改失败: ${e.message}` };
    }
};