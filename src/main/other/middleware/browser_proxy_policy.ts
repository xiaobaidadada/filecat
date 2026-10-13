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

/** 校验结果：allowed 表示是否放行，reason 仅用于日志排查 */
export interface target_check_result {
    allowed: boolean;
    reason?: string;
}

// ==================== IP 解析与分类 ====================

/** 把 IPv4 字符串转成 32 位无符号整数；非法返回 null */
function ipv4_to_int(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
        return null;
    }
    let n = 0;
    for (const p of parts) {
        if (!/^\d+$/.test(p)) {
            return null;
        }
        const v = Number(p);
        if (v < 0 || v > 255) {
            return null;
        }
        n = (n * 256) + v;
    }
    return n >>> 0;
}

/** 把 IPv6 字符串展开为 16 字节数组；非法返回 null */
function ipv6_to_bytes(ip: string): number[] | null {
    let str = ip;
    // 去掉可能的 zone id（如 fe80::1%eth0）
    const zone = str.indexOf('%');
    if (zone !== -1) {
        str = str.slice(0, zone);
    }
    // 处理 IPv4 嵌入形式（::ffff:1.2.3.4）
    let tail_v4: string | null = null;
    const v4_index = str.lastIndexOf(':');
    if (v4_index !== -1 && str.slice(v4_index + 1).includes('.')) {
        tail_v4 = str.slice(v4_index + 1);
        str = str.slice(0, v4_index + 1) + '0:0';
    }
    const dbl = str.split('::');
    if (dbl.length > 2) {
        return null;
    }
    const head = dbl[0] ? dbl[0].split(':') : [];
    const tail = dbl.length === 2 ? (dbl[1] ? dbl[1].split(':') : []) : null;
    let groups: string[];
    if (tail === null) {
        groups = head;
    } else {
        const missing = 8 - head.length - tail.length;
        if (missing < 0) {
            return null;
        }
        groups = [...head, ...new Array(missing).fill('0'), ...tail];
    }
    if (groups.length !== 8) {
        return null;
    }
    const bytes: number[] = [];
    for (const g of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
            return null;
        }
        const v = parseInt(g, 16);
        bytes.push((v >> 8) & 0xff, v & 0xff);
    }
    // 回填 IPv4 尾部
    if (tail_v4) {
        const v4n = ipv4_to_int(tail_v4);
        if (v4n === null) {
            return null;
        }
        bytes[12] = (v4n >>> 24) & 0xff;
        bytes[13] = (v4n >>> 16) & 0xff;
        bytes[14] = (v4n >>> 8) & 0xff;
        bytes[15] = v4n & 0xff;
    }
    return bytes;
}

/** 判断是否 IPv4 私有网段（RFC1918） */
function is_private_v4(n: number): boolean {
    // 10.0.0.0/8
    if ((n >>> 24) === 10) return true;
    // 172.16.0.0/12
    if ((n >>> 20) === (172 * 16 + 1)) return true;
    // 192.168.0.0/16
    if ((n >>> 16) === (192 * 256 + 168)) return true;
    return false;
}

/**
 * 判断一个字面量 IP（v4/v6）是否属于「默认禁止」的受限地址。
 * 返回原因字符串表示受限，返回 null 表示普通地址（公网，默认允许）。
 */
function classify_restricted(ip: string): string | null {
    const v = isIP(ip);
    if (v === 4) {
        const n = ipv4_to_int(ip);
        if (n === null) return 'invalid-ipv4';
        // 0.0.0.0/8 本网络
        if ((n >>> 24) === 0) return 'this-network';
        // 127.0.0.0/8 环回
        if ((n >>> 24) === 127) return 'loopback';
        // 100.64.0.0/10 运营商级 NAT
        if ((n >>> 22) === (100 * 4 + 1)) return 'cgnat';
        // 169.254.0.0/16 链路本地（含云元数据 169.254.169.254）
        if ((n >>> 16) === (169 * 256 + 254)) return 'link-local';
        if (is_private_v4(n)) return 'private';
        // 192.0.0.0/24 特殊用途
        if ((n >>> 8) === (192 * 65536 + 0 * 256 + 0)) return 'reserved';
        // 192.0.2.0/24 文档
        if ((n >>> 8) === (192 * 65536 + 0 * 256 + 2)) return 'documentation';
        // 198.18.0.0/15 基准测试
        if ((n >>> 17) === (198 * 128 + 0)) return 'benchmark';
        // 198.51.100.0/24 文档
        if ((n >>> 8) === (198 * 65536 + 51 * 256 + 100)) return 'documentation';
        // 203.0.113.0/24 文档
        if ((n >>> 8) === (203 * 65536 + 0 * 256 + 113)) return 'documentation';
        // 224.0.0.0/4 组播
        if ((n >>> 28) === 14) return 'multicast';
        // 240.0.0.0/4 保留（含 255.255.255.255）
        if ((n >>> 28) === 15) return 'reserved';
        return null;
    }
    if (v === 6) {
        const b = ipv6_to_bytes(ip);
        if (!b) return 'invalid-ipv6';
        // ::1 环回
        if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return 'loopback';
        // :: 未指定
        if (b.every(x => x === 0)) return 'unspecified';
        // ::ffff:0:0/96 IPv4 映射，按其内嵌 IPv4 规则判断
        if (b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff) {
            const v4n = ((b[12] << 24) | (b[13] << 16) | (b[14] << 8) | b[15]) >>> 0;
            const v4 = `${(v4n >>> 24) & 0xff}.${(v4n >>> 16) & 0xff}.${(v4n >>> 8) & 0xff}.${v4n & 0xff}`;
            return classify_restricted(v4);
        }
        // fe80::/10 链路本地
        if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return 'link-local';
        // fc00::/7 唯一本地（类私网）
        if ((b[0] & 0xfe) === 0xfc) return 'private';
        // ff00::/8 组播
        if (b[0] === 0xff) return 'multicast';
        return null;
    }
    return 'not-an-ip';
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
