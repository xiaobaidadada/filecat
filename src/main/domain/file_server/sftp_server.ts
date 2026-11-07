import {path_join} from "../../../common/path_util";
import * as path from "path";
import {FileUtil} from "../file/FileUtil";
import {FileServerItem} from "./file_server.pojo";
import {get_bin_dependency} from "../bin/get_bin_dependency";

// ssh2 无类型定义，按项目约定用 any（见 ssh.ssh2.ts）
const {Server} = get_bin_dependency("@xiaobaidadada/ssh2-prebuilt", false);
type Server = any;
type ServerConfig = any;
type Connection = any;
type SFTPWrapper = any;
type FileEntry = any;

/**
 * SFTP 文件服务。
 *
 * 基于 ssh2 的 Server 类实现。ssh2 已内置完整 SFTP 协议栈，
 * 这里只需要把 OPEN/READ/WRITE/OPENDIR/READDIR 等回调接到 FileUtil 上。
 *
 * 路径约定：客户端看到的是以 / 为根的虚拟目录，映射到 item.root_path。
 * 所有请求都必须经过 resolve() 校验，防止 ../ 逃逸到根目录之外。
 */
export class SftpServer {

    private server?: Server;
    private running = false;
    /** 打开的句柄 → 系统路径 */
    private open_files = new Map<number, string>();
    /** 目录句柄的分页游标：句柄 → 已返回的条目数 */
    private dir_cursor = new Map<number, number>();
    /** 当前活跃的客户端连接，停止时需要主动断开 */
    private clients = new Set<any>();

    constructor(private item: FileServerItem) {}

    /** 把客户端传来的路径转成系统路径，越界时抛错 */
    private resolve(client_path: string): string {
        const root = path.resolve(this.item.root_path);
        // 客户端路径统一成 / 开头，去掉开头的斜杠后拼到 root 上
        const rel = String(client_path || "/").replace(/\\/g, "/").replace(/^\/+/, "");
        const full = path.resolve(root, rel);
        if (full !== root && !full.startsWith(root + path.sep)) {
            throw new Error("permission denied");
        }
        return full;
    }

    /** 启动监听 */
    async start(): Promise<void> {
        const cfg: ServerConfig = {
            hostKeys: [await this.resolve_host_key()],
        };

        this.server = new Server(cfg, (client: Connection) => {
            this.handle_client(client);
        });

        await new Promise<void>((resolve, reject) => {
            const on_error = (e: Error) => reject(e);
            this.server!.once("error", on_error);
            this.server!.listen(this.item.port, "0.0.0.0", () => {
                this.server!.removeListener("error", on_error);
                this.running = true;
                resolve();
            });
        });
    }

    /** 停止监听 */
    async stop(): Promise<void> {
        if (!this.server) {
            return;
        }
        const srv = this.server;
        this.server = undefined;

        // ssh2 的 close() 要等所有连接断开才回调；
        // 主动断开当前所有客户端，避免 stop() 永远挂住。
        for (const c of this.clients) {
            try {
                c.end();
            } catch (e) {
                // 忽略
            }
        }
        this.clients.clear();

        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) {
                    return;
                }
                done = true;
                resolve();
            };
            srv.close(finish);
            // 兜底：3 秒内没回调也认为已停止
            setTimeout(finish, 3000);
        });

        this.running = false;
        this.open_files.clear();
        this.dir_cursor.clear();
    }

    is_running(): boolean {
        return this.running;
    }

    /** 取主机密钥（自动生成并落在数据目录，避免每次重启指纹变化） */
    private async resolve_host_key(): Promise<string> {
        return this.host_key_pem;
    }

    private host_key_pem = "";

    /** 由外部注入主机密钥（service 层统一生成一次，所有 SFTP 服务共用） */
    set_host_key(pem: string): void {
        this.host_key_pem = pem;
    }

    /** 处理单个客户端连接 */
    private handle_client(client: Connection): void {
        this.clients.add(client);
        client.on("close", () => {
            this.clients.delete(client);
        });

        client.on("authentication", (ctx) => {
            if (ctx.method !== "password") {
                return ctx.reject(["password"]);
            }
            const ok = this.check_password(ctx.username, ctx.password);
            if (!ok) {
                return ctx.reject();
            }
            ctx.accept();
        });

        client.on("ready", () => {
            client.on("session", (accept) => {
                const session = accept();
                session.on("sftp", (accept_sftp) => {
                    const sftp = accept_sftp();
                    this.bind_sftp(sftp);
                });
            });
        });

        client.on("error", () => {
            // 客户端异常断开，忽略即可，避免影响其它连接
        });
    }

    /** 校验用户名密码 */
    private check_password(username: string, password: string): boolean {
        if (username !== this.item.sftp_username) {
            return false;
        }
        return password === this.item.sftp_password;
    }

    /** 绑定 SFTP 的全部回调 */
    private bind_sftp(sftp: SFTPWrapper): void {
        const fail = (reqid: number, msg = "failure") => sftp.status(reqid, 4, msg);

        // 打开文件或目录
        sftp.on("OPEN", (reqid: number, filename: string, flags: number, attrs: any) => {
            void (async () => {
                let full: string;
                try {
                    full = this.resolve(filename);
                } catch (e) {
                    return sftp.status(reqid, 3, "permission denied");
                }

                try {
                    const st = await FileUtil.statSync(full).catch(() => null);
                    const is_write = (flags & (0x02 | 0x04 | 0x08 | 0x10)) !== 0;
                    if (is_write && this.item.readonly) {
                        return sftp.status(reqid, 3, "read only");
                    }
                    if (!st) {
                        if (!is_write) {
                            return sftp.status(reqid, 2, "no such file");
                        }
                        // 创建文件
                        await FileUtil.writeFileSync(full, Buffer.alloc(0));
                    } else if (st.isDirectory()) {
                        // 目录用 OPENDIR 打开，这里不应出现
                        return sftp.status(reqid, 4, "is a directory");
                    }
                } catch (e) {
                    return fail(reqid);
                }

                // ssh2 用整数句柄，这里自行分配
                const handle = this.alloc_handle(full);
                sftp.handle(reqid, this.handle_to_buf(handle));
            })();
        });

        sftp.on("CLOSE", (reqid: number, handle: Buffer) => {
            const hid = this.buf_to_handle(handle);
            this.open_files.delete(hid);
            this.dir_cursor.delete(hid);
            sftp.status(reqid, 0);
        });

        sftp.on("READ", (reqid: number, handle: Buffer, offset: number, length: number) => {
            const full = this.open_files.get(this.buf_to_handle(handle));
            if (!full) {
                return sftp.status(reqid, 4, "invalid handle");
            }
            void (async () => {
                try {
                    const fd = await FileUtil.open(full, "r");
                    const buf = Buffer.alloc(length);
                    const {bytesRead} = await fd.read(buf, 0, length, offset);
                    await fd.close();
                    if (bytesRead === 0) {
                        return sftp.status(reqid, 1); // EOF
                    }
                    sftp.data(reqid, buf.subarray(0, bytesRead));
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("WRITE", (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
            if (this.item.readonly) {
                return sftp.status(reqid, 3, "read only");
            }
            const full = this.open_files.get(this.buf_to_handle(handle));
            if (!full) {
                return sftp.status(reqid, 4, "invalid handle");
            }
            void (async () => {
                try {
                    const fd = await FileUtil.open(full, "r+");
                    await fd.write(data, 0, data.length, offset);
                    await fd.close();
                    sftp.status(reqid, 0);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("OPENDIR", (reqid: number, dir_path: string) => {
            let full: string;
            try {
                full = this.resolve(dir_path);
            } catch (e) {
                return sftp.status(reqid, 3, "permission denied");
            }
            void (async () => {
                const st = await FileUtil.statSync(full).catch((e) => {
                    return null;
                });
                if (!st) {
                    return sftp.status(reqid, 2, "no such file");
                }
                if (!st.isDirectory()) {
                    return sftp.status(reqid, 4, "not a directory");
                }
                const handle = this.alloc_handle(full);
                sftp.handle(reqid, this.handle_to_buf(handle));
            })();
        });

        sftp.on("READDIR", (reqid: number, handle: Buffer) => {
            const hid = this.buf_to_handle(handle);
            const full = this.open_files.get(hid);
            if (!full) {
                return sftp.status(reqid, 4, "invalid handle");
            }
            void (async () => {
                try {
                    const names = await FileUtil.readdirSync(full);
                    // SFTP 的 READDIR 是分页的：客户端反复调用直到收到 EOF。
                    // 这里每次返回 remainder，全部返回完后再来一次就回 EOF。
                    const start = this.dir_cursor.get(hid) ?? 0;
                    if (start >= names.length) {
                        return sftp.status(reqid, 1); // EOF
                    }

                    // 一次最多回 100 条，避免单个包过大
                    const batch = names.slice(start, start + 100);
                    this.dir_cursor.set(hid, start + batch.length);

                    const entries: FileEntry[] = [];
                    for (const name of batch) {
                        const child = path_join(full, name);
                        const st = await FileUtil.statSync(child).catch(() => null);
                        if (!st) {
                            continue;
                        }
                        entries.push({
                            filename: name,
                            longname: this.long_name(name, st),
                            attrs: this.to_attrs(st),
                        });
                    }
                    sftp.name(reqid, entries);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("LSTAT", (reqid: number, p: string) => {
            this.stat_impl(sftp, reqid, p);
        });

        sftp.on("STAT", (reqid: number, p: string) => {
            this.stat_impl(sftp, reqid, p);
        });

        sftp.on("FSTAT", (reqid: number, handle: Buffer) => {
            const full = this.open_files.get(this.buf_to_handle(handle));
            if (!full) {
                return sftp.status(reqid, 4, "invalid handle");
            }
            this.stat_impl(sftp, reqid, full);
        });

        sftp.on("MKDIR", (reqid: number, dir_path: string, attrs: any) => {
            if (this.item.readonly) {
                return sftp.status(reqid, 3, "read only");
            }
            void (async () => {
                try {
                    await FileUtil.mkdirSync(this.resolve(dir_path));
                    sftp.status(reqid, 0);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("RMDIR", (reqid: number, dir_path: string) => {
            if (this.item.readonly) {
                return sftp.status(reqid, 3, "read only");
            }
            void (async () => {
                try {
                    await FileUtil.remove_dir(this.resolve(dir_path));
                    sftp.status(reqid, 0);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("REMOVE", (reqid: number, file_path: string) => {
            if (this.item.readonly) {
                return sftp.status(reqid, 3, "read only");
            }
            void (async () => {
                try {
                    await FileUtil.unlinkSync(this.resolve(file_path));
                    sftp.status(reqid, 0);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        sftp.on("RENAME", (reqid: number, old_p: string, new_p: string) => {
            if (this.item.readonly) {
                return sftp.status(reqid, 3, "read only");
            }
            void (async () => {
                try {
                    await FileUtil.renameSync(this.resolve(old_p), this.resolve(new_p));
                    sftp.status(reqid, 0);
                } catch (e) {
                    fail(reqid);
                }
            })();
        });

        const unsupported = (reqid: number) => sftp.status(reqid, 8, "not supported");

        sftp.on("SETSTAT", (reqid: number) => unsupported(reqid));
        sftp.on("FSETSTAT", (reqid: number) => unsupported(reqid));
        sftp.on("READLINK", (reqid: number) => unsupported(reqid));
        sftp.on("SYMLINK", (reqid: number) => unsupported(reqid));
        sftp.on("REALPATH", (reqid: number, p: string) => {
            try {
                const full = this.resolve(p);
                const rel = path.relative(path.resolve(this.item.root_path), full).replace(/\\/g, "/");
                sftp.name(reqid, [{filename: "/" + rel, longname: "/" + rel, attrs: {} as any}]);
            } catch (e) {
                sftp.status(reqid, 3, "permission denied");
            }
        });
        sftp.on("EXTENDED", (reqid: number) => unsupported(reqid));
    }

    /** STAT/LSTAT 共用实现 */
    private stat_impl(sftp: SFTPWrapper, reqid: number, p: string): void {
        void (async () => {
            let full: string;
            try {
                full = this.resolve(p);
            } catch (e) {
                return sftp.status(reqid, 3, "permission denied");
            }
            const st = await FileUtil.statSync(full).catch(() => null);
            if (!st) {
                return sftp.status(reqid, 2, "no such file");
            }
            sftp.attrs(reqid, this.to_attrs(st));
        })();
    }

    /** Node 的 stat 转成 ssh2 的 attrs 结构 */
    private to_attrs(st: any): any {
        return {
            mode: st.mode,
            uid: st.uid,
            gid: st.gid,
            size: st.size,
            atime: Math.floor(st.atimeMs / 1000),
            mtime: Math.floor(st.mtimeMs / 1000),
        };
    }

    /** ls -l 风格的长名称 */
    private long_name(name: string, st: any): string {
        const is_dir = st.isDirectory();
        const perm = is_dir ? "drwxr-xr-x" : "-rw-r--r--";
        const mtime = new Date(st.mtimeMs).toISOString().slice(0, 16).replace("T", " ");
        return `${perm} 1 owner group ${String(st.size).padStart(10)} ${mtime} ${name}`;
    }

    private handle_seq = 1;

    private alloc_handle(full: string): number {
        const h = this.handle_seq++;
        this.open_files.set(h, full);
        return h;
    }

    private handle_to_buf(h: number): Buffer {
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(h, 0);
        return buf;
    }

    private buf_to_handle(buf: Buffer): number {
        if (buf.length < 4) {
            return -1;
        }
        return buf.readUInt32BE(0);
    }
}
