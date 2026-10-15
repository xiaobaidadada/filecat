import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, split_account, VerifyResult} from "../ddns.provider";

// DNSPod 老版 API（dnsapi.cn），凭证 login_token = "ID,Token"
const DNS_POD_LIST = "https://dnsapi.cn/Record.List";
const DNS_POD_MODIFY = "https://dnsapi.cn/Record.Modify";
const DNS_POD_CREATE = "https://dnsapi.cn/Record.Create";
const DNS_POD_USER = "https://dnsapi.cn/User.Detail";

/**
 * DNSPod（老版 API，dnsapi.cn）更新器。
 * account 格式：ID,Token（在 DNSPod 控制台「用户中心-密钥管理」生成）
 */
export class DnspodUpdater implements DdnsUpdater {
    provider = DdnsProvider.dnspod;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const [id, token] = split_account(account);
        if (!id || !token) {
            console.error("[ddns][dnspod] 凭证格式错误，应为 ID,Token");
            return false;
        }
        const {domain, subdomain} = parse_domain(host);
        const login_token = `${id},${token}`;
        const sub = subdomain || "@";

        // 查询该子域已有记录。带上 record_type，避免 A / AAAA 同名记录互相覆盖。
        const list = await HttpRequest.post(DNS_POD_LIST, {
            format: "json",
            login_token,
            domain,
            sub_domain: sub,
            record_type: family,
        }, true);
        // code=1 表示查询成功；code=10 表示记录列表为空（即该记录还不存在，需要创建）。
        // 其它 code 才是真正的错误（如鉴权失败、域名不存在）。
        const code = list?.status?.code;
        if (code !== "1" && code !== "10") {
            console.error(`[ddns][dnspod] 查询记录失败: ${list?.status?.message}`);
            return false;
        }
        const records = list?.records;
        if (Array.isArray(records) && records.length > 0) {
            const record = records[0];
            // 已是最新 IP 时不重复修改
            if (record.value === ip) return true;
            const r = await HttpRequest.post(DNS_POD_MODIFY, {
                format: "json",
                login_token,
                domain,
                sub_domain: sub,
                record_type: family,
                record_line: record.line ?? "默认",
                record_id: record.id,
                value: ip,
            }, true);
            return r?.status?.code === "1";
        } else {
            const r = await HttpRequest.post(DNS_POD_CREATE, {
                format: "json",
                login_token,
                domain,
                sub_domain: sub,
                record_type: family,
                record_line: "默认",
                value: ip,
            }, true);
            return r?.status?.code === "1";
        }
    }

    /** 用只读接口 User.Detail 验证 token，不触碰任何解析记录 */
    async verify(account: string): Promise<VerifyResult> {
        const [id, token] = split_account(account);
        if (!id || !token) return {ok: false, message: "凭证格式错误，应为 ID,Token"};
        const data = await HttpRequest.post(DNS_POD_USER, {
            format: "json",
            login_token: `${id},${token}`,
        }, true);
        if (data?.status?.code === "1") {
            const user = data.info?.user ?? {};
            const name = user.nick || user.email || user.id || "";
            return {ok: true, message: `验证成功${name ? "（" + name + "）" : ""}`};
        }
        return {ok: false, message: data?.status?.message ?? "验证失败"};
    }
}
