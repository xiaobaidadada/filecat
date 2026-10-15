import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, parse_domain, split_account, VerifyResult} from "../ddns.provider";

/**
 * Namecheap。account 格式：密码 / Dynamic DNS Password（在域名管理页获取）。
 * 官方更新地址：
 * https://dynamicdns.park-your-domain.com/update?host=<子域>&domain=<主域>&password=<密码>&ip=<ip>
 * 仅支持 IPv4。
 */
export class NamecheapUpdater implements DdnsUpdater {
    provider = DdnsProvider.namecheap;

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const password = account.trim();
        if (!password) return false;
        if (family === "AAAA") return false; // Namecheap 不支持 IPv6
        const {domain, subdomain} = parse_domain(host);
        const text = await HttpRequest.get(
            `https://dynamicdns.park-your-domain.com/update?host=${subdomain || "@"}&domain=${domain}&password=${password}&ip=${ip}`,
            undefined, 15000);
        // 返回 XML，包含 <ErrCount>0</ErrCount> 即成功
        return typeof text === "string" && text.includes("<ErrCount>0</ErrCount>");
    }

    async verify(account: string): Promise<VerifyResult> {
        if (!account.trim()) return {ok: false, message: "密码为空"};
        return {ok: true, message: "密码已填写（同步时验证）"};
    }
}
