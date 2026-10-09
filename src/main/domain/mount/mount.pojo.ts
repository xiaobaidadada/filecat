import {MountDriverType} from "./driver/file_driver";

/**
 * 一条挂载记录。
 * 语义：把「本地某个物理目录」替换成「某个远端（网盘/协议）的内容」。
 * 挂载后该本地目录下的真实文件不再被读取，所有文件操作都转发到对应驱动。
 *
 * 连接信息（账号密码等）不放在这里，而是通过 credential_id 引用一份「凭据」，
 * 这样同一个凭据可以挂载到多个目录，改密码时也只需改一处。
 */
export interface FileMountItem {
    /** 唯一 id */
    id: string;
    /** 驱动类型 */
    driver: MountDriverType;
    /** 本地挂载点绝对路径（即被"占用"的那个物理目录） */
    mount_path: string;
    /** 引用的凭据 id */
    credential_id: string;
    /**
     * 引用的子账号 id。
     * 仅「一个应用多账号」的凭据需要（目前是百度：account_id 即百度 uk）；
     * 其他驱动凭据本身就是一份连接信息，留空。
     */
    account_id?: string;
    /** 挂载备注；为空时用本地目录名 */
    note?: string;
    /** 起始目录（挂载本身的概念，不属于凭据） */
    root_dir?: string;
    /** 只读：为 true 时禁止一切写操作 */
    readonly?: boolean;
    /** 前端展示用的标识色 */
    color?: string;
    /** 是否启用；停用后该目录恢复成本地目录 */
    enabled?: boolean;
    /** 创建者用户 id */
    user_id?: string;
    /** 创建时间 */
    created_at?: number;
}

/** 挂载点匹配结果 */
export interface MountMatch {
    /** 命中的挂载记录 */
    mount: FileMountItem;
    /** 相对于挂载点的路径，以 / 开头 */
    inner_path: string;
    /** 挂载点本身（绝对路径） */
    base_path: string;
}

/**
 * 规范化绝对路径，用于挂载点比对。
 * Windows 下大小写不敏感、分隔符统一成 /，否则 D:\A 和 d:/a 会被判成不同路径。
 */
export function norm_abs_path(p: string): string {
    if (!p) {
        return "";
    }
    let s = p.replace(/\\/g, "/");
    // 去掉结尾斜杠（根目录除外，如 "D:/" 保留成 "D:"）
    while (s.length > 1 && s.endsWith("/")) {
        s = s.slice(0, -1);
    }
    // Windows 盘符统一大写
    if (/^[a-zA-Z]:/.test(s)) {
        s = s[0].toUpperCase() + s.slice(1);
    }
    return s;
}

/**
 * 判断 target 是否位于 mount_path 之下（含自身）。
 * 用「路径段」比较而不是字符串前缀，避免 /data/ab 被 /data/a 误匹配。
 */
export function is_under_path(target: string, base: string): boolean {
    const t = norm_abs_path(target);
    const b = norm_abs_path(base);
    if (!b) {
        return false;
    }
    if (t === b) {
        return true;
    }
    // base 可能是 "D:" 这种盘根，此时当作 "D:/" 处理
    const prefix = b.endsWith(":") ? b + "/" : b + "/";
    return t.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * 计算 target 相对 base 的内部路径，以 / 开头；不在 base 下返回 null。
 */
export function relative_path(target: string, base: string): string | null {
    if (!is_under_path(target, base)) {
        return null;
    }
    const t = norm_abs_path(target);
    const b = norm_abs_path(base);
    if (t === b) {
        return "/";
    }
    const prefix = b.endsWith(":") ? b : b;
    let rest = t.slice(prefix.length);
    if (!rest.startsWith("/")) {
        rest = "/" + rest;
    }
    // 统一成小写比较过，但返回时保留原样
    return rest;
}

/**
 * 在挂载列表中找到能覆盖 target 的那一条。
 * 采用「最长匹配」：如果一个挂载点嵌套在另一个挂载点内，取更深（更长）的那个。
 */
export function find_mount(target: string, mounts: FileMountItem[]): MountMatch | null {
    let best: MountMatch | null = null;
    for (const m of mounts) {
        if (m.enabled === false) {
            continue;
        }
        const inner = relative_path(target, m.mount_path);
        if (inner === null) {
            continue;
        }
        if (!best || m.mount_path.length > best.base_path.length) {
            best = {mount: m, inner_path: inner, base_path: m.mount_path};
        }
    }
    return best;
}

/**
 * 判断 target 的某条路径上是否存在挂载点（用于给目录项打挂载标记）。
 * 只比对直接相等（即该目录本身就是挂载点）。
 */
export function is_mount_point(target: string, mounts: FileMountItem[]): FileMountItem | null {
    const t = norm_abs_path(target);
    for (const m of mounts) {
        if (m.enabled === false) {
            continue;
        }
        if (norm_abs_path(m.mount_path) === t) {
            return m;
        }
    }
    return null;
}
