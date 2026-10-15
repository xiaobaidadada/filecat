import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, VerifyResult} from "../ddns.provider";

const VERCEL_API = "https://api.vercel.com";

/**
 * Vercel。account 格式：API Token（在 Vercel 账号设置里创建，需 DNS 权限）。
 * 更新记录：PATCH /v1/domains/records/<id>；新增：POST /v2/domains/<domain>/records
 */
export class VercelUpdater implements DdnsUpdater {
    provider = DdnsProvider.vercel;

    private headers(token: string) {
        return {Authorization: `Bearer ${token}`, "Content-Type": "application/json"};
    }

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const token = account.trim();
        if (!token) return false;
        const {domain, subdomain} = parse_domain(host);

        // 列出该域名下已有记录
        const {status, data} = await HttpRequest.send({
            method: "GET",
            url: `${VERCEL_API}/v4/domains/${domain}/records?limit=100`,
            headers: this.headers(token),
            timeout: 15000,
        });
        const records = status === 200 ? (data?.records ?? []) : [];
        const name = subdomain || "@";
        const exist = records.find((r: any) => r.name === name && r.type === family);

        if (exist) {
            const r = await HttpRequest.send({
                method: "PATCH",
                url: `${VERCEL_API}/v1/domains/records/${exist.id}`,
                headers: this.headers(token),
                data: {type: family, value: ip, ttl: 60},
                timeout: 15000,
            });
            return r.status === 200;
        }
        const r = await HttpRequest.send({
            method: "POST",
            url: `${VERCEL_API}/v2/domains/${domain}/records`,
            headers: this.headers(token),
            data: {name, type: family, value: ip, ttl: 60},
            timeout: 15000,
        });
        return r.status === 200;
    }

    async verify(account: string): Promise<VerifyResult> {
        const token = account.trim();
        if (!token) return {ok: false, message: "Token 为空"};
        // 列出账号下域名，200 即有效
        const {status, data} = await HttpRequest.send({
            method: "GET",
            url: `${VERCEL_API}/v5/domains?limit=1`,
            headers: this.headers(token),
            timeout: 15000,
        });
        if (status === 200) return {ok: true, message: "Token 有效"};
        return {ok: false, message: data?.error?.message ?? `验证失败 (HTTP ${status})`};
    }
}
