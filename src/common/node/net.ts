


// ==================== IP 解析与分类 ====================

import {isIP} from "net";
import {target_check_result} from "../../main/other/middleware/browser_proxy_policy";

/** 把 IPv4 字符串转成 32 位无符号整数；非法返回 null */
export function ipv4_to_int(ip: string): number | null {
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
export function ipv6_to_bytes(ip: string): number[] | null {
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
export function is_private_v4(n: number): boolean {
    // 10.0.0.0/8
    if ((n >>> 24) === 10) return true;
    // 172.16.0.0/12
    if ((n >>> 20) === (172 * 16 + 1)) return true;
    // 192.168.0.0/16
    if ((n >>> 16) === (192 * 256 + 168)) return true;
    return false;
}

const not_public_p_ranges: readonly (readonly [number, number])[] = [
    [0x00000000, 0x00FFFFFF], // 0.0.0.0/8：本网络
    [0x0A000000, 0x0AFFFFFF], // 10.0.0.0/8：私有地址
    [0x64400000, 0x647FFFFF], // 100.64.0.0/10：运营商共享地址
    [0x7F000000, 0x7FFFFFFF], // 127.0.0.0/8：回环地址
    [0xA9FE0000, 0xA9FEFFFF], // 169.254.0.0/16：链路本地
    [0xAC100000, 0xAC1FFFFF], // 172.16.0.0/12：私有地址
    [0xC0000000, 0xC00000FF], // 192.0.0.0/24：特殊用途
    [0xC0000200, 0xC00002FF], // 192.0.2.0/24：文档测试
    [0xC0586300, 0xC05863FF], // 192.88.99.0/24：已弃用的 6to4
    [0xC0A80000, 0xC0A8FFFF], // 192.168.0.0/16：私有地址
    [0xC6120000, 0xC613FFFF], // 198.18.0.0/15：网络基准测试
    [0xC6336400, 0xC63364FF], // 198.51.100.0/24：文档测试
    [0xCB007100, 0xCB0071FF], // 203.0.113.0/24：文档测试
    [0xE0000000, 0xEFFFFFFF], // 224.0.0.0/4：组播
    [0xF0000000, 0xFFFFFFFF], // 240.0.0.0/4：保留地址及广播地址
];
/**
 * 判断 IPv4 是否属于非公网路由地址范围。
 *
 * 支持：
 * - 无符号 IPv4 整数：0 ~ 0xFFFFFFFF
 * - 有符号 32 位 IPv4 整数：-0x80000000 ~ -1
 *
 * 非法输入抛出 RangeError。
 *
 * 注意：这是保守的地址范围判断，不代表实时 BGP 路由状态。
 */
export function is_non_publicly_routable_v4(n: number): boolean {
    if (
        !Number.isInteger(n) ||
        n < -0x80000000 ||
        n > 0xFFFFFFFF
    ) {
        throw new RangeError('Invalid IPv4 integer');
    }

    // 统一转换为无符号 32 位整数
    const ip = n >>> 0;

    // IANA 特殊用途地址中的两个全局可达例外
    // 192.0.0.9/32、192.0.0.10/32
    if (ip === 0xC0000009 || ip === 0xC000000A) {
        return false;
    }

    return not_public_p_ranges.some(([start, end]) => ip >= start && ip <= end);
}

/**
 * 判断传入字符串是否为「IPv4 字面量」且属于 RFC1918 私网。
 * - 域名、IPv6、非法字符串 → false
 * - 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16 → true
 */
export function is_private_ipv4_literal(input: string): boolean {
    const s = (input ?? '').trim();
    if (!s) {
        return false;
    }
    // 必须是 IPv4 字面量（isIP 返回 4 才继续；域名、IPv6 都返回 false）
    if (isIP(s) !== 4) {
        return false;
    }
    const n = ipv4_to_int(s);
    if (n === null) {
        return false;
    }
    return is_non_publicly_routable_v4(n);
}

/**
 * 判断一个字面量 IP（v4/v6）是否属于「默认禁止」的受限地址。
 * 返回原因字符串表示受限，返回 null 表示普通地址（公网，默认允许）。
 */
export function classify_restricted(ip: string): string | null {
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
