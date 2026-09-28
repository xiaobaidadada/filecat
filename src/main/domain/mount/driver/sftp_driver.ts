import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_join} from "./file_driver_type";

/** 动态加载 ssh2（项目用 prebuild 机制分发，不能直接 import） */
function load_ssh2(): any {
    const {get_bin_dependency} = require("../../bin/get_bin_dependency");
    const mod = get_bin_dependency("@xiaobaidadada/ssh2-prebuilt", true);
    if (!mod?.Client) {
        throw new Error("SFTP 驱动不可用：ssh2 模块未安装");
    }
    return mod;
}

/** ssh2 的 SFTP 操作统一包一层 Promise，避免到处写回调 */
function sftp_call<T = any>(sftp: any, method: string, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
        sftp[method](...args, (err: any, result: T) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

export interface SftpConfig {
    host: string;
    port?: string | number;
    username: string;
    password?: string;
    private_key?: string;
    root?: string;
}

/**
 * SFTP 驱动。
 * 复用项目已有的 ssh2 prebuilt 依赖（SSH 代理功能已经在用它），不新增依赖。
 * 连接在一段时间内复用，避免每次操作都重新握手（握手开销大且慢）。
 */
export class SftpDriver implements FileDriver {
    readonly type = MountDriverType.sftp;
    readonly display_name = "SFTP";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        // ssh2 没有原生复制，走「读 + 写」兜底（caps.copy 置 true 表示"可用"，
        // 实际由基类/调用方决定实现方式，这里是驱动自己实现）
        copy: true,
        direct_url: false,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    private readonly config: SftpConfig;
    private client: any = null;
    private sftp: any = null;
    /** 正在建立连接的 Promise，避免并发时重复握手 */
    private connecting: Promise<any> | null = null;
    /** 空闲多久后断开（毫秒） */
    private readonly idle_timeout = 5 * 60 * 1000;
    private idle_timer: NodeJS.Timeout | null = null;
    /** 远程根目录（连接后由 realpath 得到） */
    private remote_root = "";

    constructor(config: SftpConfig) {
        if (!config?.host || !config?.username) {
            throw new Error("SFTP 挂载缺少主机或用户名");
        }
        this.config = config;
    }

    /** 取（必要时建立）可用连接 */
    private async get_sftp(): Promise<any> {
        if (this.sftp) {
            this.touch_idle();
            return this.sftp;
        }
        if (this.connecting) {
            return this.connecting;
        }
        this.connecting = this.connect().finally(() => {
            this.connecting = null;
        });
        return this.connecting;
    }

    private connect(): Promise<any> {
        const {Client} = load_ssh2();
        return new Promise((resolve, reject) => {
            const client = new Client();
            const on_error = (e: any) => {
                cleanup();
                reject(e);
            };
            const cleanup = () => {
                client.removeListener("error", on_error);
            };
            client.on("error", on_error);
            client.once("ready", () => {
                cleanup();
                client.sftp((err: any, sftp: any) => {
                    if (err) {
                        try {
                            client.end();
                        } catch (e) {
                            // ignore
                        }
                        reject(err);
                        return;
                    }
                    this.client = client;
                    this.sftp = sftp;
                    // 连接意外断开时清空，下次操作自动重连
                    client.on("close", () => this.clear_conn());
                    client.on("end", () => this.clear_conn());
                    // 求出远程的初始目录，方便把用户的「起始目录」拼成绝对路径
                    const root = (this.config.root ?? "").trim();
                    sftp.realpath(root || ".", (e: any, abs: string) => {
                        // realpath 失败就退回用配置里的值
                        this.remote_root = e ? root : abs;
                        this.touch_idle();
                        resolve(sftp);
                    });
                });
            });
            const conn: any = {
                host: this.config.host,
                port: this.config.port ? Number(this.config.port) : 22,
                username: this.config.username,
                readyTimeout: 20000,
                // 保活，避免连接被中间设备静默掐断
                keepaliveInterval: 20000,
                keepaliveCountMax: 3,
            };
            if (this.config.private_key) {
                conn.privateKey = this.config.private_key;
            } else {
                conn.password = this.config.password ?? "";
            }
            try {
                client.connect(conn);
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
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
        this.sftp = null;
        this.client = null;
    }

    /** 释放连接（驱动缓存淘汰或空闲超时时调用） */
    dispose(): void {
        const client = this.client;
        this.clear_conn();
        try {
            client?.end();
        } catch (e) {
            // ignore
        }
    }

    /** 挂载点内相对路径 → 远程绝对路径 */
    private abs(p: string): string {
        const inner = norm_mount_path(p).replace(/^\/+/, "");
        const root = this.remote_root || "/";
        if (!inner) {
            return root;
        }
        return root.endsWith("/") ? root + inner : `${root}/${inner}`;
    }

    /** 远程绝对路径 → 挂载点内相对路径 */
    private inner(abs_path: string): string {
        const root = this.remote_root || "/";
        let s = abs_path;
        if (s === root) {
            return "/";
        }
        if (root !== "/" && s.toLowerCase().startsWith(root.toLowerCase())) {
            s = s.slice(root.length);
        }
        return norm_mount_path(s);
    }

    /** 把 ssh2 的 readdir 结果转成统一项 */
    private to_items(sftp: any, dir: string, list: any[]): FileItemData[] {
        const out: FileItemData[] = [];
        for (const f of list) {
            const filename: string = f.filename;
            // ssh2 的时间字段单位是秒
            const mtime = f.attrs?.mtime ? f.attrs.mtime * 1000 : 0;
            const is_dir = f.attrs?.isDirectory?.() ?? false;
            out.push(driver_item_to_file_item({
                name: filename,
                path: mount_join(dir, filename),
                is_dir,
                size: is_dir ? undefined : (f.attrs?.size ?? 0),
                mtime,
                is_link: f.attrs?.isSymbolicLink?.() ?? false,
            }, getFileFormat));
        }
        return out;
    }

    async list(dir: string): Promise<FileItemData[]> {
        const sftp = await this.get_sftp();
        const list = await sftp_call<any[]>(sftp, "readdir", this.abs(dir));
        return this.to_items(sftp, dir, list);
    }

    async stat(path: string): Promise<FileItemData | null> {
        const sftp = await this.get_sftp();
        try {
            const attrs = await sftp_call<any>(sftp, "stat", this.abs(path));
            const is_dir = attrs.isDirectory?.() ?? false;
            return driver_item_to_file_item({
                name: norm_mount_path(path).slice(norm_mount_path(path).lastIndexOf("/") + 1),
                path: norm_mount_path(path),
                is_dir,
                size: is_dir ? undefined : attrs.size,
                mtime: attrs.mtime ? attrs.mtime * 1000 : 0,
            }, getFileFormat);
        } catch (e) {
            // 不存在
            if (e?.code === 2 || /No such file/i.test(e?.message ?? "")) {
                return null;
            }
            throw e;
        }
    }

    async read(path: string, range?: [number, number]): Promise<Readable> {
        const sftp = await this.get_sftp();
        const abs = this.abs(path);
        if (!range) {
            return sftp.createReadStream(abs);
        }
        // 指定区间时用 start/end 选项，SFTP 协议原生支持
        const opts: any = {start: range[0]};
        if (range[1] !== undefined && range[1] !== null) {
            opts.end = range[1];
        }
        return sftp.createReadStream(abs, opts);
    }

    async write(path: string, data: Readable, size?: number): Promise<void> {
        const sftp = await this.get_sftp();
        const abs = this.abs(path);
        await new Promise<void>((resolve, reject) => {
            const ws = sftp.createWriteStream(abs);
            const on_err = (e: any) => {
                cleanup();
                reject(e);
            };
            const cleanup = () => {
                data.removeListener("error", on_err);
                ws.removeListener("error", on_err);
            };
            data.on("error", on_err);
            ws.on("error", on_err);
            ws.on("close", () => {
                cleanup();
                resolve();
            });
            // 流式转发，数据不落服务器磁盘
            data.pipe(ws);
        });
    }

    /** 递归删除目录（SFTP 的 rmdir 只能删空目录） */
    private async remove_recursive(sftp: any, abs: string): Promise<void> {
        let entries: any[];
        try {
            entries = await sftp_call<any[]>(sftp, "readdir", abs);
        } catch (e) {
            // 不是目录，按文件删
            await sftp_call(sftp, "unlink", abs);
            return;
        }
        for (const f of entries) {
            const child = abs.endsWith("/") ? abs + f.filename : `${abs}/${f.filename}`;
            if (f.attrs?.isDirectory?.()) {
                await this.remove_recursive(sftp, child);
            } else {
                await sftp_call(sftp, "unlink", child);
            }
        }
        await sftp_call(sftp, "rmdir", abs);
    }

    async remove(path: string): Promise<void> {
        const sftp = await this.get_sftp();
        const abs = this.abs(path);
        let is_dir = false;
        try {
            const attrs = await sftp_call<any>(sftp, "lstat", abs);
            is_dir = attrs.isDirectory?.() ?? false;
        } catch (e) {
            // 取不到就按文件处理
        }
        if (is_dir) {
            await this.remove_recursive(sftp, abs);
        } else {
            await sftp_call(sftp, "unlink", abs);
        }
    }

    async mkdir(path: string): Promise<void> {
        const sftp = await this.get_sftp();
        const abs = this.abs(path);
        // 逐级创建，父目录不存在时 mkdir 会失败
        const root = this.remote_root || "/";
        let cur = abs.startsWith(root) ? root : "";
        const rest = abs.slice(cur.length).split("/").filter(v => v.length > 0);
        for (const seg of rest) {
            cur = cur.endsWith("/") ? cur + seg : `${cur}/${seg}`;
            try {
                await sftp_call(this.sftp, "mkdir", cur);
            } catch (e) {
                // 已存在（code 4 / 11）则继续；其它错误抛出
                const code = e?.code;
                if (code !== 4 && code !== 11) {
                    // 再 stat 一次确认是否真的是目录
                    try {
                        await sftp_call(this.sftp, "stat", cur);
                    } catch (e2) {
                        throw e;
                    }
                }
            }
        }
    }

    async move(from: string, to: string): Promise<void> {
        const sftp = await this.get_sftp();
        await sftp_call(sftp, "rename", this.abs(from), this.abs(to));
    }

    /** SFTP 无原生复制，用「读 + 写」流式实现（不落盘） */
    async copy(from: string, to: string): Promise<void> {
        const sftp = await this.get_sftp();
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
        // SFTP 协议本身没有统一的容量查询，部分服务端支持 statvfs 扩展
        try {
            const sftp = await this.get_sftp();
            if (typeof sftp.statvfs !== "function") {
                return null;
            }
            const vfs = await sftp_call<any>(sftp, "statvfs", this.remote_root || "/");
            const total = vfs.f_blocks * vfs.f_frsize;
            const free = vfs.f_bavail * vfs.f_frsize;
            return {used: total - free, total};
        } catch (e) {
            return null;
        }
    }
}
