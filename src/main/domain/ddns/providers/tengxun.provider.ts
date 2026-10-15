import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {DdnsUpdater, parse_domain, split_account, VerifyResult} from "../ddns.provider";
import {Client as TxDnsClient} from "../tx/dnspod_client";

/**
 * 腾讯云 DNSPod 更新器（新版云 API，dnspod.tencentcloudapi.com）。
 * account 格式：SecretId,SecretKey（腾讯云控制台「访问管理-API密钥管理」获取）
 */
export class TengxunUpdater implements DdnsUpdater {
    provider = DdnsProvider.tengxun;

    private client(account: string): TxDnsClient | null {
        const [secretId, secretKey] = split_account(account);
        if (!secretId || !secretKey) {
            console.error("[ddns][tengxun] 凭证格式错误，应为 SecretId,SecretKey");
            return null;
        }
        return new TxDnsClient({credential: {secretId, secretKey}});
    }

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const client = this.client(account);
        if (!client) return false;
        const {domain, subdomain} = parse_domain(host);
        const sub = subdomain || "@";

        // 查询精确匹配 主机名 + 记录类型 的记录，避免 A / AAAA 混用。
        // 查询接口在无匹配记录时可能抛异常，这里兜底为空列表。
        let records: any[] = [];
        try {
            const list = await client.DescribeRecordList({
                Domain: domain,
                Subdomain: sub,
                RecordType: family,
            });
            records = list?.RecordList ?? [];
        } catch (e) {
            records = [];
        }
        if (records.length > 0) {
            const record = records[0];
            if (record.Value === ip) return true;
            await client.ModifyRecord({
                Domain: domain,
                RecordId: record.RecordId,
                RecordType: family,
                SubDomain: sub,
                RecordLine: record.Line || "默认",
                Value: ip,
            });
        } else {
            await client.CreateRecord({
                Domain: domain,
                RecordType: family,
                SubDomain: sub,
                RecordLine: "默认",
                Value: ip,
            });
        }
        return true;
    }

    /** 用只读接口 DescribeUserDetail 验证密钥 */
    async verify(account: string): Promise<VerifyResult> {
        const client = this.client(account);
        if (!client) return {ok: false, message: "凭证格式错误，应为 SecretId,SecretKey"};
        try {
            const detail = await client.DescribeUserDetail(null);
            const nick = detail?.UserInfo?.Nick ?? "";
            return {ok: true, message: `验证成功${nick ? "（" + nick + "）" : ""}`};
        } catch (e) {
            return {ok: false, message: e?.message ?? "验证失败"};
        }
    }
}
