/**
 * 网页代理（WebVPN）的目标地址访问策略。
 *
 * 目标：防止有 browser_proxy 权限的用户把代理当跳板，去访问
 * 环回 / 内网 / 链路本地 / 云元数据 / 特殊用途地址（SSRF）。
 *
 * 默认策略（安全优先）：
 *   · 普通公网地址                 → 允许
 *   · 私网（RFC1918）、环回、链路本地、云元数据、特殊用途地址 → 拒绝
 *   · 管理员在系统设置里配置白名单后，白名单内的目标才允许
 *
 * 白名单支持三种条目：
 *   · CIDR 网段      192.168.1.0/24、10.0.0.0/8、fd00::/8
 *   · 精确 IP        192.168.1.1、::1
 *   · 精确域名       router.local、nas.example.com（不匹配其子域名）
 *
 * DNS rebinding 防护：不能只校验域名字符串，必须解析出真实 IP 后再校验一次，
 * 避免域名解析到一个被禁止的地址。
 */
import {isIP} from 'net';
import dns from 'dns';
import {classify_restricted, ipv4_to_int, ipv6_to_bytes} from "../../../common/node/net";

/** 校验结果：allowed 表示是否放行，reason 仅用于日志排查 */
export interface target_check_result {
    allowed: boolean;
    reason?: string;
}

// ==================== 白名单条目解析与匹配 ====================

/** 一条白名单：网段 / 精确 IP / 精确域名 */
export type allow_entry =
    | { kind: 'cidr'; base: number; mask: number; bits: 32 }   // IPv4 网段
    | { kind: 'cidr6'; bytes: number[]; prefix: number }        // IPv6 网段
    | { kind: 'ip'; ip: string }                               // 精确 IP
    | { kind: 'domain'; domain: string };                      // 精确域名

/**
 * 解析单条白名单文本。无法识别的条目返回 null（调用方需忽略，
 * 错误配置不能导致策略失效 —— 即宁可少放行，不可误放行）。
 */
export function parse_allow_entry(raw: string): allow_entry | null {
    const s = (raw ?? '').trim().toLowerCase();
    if (!s) {
        return null;
    }
    // CIDR
    if (s.includes('/')) {
        const [addr, prefix_str] = s.split('/');
        const prefix = Number(prefix_str);
        if (!Number.isInteger(prefix)) {
            return null;
        }
        const v = isIP(addr);
        if (v === 4) {
            if (prefix < 0 || prefix > 32) return null;
            const base = ipv4_to_int(addr);
            if (base === null) return null;
            const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
            return {kind: 'cidr', base: (base & mask) >>> 0, mask, bits: 32};
        }
        if (v === 6) {
            if (prefix < 0 || prefix > 128) return null;
            const bytes = ipv6_to_bytes(addr);
            if (!bytes) return null;
            return {kind: 'cidr6', bytes, prefix};
        }
        return null;
    }
    // 精确 IP
    if (isIP(s)) {
        return {kind: 'ip', ip: s};
    }
    // 精确域名：只允许合法的域名形态（字母数字、连字符、点）
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
        return {kind: 'domain', domain: s};
    }
    return null;
}

/**
 * 把配置里的白名单文本列表解析成条目数组。
 * 解析失败的条目被丢弃（不生效），并返回给调用方用于日志/提示。
 */
export function parse_allow_list(list: string[] | undefined | null): { entries: allow_entry[]; invalid: string[] } {
    const entries: allow_entry[] = [];
    const invalid: string[] = [];
    if (!Array.isArray(list)) {
        return {entries, invalid};
    }
    for (const item of list) {
        const e = parse_allow_entry(item);
        if (e) {
            entries.push(e);
        } else if ((item ?? '').trim()) {
            invalid.push(item);
        }
    }
    return {entries, invalid};
}

/** 判断某个字面量 IP 是否命中白名单 */
function ip_allowed_by_entries(ip: string, entries: allow_entry[]): boolean {
    const v = isIP(ip);
    if (v === 4) {
        const n = ipv4_to_int(ip);
        if (n === null) return false;
        for (const e of entries) {
            if (e.kind === 'ip' && isIP(e.ip) === 4 && ipv4_to_int(e.ip) === n) return true;
            if (e.kind === 'cidr' && ((n & e.mask) >>> 0) === e.base) return true;
        }
        return false;
    }
    if (v === 6) {
        const b = ipv6_to_bytes(ip);
        if (!b) return false;
        for (const e of entries) {
            if (e.kind === 'ip' && isIP(e.ip) === 6) {
                const eb = ipv6_to_bytes(e.ip);
                if (eb && eb.every((x, i) => x === b[i])) return true;
            }
            if (e.kind === 'cidr6') {
                let match = true;
                for (let i = 0; i < 16 && match; i++) {
                    const bit_start = i * 8;
                    if (bit_start >= e.prefix) break;
                    const remain = e.prefix - bit_start;
                    const mask = remain >= 8 ? 0xff : (0xff << (8 - remain)) & 0xff;
                    if ((b[i] & mask) !== (e.bytes[i] & mask)) {
                        match = false;
                    }
                }
                if (match) return true;
            }
        }
        return false;
    }
    return false;
}

/** 判断域名是否精确命中白名单（不做子域名放行） */
function domain_allowed_by_entries(host: string, entries: allow_entry[]): boolean {
    const h = host.toLowerCase().replace(/\.$/, '');
    return entries.some(e => e.kind === 'domain' && e.domain === h);
}

// ==================== 对外主逻辑 ====================

export interface policy_options {
    /** 管理员配置的白名单（原始文本列表） */
    allow_list?: string[];
    /** DNS 解析函数，便于测试注入；默认用 dns.promises.lookup */
    resolve?: (host: string) => Promise<string[]>;
}

/**
 * 校验一个代理目标（host + ip 字面量二选一，或都给）是否允许访问。
 *
 * 规则：
 *   1) 若 host 本身就是 IP 字面量，直接按 IP 分类 + 白名单判断；
 *   2) 若是域名：
 *      a) 域名命中白名单 → 直接放行（不再解析，白名单即信任）
 *      b) 否则解析 DNS，对每个解析出的 IP 判断：命中白名单或为普通公网 → 允许；
 *         只要解析出受限地址且未命中白名单 → 拒绝（防 rebinding）
 */
export async function check_target_allowed(host: string, options: policy_options = {}): Promise<target_check_result> {
    const raw_host = (host ?? '').trim();
    if (!raw_host) {
        return {allowed: false, reason: 'empty-host'};
    }
    // host 可能带端口，剥掉端口
    let hostname = raw_host;
    const port_match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(raw_host);
    if (port_match) {
        hostname = port_match[1];
    }
    // 去掉 IPv6 的方括号
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.slice(1, -1);
    }

    const {entries} = parse_allow_list(options.allow_list);

    // 情况 1：host 是 IP 字面量
    const as_ip = isIP(hostname);
    if (as_ip) {
        const restricted = classify_restricted(hostname);
        if (restricted === null) {
            // 普通公网 IP，允许
            return {allowed: true};
        }
        // 受限地址：只有命中白名单才允许
        if (ip_allowed_by_entries(hostname, entries)) {
            return {allowed: true};
        }
        return {allowed: false, reason: `restricted-ip:${restricted}`};
    }

    // 情况 2：域名
    const domain_hit = domain_allowed_by_entries(hostname, entries);
    if (domain_hit) {
        // 域名被显式信任，直接放行（管理员已明确授权）
        return {allowed: true};
    }

    const resolve = options.resolve ?? default_resolve;
    let ips: string[];
    try {
        ips = await resolve(hostname);
    } catch (e: any) {
        return {allowed: false, reason: `dns-failed:${e?.code ?? e?.message ?? e}`};
    }
    if (!ips || ips.length === 0) {
        return {allowed: false, reason: 'dns-empty'};
    }
    for (const ip of ips) {
        const restricted = classify_restricted(ip);
        if (restricted === null) {
            // 解析出普通公网地址，允许
            continue;
        }
        // 解析到受限地址：必须命中白名单（网段/精确 IP）才允许
        if (ip_allowed_by_entries(ip, entries)) {
            continue;
        }
        return {allowed: false, reason: `dns-to-restricted:${ip}:${restricted}`};
    }
    return {allowed: true};
}

/** 默认 DNS 解析：返回 A + AAAA 全部地址 */
async function default_resolve(host: string): Promise<string[]> {
    const res = await dns.promises.lookup(host, {all: true, verbatim: true});
    return res.map(r => r.address);
}
