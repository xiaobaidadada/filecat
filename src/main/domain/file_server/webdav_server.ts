import {FileServerItem} from "./file_server.pojo";

// webdav-server 无类型定义，按项目约定用 any
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webdav_lib = require("webdav-server");

/**
 * WebDAV 文件服务。
 *
 * 基于 webdav-server。共享模型：每条共享挂到 WebDAV 的一个路径 /<name>，
 * 根目录用虚拟文件系统动态列出全部共享名，客户端挂一次根就能看到所有共享。
 * 鉴权走 HTTP Basic，服务级单一账号，可访问全部共享。
 *
 * 注意：webdav-server 没有类型定义，按项目约定用 any 并通过 get_bin_dependency 加载。
 */
export class WebdavServer {

    private server?: any;
    private running = false;

    constructor(private item: FileServerItem) {}

    /** 启动监听 */
    async start(): Promise<void> {
        const v2 = webdav_lib.v2;

        // 只允许配置里这一个账号登录
        const user_manager = new v2.SimpleUserManager();
        const user = user_manager.addUser(
            this.item.webdav?.username ?? "",
            this.item.webdav?.password ?? "",
            false,
        );

        const privilege_manager = new v2.SimplePathPrivilegeManager();
        privilege_manager.setRights(user, "/", ["all"]);

        const webdav_server = new v2.WebDAVServer({
            httpAuthentication: new v2.HTTPBasicAuthentication(user_manager, "filecat"),
            privilegeManager: privilege_manager,
        });

        const shares = this.item.webdav?.shares ?? [];

        // 根路径：虚拟文件系统，只为把共享路径列表暴露出去
        const root_fs = create_root_file_system(v2, shares.map((s) => s.url_path));
        await webdav_server.setFileSystemAsync("/", root_fs);

        // 每条共享挂到 /<url_path>，指向各自的目录
        for (const share of shares) {
            await webdav_server.setFileSystemAsync(
                "/" + share.url_path,
                new v2.PhysicalFileSystem(share.path),
            );
        }

        if (this.item.readonly) {
            this.apply_readonly(webdav_server);
        }

        this.server = await webdav_server.startAsync(this.item.port);
        this.running = true;
    }

    /** 停止监听 */
    async stop(): Promise<void> {
        if (!this.server) {
            return;
        }
        const srv = this.server;
        this.server = undefined;
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
            // 兜底：连接的 keep-alive 会让 close 挂住
            setTimeout(finish, 3000);
        });
        this.running = false;
    }

    is_running(): boolean {
        return this.running;
    }

    /** 只读：把写方法全部拒绝 */
    private apply_readonly(server: any): void {
        const write_methods = ["PUT", "DELETE", "MKCOL", "PROPPATCH", "MOVE", "COPY", "LOCK"];
        for (const m of write_methods) {
            server.method(m, (ctx: any, next: any) => {
                ctx.setCode(403);
                next();
            });
        }
    }
}

/**
 * 根文件系统：在 / 下动态列出全部共享名。
 *
 * 继承 VirtualFileSystem 只为拿到一套默认实现，避免实现整个 FileSystem 接口；
 * 实际的资源共享由 server 挂到 /<name> 下的 PhysicalFileSystem 提供，
 * 这里的只负责「根目录长什么样」。
 */
function create_root_file_system(v2: any, names: string[]): any {
    class RootFileSystem extends v2.VirtualFileSystem {
        constructor() {
            super(v2.VirtualSerializer);
        }

        _readDir(ctx: any, path: any, callback: any): void {
            const p = path.toString();
            if (p === "/" || p === "") {
                return callback(null, names);
            }
            super._readDir(ctx, path, callback);
        }

        _type(ctx: any, path: any, callback: any): void {
            const p = path.toString();
            if (p === "/" || p === "") {
                return callback(null, v2.ResourceType.Directory);
            }
            super._type(ctx, path, callback);
        }
    }

    return new RootFileSystem();
}
