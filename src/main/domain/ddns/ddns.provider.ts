import {DdnsProvider} from "../../../common/req/ddns.pojo";
import {parse} from "tldts";
import {IResult} from "tldts-core";

/** 验证结果 */
export interface VerifyResult {
    ok: boolean;
    message: string;
}

/**
 * DDNS 平台更新器统一接口。
 * 每个平台只需实现 host（完整域名）→ IP 的更新逻辑，
 * IP 的采集、域名的遍历、多平台调度等由 DdnsService 统一负责。
 */
export interface DdnsUpdater {
    provider: DdnsProvider

    /**
     * 把一个域名更新为指定 IP。
     * @param account 平台凭证（格式由各 provider 自行解释）
     * @param host 完整域名，如 a.b.example.com
     * @param ip 目标 IP
     * @param family 记录类型，"A" 或 "AAAA"
     * @returns 成功返回 true，失败返回 false
     */
    update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean>

    /**
     * 验证账号凭证是否有效。
     * 优先使用平台的只读接口；无只读接口的平台若有 host 则用一次探测性更新请求判断鉴权。
     * @param account 平台凭证
     * @param host 可选。老式 DynDNS 协议族无只读接口，需配合一个域名才能真实验证
     */
    verify(account: string, host?: string): Promise<VerifyResult>
}

/**
 * 把凭证字符串按分隔符拆成若干段，去掉首尾空格。
 * 统一规定：凭证中的各字段用英文逗号或空格分隔。
 * 例：dnspod 的 "123456,abcdef" -> ["123456","abcdef"]
 */
export function split_account(account: string): string[] {
    return (account ?? "").trim().split(/[\s,，]+/).filter((v) => v.length > 0);
}

/**
 * 解析域名，拿到主域与子域（阿里云/腾讯云 DNSPod 记录接口需要分开传）。
 * 解析失败时退化为「去掉第一段作为主域」的简单拆分。
 */
export function parse_domain(host: string): { domain: string, subdomain: string, full: string } {
    const r: IResult = parse(host, {allowPrivateDomains: true});
    if (r.domain && r.publicSuffix) {
        return {domain: r.domain, subdomain: r.subdomain ?? "", full: host};
    }
    // tldts 解析不出来（如内网域名）时的兜底：去掉最后两段
    const parts = host.split(".");
    if (parts.length <= 2) {
        return {domain: host, subdomain: "", full: host};
    }
    return {domain: parts.slice(-2).join("."), subdomain: parts.slice(0, -2).join("."), full: host};
}
