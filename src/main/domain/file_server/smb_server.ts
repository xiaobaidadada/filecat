import * as path from "path";
import {ChildProcess, spawn} from "child_process";
import {FileServerItem} from "./file_server.pojo";

/**
 * SMB 文件服务。
 *
 * 基于自维护的 node-libsmb2 绑定（libsmb2 的 server API）。
 *
 * 必须跑在独立子进程里：libsmb2 用全局链表 active_contexts 管理所有 context，
 * 客户端和服务端同进程时，服务的 select 循环会误处理客户端的 context，
 * 表现为「No io vectors left to read into」或直接断连。
 *
 * 子进程脚本以 `node -e` 方式内联传入，避免构建时还要额外拷贝文件。
 */
export class SmbServer {

    private child?: ChildProcess;
    private running = false;

    constructor(private item: FileServerItem) {}

    async start(): Promise<void> {
        const port = String(this.item.port);
        const root = path.resolve(this.item.root_path);
        const readonly = this.item.readonly ? "1" : "0";
        const hostname = this.item.smb_hostname || "filecat";

        const child = spawn(process.execPath, ["-e", CHILD_SCRIPT], {
            env: {
                ...process.env,
                SMB_PORT: port,
                SMB_ROOT: root,
                SMB_READONLY: readonly,
                SMB_HOSTNAME: hostname,
            },
            stdio: ["ignore", "inherit", "inherit", "ipc"],
        });
        this.child = child;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error("SMB 服务启动超时"));
                }
            }, 15000);

            child.on("message", (msg: any) => {
                if (msg && msg.type === "ready" && !settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.running = true;
                    resolve();
                }
            });
            child.on("exit", (code) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`SMB 子进程退出，code=${code}`));
                } else {
                    this.running = false;
                }
            });
            child.on("error", (e) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(e);
                }
            });
        });
    }

    async stop(): Promise<void> {
        const child = this.child;
        if (!child) {
            return;
        }
        this.child = undefined;

        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) {
                    return;
                }
                done = true;
                resolve();
            };
            child.once("exit", finish);
            try {
                child.send({type: "stop"});
            } catch (e) {
                // IPC 已断开
            }
            setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                } catch (e) {
                    // 已退出
                }
                finish();
            }, 3000);
        });

        this.running = false;
    }

    is_running(): boolean {
        return this.running;
    }
}

/** 子进程脚本：只负责把 SMB 服务拉起来并报告就绪 */
const CHILD_SCRIPT = `
const port = Number(process.env.SMB_PORT);
const root = process.env.SMB_ROOT;
const readonly = process.env.SMB_READONLY === "1";
const hostname = process.env.SMB_HOSTNAME || "filecat";
if (!port || !root) {
    console.error("[smb-child] 缺少 SMB_PORT / SMB_ROOT");
    process.exit(1);
}
const { Smb2Server } = require("node-libsmb2");
const server = new Smb2Server();
server.start({ port, root, readonly, name: hostname });
process.send && process.send({ type: "ready", port });
process.on("message", (msg) => {
    if (msg && msg.type === "stop") {
        try { server.stop(); } catch (e) {}
        process.exit(0);
    }
});
process.on("uncaughtException", (e) => {
    console.error("[smb-child] 未捕获异常:", e.message);
    process.exit(1);
});
process.on("disconnect", () => process.exit(0));
`;
