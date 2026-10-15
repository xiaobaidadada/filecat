import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../../common/node/http";
import {DdnsUpdater, split_account, VerifyResult} from "../ddns.provider";

/**
 * 老式 DynDNS2 协议族的公共实现。
 * No-IP、easyDNS、花生壳、DynDNS 等一大批免费 DDNS 都用这一套：
 * 通过 GET 一个带账号密码（Basic Auth 或 URL 内嵌）的更新地址，
 * 返回文本 good / nochg / badauth / nohost 等表示结果。
 */
export abstract class DynDnsUpdater implements DdnsUpdater {
    abstract provider: DdnsProvider;

    /** 构造实际请求的 URL（由子类实现，需处理账号密码的嵌入方式） */
    abstract build_url(account: string, host: string, ip: string, family: "A" | "AAAA"): string | null;

    /** 解析返回文本，判断是否成功。默认按 DynDNS2 约定。 */
    parse_response(text: string): VerifyResult {
        const s = (text ?? "").toString().trim().toLowerCase();
        if (s.startsWith("good") || s.startsWith("nochg")) {
            return {ok: true, message: s};
        }
        if (s.startsWith("badauth") || s.startsWith("401")) {
            return {ok: false, message: "账号或密码错误"};
        }
        if (s.startsWith("nohost")) {
            return {ok: false, message: "域名不存在"};
        }
        if (s.startsWith("abuse") || s.startsWith("denied")) {
            return {ok: false, message: "请求被拒绝"};
        }
        // 有的平台成功时返回 OK / 空 / HTML，只要不含失败词就认为成功
        const fail_words = ["error", "fail", "invalid", "unauthorized"];
        if (fail_words.some((w) => s.includes(w))) {
            return {ok: false, message: text.toString().slice(0, 200)};
        }
        return {ok: true, message: s||"ok"};
    }

    async update(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<boolean> {
        const url = this.build_url(account, host, ip, family);
        if (!url) return false;
        const text = await HttpRequest.get(url, undefined, 15000);
        return this.parse_response(typeof text === "string" ? text : JSON.stringify(text)).ok;
    }

    /**
     * 老式协议没有只读鉴权接口，用一次「同 IP 的更新请求」判断：
     * 若 IP 未变会返回 nochg（成功），鉴权错误返回 badauth（失败）。
     * 因此验证需要传入一个已配置的域名。
     */
    abstract verify_with_host(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<VerifyResult>;

    /**
     * 老式协议无只读鉴权接口：
     * - 传了 host 时用「同 IP 的更新请求」探测（返回 badauth 即失败，nochg 即成功）；
     * - 没传 host 时只做凭证格式检查。
     */
    async verify(account: string, host?: string): Promise<VerifyResult> {
        const segs = split_account(account);
        if (segs.length < 2) {
            return {ok: false, message: "凭证格式错误，应为 用户名,密码"};
        }
        if (host) {
            try {
                return await this.verify_with_host(account, host, "", "A");
            } catch (e) {
                return {ok: false, message: e?.message ?? "验证异常"};
            }
        }
        return {ok: true, message: "凭证格式正确（同步时验证）"};
    }
}

/** 把用户名密码编码进 URL 的 userinfo 段 */
export function basic_auth(user: string, pass: string): string {
    return `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
}

/**
 * No-IP。account 格式：用户名,密码。
 * 官方更新地址：https://dynupdate.no-ip.com/nic/update?hostname=<host>&myip=<ip>
 * IPv6 使用 myipv6。
 */
export class NoipUpdater extends DynDnsUpdater {
    provider = DdnsProvider.noip;

    build_url(account: string, host: string, ip: string, family: "A" | "AAAA"): string | null {
        const [user, pass] = split_account(account);
        if (!user || !pass) return null;
        const param = family === "AAAA" ? "myipv6" : "myip";
        return `https://${basic_auth(user, pass)}@dynupdate.no-ip.com/nic/update?hostname=${host}&${param}=${ip}`;
    }

    async verify_with_host(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<VerifyResult> {
        const url = this.build_url(account, host, ip, family);
        if (!url) return {ok: false, message: "凭证格式错误，应为 用户名,密码"};
        const text = await HttpRequest.get(url, undefined, 15000);
        return this.parse_response(typeof text === "string" ? text : JSON.stringify(text));
    }
}

/**
 * easyDNS。account 格式：用户名,密码。
 * 官方更新地址：https://ddns.easydns.com/dyn/generic.php?hostname=<host>&myip=<ip>
 */
export class EasydnsUpdater extends DynDnsUpdater {
    provider = DdnsProvider.easydns;

    build_url(account: string, host: string, ip: string, family: "A" | "AAAA"): string | null {
        const [user, pass] = split_account(account);
        if (!user || !pass) return null;
        const param = family === "AAAA" ? "myipv6" : "myip";
        return `https://${basic_auth(user, pass)}@ddns.easydns.com/dyn/generic.php?hostname=${host}&${param}=${ip}`;
    }

    async verify_with_host(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<VerifyResult> {
        const url = this.build_url(account, host, ip, family);
        if (!url) return {ok: false, message: "凭证格式错误，应为 用户名,密码"};
        const text = await HttpRequest.get(url, undefined, 15000);
        return this.parse_response(typeof text === "string" ? text : JSON.stringify(text));
    }
}

/**
 * 花生壳 Oray。account 格式：账号,密码。
 * 官方更新地址：http://<账号>:<密码>@ddns.oray.com/ph/update?hostname=<host>&myip=<ip>
 */
export class OrayUpdater extends DynDnsUpdater {
    provider = DdnsProvider.oray;

    build_url(account: string, host: string, ip: string, family: "A" | "AAAA"): string | null {
        const [user, pass] = split_account(account);
        if (!user || !pass) return null;
        return `http://${basic_auth(user, pass)}@ddns.oray.com/ph/update?hostname=${host}&myip=${ip}`;
    }

    async verify_with_host(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<VerifyResult> {
        const url = this.build_url(account, host, ip, family);
        if (!url) return {ok: false, message: "凭证格式错误，应为 账号,密码"};
        const text = await HttpRequest.get(url, undefined, 15000);
        return this.parse_response(typeof text === "string" ? text : JSON.stringify(text));
    }
}

/**
 * 通用 DynDNS2 协议。account 格式：用户名,密码。
 * 适用于大部分兼容 DynDNS2 的服务（如 dynu、freedns 旧接口等）。
 * 更新地址：https://members.dyndns.org/nic/update?hostname=<host>&myip=<ip>
 */
export class DynUpdater extends DynDnsUpdater {
    provider = DdnsProvider.dyn;

    build_url(account: string, host: string, ip: string, family: "A" | "AAAA"): string | null {
        const [user, pass] = split_account(account);
        if (!user || !pass) return null;
        const param = family === "AAAA" ? "myipv6" : "myip";
        return `https://${basic_auth(user, pass)}@members.dyndns.org/nic/update?hostname=${host}&${param}=${ip}`;
    }

    async verify_with_host(account: string, host: string, ip: string, family: "A" | "AAAA"): Promise<VerifyResult> {
        const url = this.build_url(account, host, ip, family);
        if (!url) return {ok: false, message: "凭证格式错误，应为 用户名,密码"};
        const text = await HttpRequest.get(url, undefined, 15000);
        return this.parse_response(typeof text === "string" ? text : JSON.stringify(text));
    }
}
