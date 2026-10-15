import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, split_account, VerifyResult} from "../ddns.provider";

/**
 * GoDaddy。account 格式：API Key,API Secret。
 * 官方接口：PUT /v1/domains/<domain>/records/<type>/<name>
 * 认证头：Authorization: sso-key <Key>:<Secret>
 */
export class GodaddyUpdater implements DdnsUpdater {
    provider = DdnsProvider.godaddy;

    private auth(account: string): string | null {
        const [key, secret] = split_account(account);
        if (!key || !secret) return null;
        return `sso-key ${key}:${secret}`;
    }

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const auth = this.auth(account);
        if (!auth) return false;
        const {domain, subdomain} = parse_domain(host);
        const name = subdomain || "@";
        const {status} = await HttpRequest.send({
            method: "PUT",
            url: `https://api.godaddy.com/v1/domains/${domain}/records/${family}/${name}`,
            headers: {Authorization: auth, "Content-Type": "application/json"},
            data: [{data: ip, ttl: 600}],
            timeout: 15000,
        });
        return status === 200;
    }

    async verify(account: string): Promise<VerifyResult> {
        const auth = this.auth(account);
        if (!auth) return {ok: false, message: "凭证格式错误，应为 API Key,API Secret"};
        // 列出账号下域名，200 即有效
        const {status, data} = await HttpRequest.send({
            method: "GET",
            url: "https://api.godaddy.com/v1/domains?limit=1",
            headers: {Authorization: auth},
            timeout: 15000,
        });
        if (status === 200) return {ok: true, message: "凭证有效"};
        return {ok: false, message: data?.message ?? `验证失败 (HTTP ${status})`};
    }
}
