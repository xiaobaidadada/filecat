/**
 * Token 数量格式化为千位分隔字符串（前端/后端通用）
 */
export function formatTokenCount(tokens: number | undefined): string {
    if (tokens === undefined || tokens === null || tokens < 0) return "0";
    return tokens.toLocaleString();
}
