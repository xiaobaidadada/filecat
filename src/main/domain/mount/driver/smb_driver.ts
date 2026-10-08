import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_join} from "./file_driver_type";

/** 动态加载 node-libsmb2（原生模块，走项目的 eval require 机制，不能被 webpack 打包） */
function load_smb2(): any {
    const {get_bin_dependency} = require("../../bin/get_bin_dependency");
    const mod = get_bin_dependency("node-libsmb2", true);
    if (!mod?.Smb2Client) {
        throw new Error("SMB 驱动不可用：node-libsmb2 模块未安装");
    }
    return mod;
}

export interface SmbConfig {
    /** 主机名或 IP */
    server: string;
    /** 共享名 */
    share: string;
    /** 用户名 */
    username?: string;
    /** 密码 */
    password?: string;
    /** 挂载自己的起始目录（共享内相对路径） */
    root?: string;
}

/**
 * SMB / Windows 共享驱动。
 *
 * 底层用 node-libsmb2（基于 libsmb2 的 N-API 插件），连接在一段时间内复用，
 * 避免每次操作都重新握手（SMB 的 NTLM 握手较重）。
 */
export class SmbDriver implements FileDriver {
    readonly type = MountDriverType.smb;
    readonly display_name = "SMB 共享";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        // SMB 没有原生复制，走「读 + 写」兜底
        copy: true,
        direct_url: false,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    private readonly config: SmbConfig;
    private client: any = null;
    /** 正在建立连接的 Promise，避免并发时重复握手 */
    private connecting: Promise<any> | null = null;
    /** 空闲多久后断开（毫秒） */
    private readonly idle_timeout = 5 * 60 * 1000;
    private idle_timer: NodeJS.Timeout | null = null;

    /**
     * 枚举远程主机上的共享列表，供用户在下拉里直接挑共享名，
     * 不用去别处查共享叫什么。内部走 IPC$ 的 NetrShareEnum，与已有连接无关。
     */
    static async list_shares(config: {
        server: string;
        username?: string;
        password?: string;
    }): Promise<{ name: string; remark: string }[]> {
        if (!config?.server) {
            throw new Error("请先填写主机");
        }
        const {Smb2Client} = load_smb2();
        const client = new Smb2Client();
        try {
            const list = await client.share_enum({
                server: String(config.server),
                user: config.username ?? "",
                password: config.password ?? "",
            });
            // IPC$ 这类系统共享对用户没意义，不展示
            return (list ?? [])
                .filter((s: any) => !s.is_ipc)
                .map((s: any) => ({name: s.name, remark: s.remark ?? ""}));
        } finally {
            try {
                await client.disconnect();
            } catch (e) {
                // 枚举用的是独立 context，断开失败无影响
            }
        }
    }

    constructor(config: SmbConfig) {
        if (!config?.server || !config?.share) {
            throw new Error("SMB 挂载缺少主机或共享名");
        }
        this.config = config;
    }

    /** 取（必要时建立）可用连接 */
    private async get_client(): Promise<any> {
        if (this.client) {
            this.touch_idle();
            return this.client;
        }
        if (this.connecting) {
            return this.connecting;
        }
        this.connecting = this.connect().finally(() => {
            this.connecting = null;
        });
        return this.connecting;
    }

    private async connect(): Promise<any> {
        const {Smb2Client} = load_smb2();
        const client = new Smb2Client();
        try {
            await client.connect({
                server: String(this.config.server),
                share: String(this.config.share),
                user: this.config.username ?? "",
                password: this.config.password ?? "",
            });
        } catch (e: any) {
            // 连接失败要把实例释放掉，否则会残留一个半开的 context
            try {
                await client.disconnect();
            } catch (e2) {
                // ignore
            }
            throw e;
        }
        this.client = client;
        this.touch_idle();
        return client;
    }

    /** 刷新空闲计时，到点主动断开释放连接 */
    private touch_idle() {
        if (this.idle_timer) {
            clearTimeout(this.idle_timer);
        }
        this.idle_timer = setTimeout(() => {
            this.dispose();
        }, this.idle_timeout);
        // 不阻止进程退出
        this.idle_timer.unref?.();
    }

    private clear_conn() {
        if (this.idle_timer) {
            clearTimeout(this.idle_timer);
            this.idle_timer = null;
        }
        this.client = null;
    }

    /** 释放连接（驱动缓存淘汰或空闲超时时调用） */
    dispose(): void {
        const client = this.client;
        this.clear_conn();
        try {
            client?.disconnect();
        } catch (e) {
            // ignore
        }
    }

    /** 挂载点内相对路径 → 共享内绝对路径（含起始目录前缀） */
    private abs(p: string): string {
        const root = norm_mount_path(this.config.root ?? "");
        const inner = norm_mount_path(p);
        if (root === "/") {
            return inner;
        }
        return inner === "/" ? root : `${root}${inner}`;
    }

    async list(dir: string): Promise<FileItemData[]> {
        const client = await this.get_client();
        const entries = await client.opendir(this.abs(dir));
        const out: FileItemData[] = [];
        for (const e of entries) {
            if (e.name === "." || e.name === "..") {
                continue;
            }
            const is_dir = e.type === "dir";
            out.push(driver_item_to_file_item({
                name: e.name,
                path: mount_join(dir, e.name),
                is_dir,
                size: is_dir ? undefined : Number(e.size),
                // libsmb2 返回的时间单位是秒
                mtime: e.mtime ? e.mtime * 1000 : 0,
            }, getFileFormat));
        }
        return out;
    }

    async stat(path: string): Promise<FileItemData | null> {
        const client = await this.get_client();
        const st = await client.stat(this.abs(path));
        if (!st) {
            return null;
        }
        const norm = norm_mount_path(path);
        const is_dir = st.type === "dir";
        return driver_item_to_file_item({
            name: norm === "/" ? "" : norm.slice(norm.lastIndexOf("/") + 1),
            path: norm,
            is_dir,
            size: is_dir ? undefined : Number(st.size),
            mtime: st.mtime ? st.mtime * 1000 : 0,
        }, getFileFormat);
    }

    async read(path: string, range?: [number, number]): Promise<Readable> {
        const client = await this.get_client();
        const abs = this.abs(path);

        // node-libsmb2 没有流式读，按块读出来 push 给 Readable，
        // 这样业务层拿到的仍是流，不会因为大文件把内存打满。
        const chunk_size = 512 * 1024;

        if (!range) {
            return Readable.from(this.read_all(client, abs, chunk_size));
        }

        const start = range[0] ?? 0;
        const end = range[1];
        return Readable.from(this.read_range(client, abs, start, end, chunk_size));
    }

    /** 分块读取整个文件 */
    private async *read_all(client: any, abs: string, chunk_size: number): AsyncGenerator<Buffer> {
        let offset = 0;
        while (true) {
            const chunk = await client.read(abs, {offset, length: chunk_size});
            if (!chunk || chunk.length === 0) {
                break;
            }
            yield chunk;
            if (chunk.length < chunk_size) {
                break;
            }
            offset += chunk.length;
        }
    }

    /** 分块读取指定区间（闭区间，end 省略表示到末尾） */
    private async *read_range(
        client: any,
        abs: string,
        start: number,
        end: number | undefined,
        chunk_size: number
    ): AsyncGenerator<Buffer> {
        let offset = start;
        while (true) {
            const want = end === undefined
                ? chunk_size
                : Math.min(chunk_size, end - offset + 1);
            if (want <= 0) {
                break;
            }
            const chunk = await client.read(abs, {offset, length: want});
            if (!chunk || chunk.length === 0) {
                break;
            }
            yield chunk;
            offset += chunk.length;
            if (chunk.length < want) {
                break;
            }
        }
    }

    async write(path: string, data: Readable, _size?: number): Promise<void> {
        const client = await this.get_client();
        const abs = this.abs(path);
        // 先清空，保证「覆盖写」语义（与 SFTP createWriteStream 行为一致）
        try {
            await client.truncate(abs);
        } catch (e) {
            // 文件不存在时 truncate 会失败，忽略即可（后续 write 会自动创建）
        }
        let offset = 0;
        for await (const chunk of data) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            let written = 0;
            while (written < buf.length) {
                const part = buf.subarray(written);
                const n = await client.write(abs, part, {offset});
                if (n <= 0) {
                    throw new Error(`写入 SMB 共享失败：${path}`);
                }
                written += n;
                offset += n;
            }
        }
    }

    /** 递归删除目录（SMB 的 rmdir 只能删空目录） */
    private async remove_recursive(client: any, abs: string): Promise<void> {
        let entries: any[];
        try {
            entries = await client.opendir(abs);
        } catch (e) {
            // 不是目录，按文件删
            await client.unlink(abs);
            return;
        }
        for (const f of entries) {
            if (f.name === "." || f.name === "..") {
                continue;
            }
            const child = abs === "/" ? `/${f.name}` : `${abs}/${f.name}`;
            if (f.type === "dir") {
                await this.remove_recursive(client, child);
            } else {
                await client.unlink(child);
            }
        }
        await client.rmdir(abs);
    }

    async remove(path: string): Promise<void> {
        const client = await this.get_client();
        const abs = this.abs(path);
        const st = await client.stat(abs);
        if (st && st.type === "dir") {
            await this.remove_recursive(client, abs);
        } else {
            await client.unlink(abs);
        }
    }

    async mkdir(path: string): Promise<void> {
        const client = await this.get_client();
        const abs = this.abs(path);
        // 逐级创建，父目录不存在时 mkdir 会失败
        const base = norm_mount_path(this.config.root ?? "");
        let cur = base === "/" ? "" : base;
        const rest = abs.slice(cur.length).split("/").filter(v => v.length > 0);
        for (const seg of rest) {
            cur = cur === "" ? `/${seg}` : `${cur}/${seg}`;
            try {
                await client.mkdir(cur);
            } catch (e) {
                // 已存在则继续；其它错误抛出
                const exists = await client.exists(cur);
                if (!exists) {
                    throw e;
                }
            }
        }
    }

    async move(from: string, to: string): Promise<void> {
        const client = await this.get_client();
        await client.rename(this.abs(from), this.abs(to));
    }

    /** SMB 无原生复制，用「读 + 写」流式实现（不落盘） */
    async copy(from: string, to: string): Promise<void> {
        const src = await this.stat(from);
        if (!src) {
            throw new Error("源路径不存在");
        }
        if (src.type === "folder" as any) {
            // 目录：递归复制
            const children = await this.list(from);
            await this.mkdir(to);
            for (const c of children) {
                await this.copy(mount_join(from, c.name), mount_join(to, c.name));
            }
            return;
        }
        const rs = await this.read(from);
        await this.write(to, rs, src.size);
    }

    async getDirectUrl(): Promise<string | null> {
        return null;
    }

    async quota(): Promise<{used: number; total: number} | null> {
        // SMB2 的容量查询要 FSCTL 扩展，libsmb2 未封装
        return null;
    }
}
