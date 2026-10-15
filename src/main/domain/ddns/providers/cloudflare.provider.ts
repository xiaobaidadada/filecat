import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, VerifyResult} from "../ddns.provider";

const CF_API = "https://api.cloudflare.com/client/v4";

/** Cloudflare 请求封装，返回 { status, data } */
async function cf_request(token: string, method: string, url: string, data?: any) {
    return HttpRequest.send({
        method,
        url: `${CF_API}${url}`,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        data,
        timeout: 15000,
    });
}

/**
 * Cloudflare。account 格式：API Token（需该域名 DNS 编辑权限）。
 */
export class CloudflareUpdater implements DdnsUpdater {
    provider = DdnsProvider.cloudflare;

    /** 用主域查询 zone id */
    private async get_zone_id(token: string, domain: string): Promise<string | null> {
        const {status, data} = await cf_request(token, "GET", `/zones?name=${domain}`);
        if (status === 200 && data?.result?.length > 0) {
            return data.result[0].id;
        }
        return null;
    }

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const token = account.trim();
        if (!token) return false;
        const {domain, subdomain} = parse_domain(host);
        const zone_id = await this.get_zone_id(token, domain);
        if (!zone_id) return false;

        // 查询精确的记录
        const {status, data} = await cf_request(token, "GET", `/zones/${zone_id}/dns_records?name=${host}&type=${family}`);
        const records = status === 200 ? (data?.result ?? []) : [];
        const body = {type: family, name: host, content: ip, ttl: 60, proxied: false};

        if (records.length > 0) {
            const r = await cf_request(token, "PUT", `/zones/${zone_id}/dns_records/${records[0].id}`, body);
            return r.status === 200;
        }
        const r = await cf_request(token, "POST", `/zones/${zone_id}/dns_records`, body);
        return r.status === 200;
    }

    async verify(account: string): Promise<VerifyResult> {
        const token = account.trim();
        if (!token) return {ok: false, message: "Token 为空"};
        // 用 token 验证接口，返回 active 即有效
        const {status, data} = await cf_request(token, "GET", "/user/tokens/verify");
        if (status === 200 && data?.result?.status === "active") {
            return {ok: true, message: "Token 有效"};
        }
        return {ok: false, message: data?.errors?.[0]?.message ?? `验证失败 (HTTP ${status})`};
    }
}
