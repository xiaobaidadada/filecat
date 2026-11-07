import {FileServerItem} from "./file_server.pojo";

// webdav-server 无类型定义，按项目约定用 any
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webdav_lib = require("webdav-server");

/**
 * WebDAV 文件服务。
 *
 * 基于 webdav-server 的 PhysicalFileSystem，直接把 root_path 暴露成一个
 * WebDAV 资源。鉴权走 HTTP Basic，只读模式通过 PrivilegeManager 拒绝写方法。
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
            this.item.webdav_username ?? "",
            this.item.webdav_password ?? "",
            false,
        );

        const privilege_manager = new v2.SimplePathPrivilegeManager();
        privilege_manager.setRights(user, "/", ["all"]);

        const webdav_server = new v2.WebDAVServer({
            httpAuthentication: new v2.HTTPBasicAuthentication(user_manager, "filecat"),
            privilegeManager: privilege_manager,
        });

        // 把真实的 root_path 挂到 WebDAV 的根路径
        await webdav_server.setFileSystemAsync("/", new v2.PhysicalFileSystem(this.item.root_path));

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
