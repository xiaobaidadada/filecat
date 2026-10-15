import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, VerifyResult} from "../ddns.provider";

const NS_API = "https://www.namesilo.com/api";

/** NameSilo 返回 XML，这里做极简解析：取 <code> 与 <resource_record> 里的字段 */
function parse_xml_records(xml: string): { code: number, records: { record_id: string, type: string, host: string, value: string }[] } {
    const code = Number(xml.match(/<code>(\d+)<\/code>/)?.[1] ?? -1);
    const records: any[] = [];
    const blocks = xml.split("<resource_record>").slice(1);
    for (const b of blocks) {
        records.push({
            record_id: b.match(/<record_id>([^<]*)<\/record_id>/)?.[1] ?? "",
            type: b.match(/<type>([^<]*)<\/type>/)?.[1] ?? "",
            host: b.match(/<host>([^<]*)<\/host>/)?.[1] ?? "",
            value: b.match(/<value>([^<]*)<\/value>/)?.[1] ?? "",
        });
    }
    return {code, records};
}

/**
 * NameSilo。account 格式：API Key（在账号 API 管理页生成）。
 * 官方接口：dnsListRecords / dnsAddRecord / dnsUpdateRecord（返回 XML，code=300 为成功）。
 */
export class NamesiloUpdater implements DdnsUpdater {
    provider = DdnsProvider.namesilo;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const key = account.trim();
        if (!key) return false;
        const {domain, subdomain} = parse_domain(host);
        const rrhost = subdomain || "@";

        // 先列出记录，找到匹配的 record_id
        const list = await HttpRequest.get(`${NS_API}/dnsListRecords?version=1&type=xml&key=${key}&domain=${domain}`, undefined, 15000);
        if (typeof list !== "string") return false;
        const {records} = parse_xml_records(list);
        const exist = records.find((r) => r.host === rrhost && r.type === family);

        if (exist) {
            const text = await HttpRequest.get(
                `${NS_API}/dnsUpdateRecord?version=1&type=xml&key=${key}&domain=${domain}&rrhost=${rrhost}&rrid=${exist.record_id}&rrvalue=${ip}&rrttl=3600`,
                undefined, 15000);
            return typeof text === "string" && parse_xml_records(text).code === 300;
        }
        const text = await HttpRequest.get(
            `${NS_API}/dnsAddRecord?version=1&type=xml&key=${key}&domain=${domain}&rrhost=${rrhost}&rrtype=${family}&rrvalue=${ip}&rrttl=3600`,
            undefined, 15000);
        return typeof text === "string" && parse_xml_records(text).code === 300;
    }

    async verify(account: string): Promise<VerifyResult> {
        const key = account.trim();
        if (!key) return {ok: false, message: "API Key 为空"};
        // 官方只读接口：列出该 key 下域名，code=300 即有效
        const text = await HttpRequest.get(`${NS_API}/listDomains?version=1&type=xml&key=${key}`, undefined, 15000);
        if (typeof text === "string") {
            const code = Number(text.match(/<code>(\d+)<\/code>/)?.[1] ?? -1);
            const detail = text.match(/<detail>([^<]*)<\/detail>/)?.[1] ?? "";
            if (code === 300) return {ok: true, message: "API Key 有效"};
            return {ok: false, message: detail || `验证失败 (code=${code})`};
        }
        return {ok: false, message: "请求失败"};
    }
}
