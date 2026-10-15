import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, VerifyResult} from "../ddns.provider";

/** 把这些平台的返回文本转成验证结果（成功时返回 OK/good/空等） */
function text_result(text: any): VerifyResult {
    const s = (text ?? "").toString();
    const low = s.trim().toLowerCase();
    if (low.startsWith("badauth") || low.includes("401") || low.includes("unauthorized")) {
        return {ok: false, message: "Token 无效"};
    }
    const fail_words = ["error", "fail", "invalid", "nohost", "denied"];
    if (fail_words.some((w) => low.includes(w))) {
        return {ok: false, message: s.slice(0, 200)};
    }
    return {ok: true, message: low || "ok"};
}

/**
 * FreeDNS / afraid.org。account 格式：更新 Token。
 * 官方更新地址：https://freedns.afraid.org/dynamic/update.php?<token>&address=<ip>
 */
export class FreednsUpdater implements DdnsUpdater {
    provider = DdnsProvider.freedns;

    async update(account: string, host: string, ip: string, _family: "A" | "AAAA"): Promise<boolean> {
        const token = account.trim();
        if (!token) return false;
        const text = await HttpRequest.get(`https://freedns.afraid.org/dynamic/update.php?${token}&address=${ip}`, undefined, 15000);
        return text_result(text).ok;
    }

    async verify(account: string): Promise<VerifyResult> {
        if (!account.trim()) return {ok: false, message: "Token 为空"};
        return {ok: true, message: "Token 已填写（同步时验证）"};
    }
}

/**
 * dynv6。account 格式：Token。
 * 官方 v2 API：GET /api/v2/zones（Bearer token）验证；
 * 更新：GET https://dynv6.com/api/update?hostname=<host>&token=<token>&ipv4/ipv6=<ip>
 */
export class Dynv6Updater implements DdnsUpdater {
    provider = DdnsProvider.dynv6;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const token = account.trim();
        if (!token) return false;
        // 去掉域名末尾的 .dynv6.com，接口只接受子域名部分
        const name = host.replace(/\.dynv6\.com$/i, "");
        const param = family === "AAAA" ? "ipv6" : "ipv4";
        const text = await HttpRequest.get(`https://dynv6.com/api/update?hostname=${name}&token=${token}&${param}=${ip}`, undefined, 15000);
        return text_result(text).ok;
    }

    async verify(account: string): Promise<VerifyResult> {
        const token = account.trim();
        if (!token) return {ok: false, message: "Token 为空"};
        // 官方只读接口：列出该 token 下的 zone，能列出即 token 有效
        const {status, data} = await HttpRequest.send({
            method: "GET",
            url: "https://dynv6.com/api/v2/zones",
            headers: {Authorization: `Bearer ${token}`},
            timeout: 15000,
        });
        if (status === 200) {
            const n = Array.isArray(data) ? data.length : 0;
            return {ok: true, message: `Token 有效，共 ${n} 个域名`};
        }
        return {ok: false, message: `Token 无效 (HTTP ${status})`};
    }
}

/**
 * DuckDNS。account 格式：Token。
 * 官方更新地址：https://www.duckdns.org/update?domains=<子域>&token=<token>&ip=<ip>
 */
export class DuckdnsUpdater implements DdnsUpdater {
    provider = DdnsProvider.duckdns;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const token = account.trim();
        if (!token) return false;
        // 去掉 .duckdns.org 后缀
        const name = host.replace(/\.duckdns\.org$/i, "");
        const param = family === "AAAA" ? "ipv6" : "ip";
        const text = await HttpRequest.get(`https://www.duckdns.org/update?domains=${name}&token=${token}&${param}=${ip}`, undefined, 15000);
        return text_result(text).ok;
    }

    async verify(account: string): Promise<VerifyResult> {
        if (!account.trim()) return {ok: false, message: "Token 为空"};
        return {ok: true, message: "Token 已填写（同步时验证）"};
    }
}
