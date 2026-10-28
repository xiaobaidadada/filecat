import yaml from "js-yaml";

/**
 * 解析一段 yaml 文本。
 * 解析失败直接抛错，由调用方决定如何处理（控制台配置里保存时会回显给用户）。
 */
export function parse_yaml(text: string): any {
    if (!text) return {};
    const result = yaml.load(text);
    if (result === null || result === undefined) return {};
    return result;
}

/**
 * 把对象序列化成 yaml 文本。
 * 只用于「没有历史文本时给前端一个可读的初始内容」，运行时以用户保存的原始文本为准。
 */
export function stringify_yaml(data: any): string {
    return yaml.dump(data, {lineWidth: -1, noRefs: true});
}
