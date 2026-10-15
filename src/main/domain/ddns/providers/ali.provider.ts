import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, split_account, VerifyResult} from "../ddns.provider";
import * as crypto from "crypto";

const ALIDNS_ENDPOINT = "https://alidns.aliyuncs.com/";

/**
 * 按阿里云 RPC 签名规范（HMAC-SHA1，签名版本 1.0）计算签名。
 * 规范要求：参数按 key 字典序排序，拼接成 k=v&k=v，再做一次 URL 编码，
 * 与 "GET&%2F&" 拼成待签串，用 "<AccessKeySecret>&" 作为 HMAC key。
 */
function sign_ali(params: Record<string, string>, accessKeySecret: string): string {
    const sorted = Object.keys(params)
        .sort()
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join("&");
    const stringToSign = `GET&%2F&${encodeURIComponent(sorted)}`;
    return crypto.createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
}

/** 生成一次阿里云公共请求参数（含签名） */
function build_params(action: string, accessKeyId: string, accessKeySecret: string, extra: Record<string, string>) {
    const params: Record<string, string> = {
        Action: action,
        AccessKeyId: accessKeyId,
        SignatureMethod: "HMAC-SHA1",
        // nonce 用随机 uuid，避免高并发时 Math.random 撞号导致签名被拒
        SignatureNonce: crypto.randomUUID(),
        // 阿里云要求 UTC 时间的 ISO8601 格式（YYYY-MM-DDTHH:mm:ssZ）
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        Format: "JSON",
        SignatureVersion: "1.0",
        Version: "2015-01-09",
        ...extra,
    };
    params["Signature"] = sign_ali(params, accessKeySecret);
    return params;
}

/**
 * 阿里云云解析 DNS 更新器。
 * account 格式：AccessKeyId,AccessKeySecret
 */
export class AliUpdater implements DdnsUpdater {
    provider = DdnsProvider.ali;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const [accessKeyId, accessKeySecret] = split_account(account);
        if (!accessKeyId || !accessKeySecret) {
            console.error("[ddns][ali] 凭证格式错误，应为 AccessKeyId,AccessKeySecret");
            return false;
        }
        const {domain, subdomain} = parse_domain(host);
        const rr = subdomain || "@";

        // 查询该子域 + 记录类型 的已有解析记录
        const listParams = build_params("DescribeDomainRecords", accessKeyId, accessKeySecret, {
            DomainName: domain,
            RRKeyWord: rr,
            TypeKeyWord: family,
            SearchMode: "EXACT",
            PageSize: "100",
        });
        const list = await HttpRequest.get(ALIDNS_ENDPOINT, listParams);
        if (list?.Code) {
            console.error(`[ddns][ali] 查询记录失败: ${list.Code} ${list.Message}`);
            return false;
        }
        const records = list?.DomainRecords?.Record;
        const record = Array.isArray(records)
            ? records.find((v: any) => v.RR === rr && v.Type === family)
            : undefined;

        if (record) {
            if (record.Value === ip) return true;
            const params = build_params("UpdateDomainRecord", accessKeyId, accessKeySecret, {
                RecordId: record.RecordId,
                RR: rr,
                Type: family,
                Value: ip,
            });
            const r = await HttpRequest.get(ALIDNS_ENDPOINT, params);
            return !r?.Code;
        } else {
            const params = build_params("AddDomainRecord", accessKeyId, accessKeySecret, {
                DomainName: domain,
                RR: rr,
                Type: family,
                Value: ip,
            });
            const r = await HttpRequest.get(ALIDNS_ENDPOINT, params);
            return !r?.Code;
        }
    }

    /** 用只读接口 DescribeDomains 验证 AccessKey */
    async verify(account: string): Promise<VerifyResult> {
        const [accessKeyId, accessKeySecret] = split_account(account);
        if (!accessKeyId || !accessKeySecret) {
            return {ok: false, message: "凭证格式错误，应为 AccessKeyId,AccessKeySecret"};
        }
        const params = build_params("DescribeDomains", accessKeyId, accessKeySecret, {
            PageSize: "1",
        });
        const data = await HttpRequest.get(ALIDNS_ENDPOINT, params);
        if (data?.Code) {
            return {ok: false, message: `${data.Code}: ${data.Message}`};
        }
        const n = data?.TotalCount ?? 0;
        return {ok: true, message: `验证成功，共 ${n} 个域名`};
    }
}
