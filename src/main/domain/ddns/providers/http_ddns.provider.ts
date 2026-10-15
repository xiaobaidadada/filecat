import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, VerifyResult} from "../ddns.provider";

/**
 * 把 URL 模板里的占位符替换为实际值。
 * 支持的占位符：{host} 完整域名、{ip} 当前 IP、{family} 记录类型(A/AAAA)。
 */
export function render_url(template: string, host: string, ip: string, family: string): string {
    return template
        .replace(/\{host\}/g, host)
        .replace(/\{ip\}/g, ip)
        .replace(/\{family\}/g, family);
}

/**
 * 自定义 HTTP 更新地址。account 格式：URL 模板。
 * 模板中可用 {host} {ip} {family} 占位符，请求时自动替换。
 * 例：https://example.com/update?domain={host}&ip={ip}
 */
export class CustomUpdater implements DdnsUpdater {
    provider = DdnsProvider.custom;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const template = account.trim();
        if (!template) return false;
        const url = render_url(template, host, ip, family);
        const text = await HttpRequest.get(url, undefined, 15000);
        return typeof text === "string" || text !== null;
    }

    async verify(account: string): Promise<VerifyResult> {
        const template = account.trim();
        if (!template) return {ok: false, message: "URL 为空"};
        if (!/^https?:\/\//i.test(template)) return {ok: false, message: "URL 必须以 http(s):// 开头"};
        if (!template.includes("{host}")) return {ok: false, message: "URL 缺少 {host} 占位符"};
        return {ok: true, message: "URL 格式正确"};
    }
}
