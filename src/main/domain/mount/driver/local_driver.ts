import path from "path";
import fs from "fs";
import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_basename} from "./file_driver_type";
import {FileUtil} from "../../file/FileUtil";
import {norm_abs_path} from "../mount.pojo";

/**
 * 本地目录驱动。
 *
 * 用途：把一个「本地绝对目录」当作挂载源，接到 filecat 的另一个本地目录上，
 * 从而实现 filecat 内部的目录链接（类似软链接，但不产生真实链接文件）。
 *
 * 路径映射：
 *   挂载点内相对路径 "/a/b.txt"  →  真实物理路径 path.join(源目录, "a/b.txt")
 *   所有文件操作最终都落到真实物理路径上，等价于直接操作源目录。
 *
 * 安全：所有通过挂载传入的相对路径都必须落在源目录内，
 * 防止 "../.." 之类的越权访问逃逸到源目录之外。
 */
export interface LocalDriverConfig {
    /** 源目录绝对路径（来自凭据 config.path） */
    path: string;
    /** 起始目录（挂载自己配置，相对源目录；为空表示整个源目录） */
    root?: string;
}

export class LocalDriver implements FileDriver {
    readonly type = MountDriverType.local;
    readonly display_name = "本地目录";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        copy: true,
        direct_url: false,
        quota: true,
        compress: false,
        recycle: false,
        share: false,
    };

    /** 源目录绝对路径（已规范化） */
    private readonly source: string;

    constructor(config: LocalDriverConfig) {
        const p = String(config?.path ?? "").trim();
        if (!p) {
            throw new Error("本地目录挂载缺少源目录");
        }
        if (!path.isAbsolute(p)) {
            throw new Error("源目录必须是绝对路径");
        }
        this.source = path.resolve(p);
        // 起始目录拼到源目录后面
        const root = String(config?.root ?? "").trim().replace(/^[/\\]+|[/\\]+$/g, "");
        if (root) {
            this.source = path.join(this.source, root);
        }
    }

    /**
     * 把「挂载点内相对路径」解析成「真实物理路径」。
     * 解析后必须仍位于源目录之内，否则抛错（防止路径穿越）。
     */
    private real_path(inner: string): string {
        const rel = norm_mount_path(inner).replace(/^\/+/, "");
        const real = rel ? path.join(this.source, ...rel.split("/")) : this.source;
        const real_norm = norm_abs_path(real);
        const source_norm = norm_abs_path(this.source);
        // 允许等于源目录本身，或位于其下
        if (real_norm !== source_norm && !real_norm.toLowerCase().startsWith(source_norm.toLowerCase() + "/")) {
            throw new Error("非法路径：超出源目录范围");
        }
        return real;
    }

    async list(dir: string): Promise<FileItemData[]> {
        const real = this.real_path(dir);
        const names = await FileUtil.readdirSync(real);
        const base_inner = norm_mount_path(dir);
        const items: FileItemData[] = [];
        for (const name of names) {
            const child_real = path.join(real, name);
            let st;
            try {
                // 用 lstat 避免符号链接被解引用（保留链接本身的信息）
                st = await FileUtil.lstatSync(child_real);
            } catch (e) {
                // 读取失败（权限/竞态）时跳过该项，不影响整个目录
                continue;
            }
            items.push(driver_item_to_file_item({
                name,
                path: (base_inner === "/" ? "" : base_inner) + "/" + name,
                is_dir: st.isDirectory(),
                size: st.isDirectory() ? undefined : st.size,
                mtime: st.mtime?.getTime(),
                is_link: st.isSymbolicLink(),
            }, getFileFormat));
        }
        return items;
    }

    async stat(inner: string): Promise<FileItemData | null> {
        const real = this.real_path(inner);
        let st;
        try {
            st = await FileUtil.lstatSync(real);
        } catch (e) {
            return null;
        }
        const name = mount_basename(inner) || path.basename(this.source);
        return driver_item_to_file_item({
            name,
            path: norm_mount_path(inner),
            is_dir: st.isDirectory(),
            size: st.isDirectory() ? undefined : st.size,
            mtime: st.mtime?.getTime(),
            is_link: st.isSymbolicLink(),
        }, getFileFormat);
    }

    async read(inner: string, range?: [number, number]): Promise<Readable> {
        const real = this.real_path(inner);
        if (range) {
            // Range 用闭区间，end 省略时表示到末尾
            const start = range[0];
            const end = range[1] === undefined || range[1] === null ? undefined : range[1];
            return fs.createReadStream(real, end === undefined ? {start} : {start, end});
        }
        return fs.createReadStream(real);
    }

    async write(inner: string, data: Readable, _size?: number): Promise<void> {
        const real = this.real_path(inner);
        // 目标目录可能不存在，先确保父目录存在
        await FileUtil.ensure_dir(path.dirname(real));
        // 流式写入真实文件，不落额外临时文件
        await new Promise<void>((resolve, reject) => {
            const ws = fs.createWriteStream(real);
            data.pipe(ws);
            ws.on("finish", () => resolve());
            ws.on("error", reject);
            data.on("error", reject);
        });
    }

    async remove(inner: string): Promise<void> {
        const real = this.real_path(inner);
        if (norm_mount_path(inner) === "/") {
            // 删除源目录本身属于高危操作，禁止
            throw new Error("不能删除挂载根目录");
        }
        const st = await FileUtil.lstatSync(real);
        if (st.isDirectory()) {
            await FileUtil.remove_dir(real);
        } else {
            await FileUtil.unlinkSync(real);
        }
    }

    async mkdir(inner: string): Promise<void> {
        const real = this.real_path(inner);
        await FileUtil.mkdirSync(real, {recursive: true});
    }

    async move(from: string, to: string): Promise<void> {
        const real_from = this.real_path(from);
        const real_to = this.real_path(to);
        await FileUtil.ensure_dir(path.dirname(real_to));
        // 同源目录内的移动：直接 rename 最快；跨盘时退回「复制 + 删除」
        try {
            await FileUtil.renameSync(real_from, real_to);
        } catch (e) {
            if (e?.code === "EXDEV") {
                await FileUtil.copy(real_from, real_to);
                await FileUtil.remove_dir(real_from);
            } else {
                throw e;
            }
        }
    }

    async copy(from: string, to: string): Promise<void> {
        const real_from = this.real_path(from);
        const real_to = this.real_path(to);
        await FileUtil.ensure_dir(path.dirname(real_to));
        // 递归复制；不允许复制到自身或其子孙（会导致无限递归）
        if (norm_abs_path(real_to).toLowerCase().startsWith(norm_abs_path(real_from).toLowerCase() + "/")) {
            throw new Error("不能把目录复制到它自己的子目录内");
        }
        await FileUtil.copy(real_from, real_to);
    }

    async getDirectUrl(): Promise<string | null> {
        // 本地文件不走直链，由上层按普通本地文件方式处理（实际上层对 local 挂载仍走驱动中转）
        return null;
    }

    /**
     * 把挂载点内相对路径还原成真实物理路径。
     * 只有本地目录驱动能给出真实路径，上层据此判断「这个挂载项其实还是本地文件」，
     * 从而支持打包下载、压缩等只能对本地路径做的操作。
     */
    local_real_path(inner: string): string | null {
        try {
            return this.real_path(inner);
        } catch (e) {
            return null;
        }
    }

    async quota(): Promise<{used: number; total: number} | null> {
        // 本地目录容量交给上层按目标盘统计更准确；这里返回 null 让上层走磁盘容量逻辑
        return null;
    }
}

/**
 * 校验本地目录挂载的合法性（供挂载保存前调用）。
 * 规则：
 *  1) 源目录必须存在且是目录；
 *  2) 源目录与挂载点不能相同；
 *  3) 源目录与挂载点不能存在祖孙嵌套（否则会无限递归）。
 * 已考虑 Windows 大小写不敏感与分隔符差异（统一用 norm_abs_path 归一化比较）。
 * @returns 错误信息；合法返回 undefined
 */
export async function validate_local_mount(source_path: string, mount_path: string): Promise<string | undefined> {
    const source = String(source_path ?? "").trim();
    const mount = String(mount_path ?? "").trim();
    if (!source) {
        return "请填写源目录";
    }
    if (!path.isAbsolute(source)) {
        return "源目录必须是绝对路径";
    }
    if (!mount) {
        return "请选择挂载点目录";
    }
    // 1) 源目录必须存在且为目录
    let st;
    try {
        st = await FileUtil.statSync(source);
    } catch (e) {
        return "源目录不存在";
    }
    if (!st.isDirectory()) {
        return "源路径不是目录";
    }
    const s = norm_abs_path(source);
    const m = norm_abs_path(mount);
    if (s === m) {
        return "源目录不能与挂载点相同";
    }
    // 3) 禁止互为祖先 / 子孙，避免挂载后无限递归
    const s_low = s.toLowerCase();
    const m_low = m.toLowerCase();
    if (m_low.startsWith(s_low + "/")) {
        return "挂载点不能位于源目录内部（会造成无限递归）";
    }
    if (s_low.startsWith(m_low + "/")) {
        return "源目录不能位于挂载点内部（会造成无限递归）";
    }
    // 额外：源目录不能落在「已存在的其它挂载点」内，避免链路形成环（简单校验一层）
    return undefined;
}
