import path from "path";
import {Readable} from "stream";
import {mountService} from "../mount/mount.service";
import {MountMatch} from "../mount/mount.pojo";
import {FileDriver} from "../mount/driver/file_driver";
import {FileItemData, FileTypeEnum} from "../../../common/file.pojo";
import {norm_mount_path} from "../mount/driver/file_driver_type";

/**
 * 挂载与本地路径之间的统一适配层。
 *
 * 核心思路：业务层只调这里的方法，由它决定「这次操作到底走本地磁盘还是走某个网盘」。
 * 这样 file.service.ts 里 30 个方法都只需要在开头加一次判断，
 * 而不是到处写 if (是网盘) {...} else {...}。
 */

/**
 * 一次「路径解析」的结果。
 * 命中挂载时 driver 非空，inner_path 是挂载点内相对路径；
 * 未命中时 driver 为 null，real_path 是本地绝对路径。
 */
export interface PathResolution {
    /** 挂载匹配信息；null 表示本地路径 */
    match: MountMatch | null;
    /** 本地绝对路径（本地场景直接用；挂载场景是「挂载点 + 相对路径」拼出来的，仅用于展示/日志） */
    real_path: string;
    /** 挂载点内相对路径；本地场景恒为 "/" */
    inner_path: string;
}

/** 解析一个本地绝对路径，判断是否被挂载接管 */
export function resolve_local_path(abs_path: string): PathResolution {
    const match = mountService.resolve(abs_path);
    if (!match) {
        return {match: null, real_path: abs_path, inner_path: "/"};
    }
    return {match, real_path: abs_path, inner_path: match.inner_path};
}

/** 该路径是否被挂载接管 */
export function is_mounted(abs_path: string): boolean {
    return mountService.resolve(abs_path) !== null;
}

/**
 * 取「某个目录下」所有的挂载点信息，key 为挂载点的绝对路径。
 *
 * 用于文件列表：列表里某个文件夹本身正好是挂载点时，给它打上挂载标记
 * （显示特殊底色），而不是标记它里面的内容。
 */
export function mounts_under(abs_dir: string): Map<string, {
    name: string;
    driver: string;
    color: string;
    readonly: boolean;
}> {
    const map = new Map<string, {name: string; driver: string; color: string; readonly: boolean}>();
    // 总开关关闭时没有任何挂载生效，直接返回空，省去逐个路径匹配
    if (!mountService.is_enabled()) {
        return map;
    }
    const prefix = abs_dir.endsWith(path.sep) ? abs_dir : abs_dir + path.sep;
    for (const m of mountService.list()) {
        if (!m.enabled) {
            continue;
        }
        const mp = path.resolve(m.mount_path);
        // 只取「直接位于该目录下」的挂载点（不含更深层的），逐层进入时自然显示
        if (!mp.startsWith(prefix)) {
            continue;
        }
        const rest = mp.slice(prefix.length);
        if (rest.includes(path.sep)) {
            continue;
        }
        map.set(mp, {
            name: m.note || rest,
            driver: m.driver,
            color: m.color || "#4a9eff",
            readonly: Boolean(m.readonly),
        });
    }
    return map;
}

/**
 * 取某个路径「所在挂载」的展示信息。
 * 命中挂载（含挂载点自身及其子目录）时返回挂载的展示信息，用于前端顶部提示。
 * 提示条展示：凭据备注 - 驱动名/账号备注 - 挂载备注。
 */
export function current_mount_info(abs_path: string): {
    /** 挂载备注；为空时用本地目录名 */
    name: string;
    driver: string;
    color: string;
    mount_path: string;
    readonly: boolean;
    /** 凭据备注（展示用） */
    credential_note: string;
    /** 账号备注（仅百度等一凭据多账号的类型有；展示用，为空时回退账号名） */
    account_note: string;
} | null {
    const match = mountService.resolve(abs_path);
    if (!match) {
        return null;
    }
    const m = match.mount;
    // 凭据与账号备注属于展示信息，取不到时降级为空字符串，不影响挂载本身
    const cred = mountService.get_credential(m.credential_id);
    const acc = m.account_id ? (cred?.accounts ?? []).find(v => v.id === m.account_id) : undefined;
    return {
        name: m.note || base_name(m.mount_path),
        driver: m.driver,
        color: m.color || "#4a9eff",
        mount_path: m.mount_path,
        readonly: Boolean(m.readonly),
        credential_note: cred?.note || "",
        account_note: acc ? (acc.note || acc.account_name || acc.nickname || "") : "",
    };
}

/**
 * 取驱动；未挂载时抛错。
 * 用于那些「只有挂载场景才会调用」的方法。
 */
export function require_driver(abs_path: string): {driver: FileDriver; inner_path: string; match: MountMatch} {
    const r = resolve_local_path(abs_path);
    if (!r.match) {
        throw new Error("该路径不是挂载目录");
    }
    return {
        driver: mountService.driver_of(r.match.mount),
        inner_path: r.inner_path,
        match: r.match,
    };
}

/** 只读挂载的写操作拦截 */
export function assert_writable(match: MountMatch, action: string): void {
    if (match.mount.readonly) {
        throw new Error(`该挂载为只读模式，无法执行「${action}」`);
    }
}

/**
 * 禁止直接操作「挂载点本身」。
 *
 * 挂载点在驱动里对应网盘根目录（inner_path 为 "/"），对它做删除/移动
 * 会清空整个网盘，属于高危操作，业务层必须先过这道校验。
 */
export function assert_not_mount_root(match: MountMatch, action: string): void {
    if (norm_mount_path(match.inner_path) === "/") {
        throw new Error(`挂载目录不能${action}，该操作会影响整个网盘`);
    }
}

/** 是否允许对某个目录做「新建/重命名」等需要本地写权限的操作 */
export function assert_cap(
    driver: FileDriver,
    cap: keyof FileDriver["caps"],
    action: string,
    match?: MountMatch
): void {
    if (match) {
        assert_writable(match, action);
    }
    if (!driver.caps[cap]) {
        throw new Error(`当前挂载（${driver.display_name}）不支持「${action}」操作`);
    }
}

/**
 * 把驱动返回的文件项补上「挂载点前缀」，使前端拿到的 path 与本地保持一致。
 * 前端只认绝对路径，不需要知道挂载的存在。
 */
export function to_frontend_item(item: FileItemData, match: MountMatch): FileItemData {
    const base = match.base_path.replace(/\\/g, "/");
    const inner = norm_mount_path(item.path);
    const full = inner === "/" ? base : base + inner;
    return {
        ...item,
        path: full,
        // 标记为挂载项，前端据此加特殊颜色
        mount: true,
        mount_driver: match.mount.driver,
        mount_color: match.mount.color,
        mount_readonly: match.mount.readonly,
    } as FileItemData;
}

/** 把本地路径拆成「挂载点 + 相对路径」的父目录形式，用于挂载场景下的本地校验 */
export function inner_parent(inner_path: string): string {
    const s = norm_mount_path(inner_path);
    if (s === "/") {
        return "/";
    }
    const i = s.lastIndexOf("/");
    return i <= 0 ? "/" : s.slice(0, i);
}

/** 驱动读到的流统一转成 Readable（部分 SDK 返回 Blob/Uint8Array） */
export function as_readable(data: any): Readable {
    if (data instanceof Readable) {
        return data;
    }
    if (data && typeof data.pipe === "function") {
        return data;
    }
    if (data?.transformToWebStream) {
        // AWS SDK v3 的 SdkStream
        const {Readable: NodeReadable} = require("stream");
        return NodeReadable.fromWeb(data.transformToWebStream());
    }
    if (Buffer.isBuffer(data)) {
        return Readable.from([data]);
    }
    if (data && typeof data[Symbol.asyncIterator] === "function") {
        return Readable.from(data);
    }
    throw new Error("无法识别的响应流类型");
}

/** 判断文件项是否是目录（前端 FileTypeEnum.folder） */
export function is_dir_item(item: FileItemData | undefined | null): boolean {
    return item?.type === FileTypeEnum.folder;
}

/** 取文件名 */
export function base_name(p: string): string {
    return path.basename(p.replace(/\\/g, "/"));
}

/**
 * 把前端传来的路径与子项名称拼成子项的「前端路径」。
 * 前端路径就是 param_path 的形态（相对或绝对都行），
 * 保持与本地分支一致，前端不用区分挂载与本地。
 */
export function join_frontend_path(param_path: string, name: string): string {
    const base = param_path ?? "";
    if (!base) {
        return name;
    }
    // 统一用 / 拼接，去掉重复的斜杠
    const trimmed = base.replace(/[\\/]+$/, "");
    return `${trimmed}/${name}`;
}

/** 把流读成 Buffer（读小文件内容时用） */
export async function stream_to_buffer(stream: Readable, max = 32 * 1024 * 1024): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let len = 0;
    for await (const c of stream) {
        const buf = Buffer.from(c);
        chunks.push(buf);
        len += buf.length;
        if (len > max) {
            throw new Error("文件过大，无法以文本方式读取");
        }
    }
    return Buffer.concat(chunks);
}
