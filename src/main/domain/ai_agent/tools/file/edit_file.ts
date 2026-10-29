import { readFile, writeFile, stat } from "fs/promises";
import {ai_agent_params_type} from "../ai_agent.tools";

/**
 * 替换策略集。
 *
 * 每个策略是生成器：给定文件内容和待查找文本，产出「文件里真实存在的片段」。
 * 按顺序尝试，前一个策略的匹配结果优先，这样能保证精确匹配永远先于模糊匹配，
 * 避免模糊策略把本来能精确命中的地方改错。
 */

// 策略1: 精确匹配（最常见，也最安全）
export const SimpleReplacer = function* (_content: string, find: string) {
    yield find;
};

// 策略2: 忽略每行首尾空格匹配
// 模型经常在缩进上出错（tab 和空格混用），这一层专门兜住这种情况
export const LineTrimmedReplacer = function* (content: string, find: string) {
    const normalize = (s: string) =>
        s.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
    const findNormalized = normalize(find);

    const contentLines = content.split('\n');
    const findLineCount = find.split('\n').length;

    for (let i = 0; i < contentLines.length; i++) {
        const chunk = contentLines.slice(i, i + findLineCount).join('\n');
        // 行数不够时 chunk 会变短，归一化后不可能相等，跳出省掉无谓比较
        if (normalize(chunk) === findNormalized) {
            yield chunk;
        }
    }
};

// 策略3: 引号字符归一化匹配
// 模型的输出里经常出现中文引号或弯引号，与源码里的直引号不一致
const QUOTE_MAP: Record<string, string> = {
    '\u2018': "'", '\u2019': "'",
    '\u201c': '"', '\u201d': '"',
};
const normalizeQuotes = (s: string) => s.replace(/[\u2018\u2019\u201c\u201d]/g, c => QUOTE_MAP[c] ?? c);

export const QuoteNormalizedReplacer = function* (content: string, find: string) {
    const normalizedFind = normalizeQuotes(find);
    if (normalizedFind === find) return;
    // 只有在文件里能精确找到归一化后的文本，才认为这个策略生效
    if (content.includes(normalizedFind)) {
        yield normalizedFind;
    }
};

const REPLACERS = [SimpleReplacer, LineTrimmedReplacer, QuoteNormalizedReplacer];

/**
 * 在内容里执行替换。
 *
 * @param content 文件原始内容
 * @param oldString 待替换文本
 * @param newString 替换后的文本
 * @param replaceAll 是否替换全部匹配
 * @throws 找不到匹配，或匹配不唯一（且未开启 replaceAll）
 */
export function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
    if (oldString === newString) {
        throw new Error("oldString 和 newString 相同，无需修改");
    }

    for (const replacer of REPLACERS) {
        for (const search of replacer(content, oldString)) {
            const index = content.indexOf(search);
            if (index === -1) continue;

            if (replaceAll) {
                return content.split(search).join(newString);
            }

            // 必须唯一匹配，否则无法判断模型想改哪一处，宁可报错也不要猜
            const lastIndex = content.lastIndexOf(search);
            if (index !== lastIndex) {
                throw new Error("待替换的内容在文件中出现了多次，请提供更多上下文以唯一定位，或设置 replaceAll=true 替换全部");
            }

            return content.substring(0, index) + newString + content.substring(index + search.length);
        }
    }
    throw new Error("无法定位旧代码段，请检查缩进或提供更多上下文");
}

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
        description: "编辑文件，通过匹配旧字符串进行替换。建议先 read_file 获取上下文。待替换内容必须在文件中唯一出现，否则请提供更多上下文或设置 replaceAll。",
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

export const edit_file_tool = async (
    session_id: string,
    { path, oldString, newString, replaceAll = false }: {
        path: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    },
) => {
    try {
        const content = await readFile(path, 'utf-8');
        const updated_content = replace(content, oldString, newString, replaceAll);
        await writeFile(path, updated_content, 'utf-8');

        return {
            ok: true,
            message: "文件修改成功",
            diff: build_diff(oldString, newString),
        };
    } catch (e: any) {
        return { ok: false, message: `修改失败: ${e.message}` };
    }
};
