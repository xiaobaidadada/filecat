import yaml from "js-yaml";

/**
 * 解析一段 yaml 文本。
 * 解析失败直接抛错，由调用方决定如何处理（控制台配置里保存时会回显给用户）。
 *
 * 注意：纯注释（如 "# 只有注释"）或纯空白文本在 js-yaml 里会抛
 * "expected a document, but the input is empty"，这里按空配置处理。
 */
export function parse_yaml(text: string): any {
    if (!text || !text.trim()) return {};
    let result: any;
    try {
        result = yaml.load(text);
    } catch (e) {
        // 只有「输入为空文档」这种不算语法错误，其余语法错误继续抛出
        if (is_empty_document_error(e)) return {};
        throw e;
    }
    if (result === null || result === undefined) return {};
    return result;
}

/** js-yaml 对空文档抛出的错误，属于「没有内容」而非用户写错 */
function is_empty_document_error(e: any): boolean {
    return !!e && typeof e.reason === "string" && e.reason.includes("input is empty");
}

/**
 * 把对象序列化成 yaml 文本。
 * 只用于「没有历史文本时给前端一个可读的初始内容」，运行时以用户保存的原始文本为准。
 */
export function stringify_yaml(data: any): string {
    return yaml.dump(data, {lineWidth: -1, noRefs: true});
}
