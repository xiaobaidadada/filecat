import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import {spawn} from "child_process";
import needle from "needle";
import {FileUtil} from "../../main/domain/file/FileUtil";

export enum filecat_cmd  {
    filecat_restart = "filecat-restart",
    filecat_upgrade = "filecat-upgrade",
    filecat_down = "filecat-down",
}

export enum node_process_cmd  {
    npm_update = "npm_update"
}

export class FatherProcessUtil {

    public static send(child,params:{
        msg?:node_process_cmd,
        msg_id?:any,
        on_data_msg_id?:any,
    }) {
        if (!child) return;
        if (child.killed) return;
        if (!child.send) return;
        try {
            child.send(params);
        } catch (e) {
            console.warn('IPC 已关闭，忽略消息');
        }

    }

    public static  npmGlobalInstall(
        pkgName: string,
        PATH,
        registry?: string,
        onLog?: (msg: string, type: "stdout" | "stderr") => void
    ): Promise<void> {
        if(!onLog) {
            onLog = console.log
        }
        return new Promise((resolve, reject) => {
            const args: string[] = ["i", "-g", pkgName];

            if (registry) {
                args.push(`--registry=${registry}`);
            }
            const isWin = process.platform === "win32";
            const npm = isWin ? "npm.cmd" : "npm";
            console.log(  `全局安装 ${npm} ${JSON.stringify(args)}`)
            const child = spawn(npm, args, {
                stdio: ["ignore", "pipe", "pipe"],
                shell: process.platform === "win32",
                env:{
                    ...process.env,
                    PATH
                }
            });

            // =========================
            // stdout（正常日志）
            // =========================
            child.stdout.on("data", (chunk) => {
                const msg = chunk.toString();
                onLog?.(msg, "stdout");
            });

            // =========================
            // stderr（错误/警告）
            // =========================
            child.stderr.on("data", (chunk) => {
                const msg = chunk.toString();
                onLog?.(msg, "stderr");
            });

            // =========================
            // 结束
            // =========================
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`npm install failed with code ${code}`));
                }
            });

            child.on("error", (err) => {
                reject(err);
            });
        });
    }

}

const child_resolve = {}
const on_msg_id_map = {}
process.on('message', (msg:any) => {
    console.log('收到父进程消息:', msg);
    if(on_msg_id_map[msg.msg_id]) {
        on_msg_id_map[msg.msg_id](msg.data)
    }
    if(child_resolve[msg.msg_id]) {
        child_resolve[msg.msg_id](msg.data)
        delete child_resolve[msg.msg_id];
    }
});

export class ChildProcessUtil {

    static msg_id = 1;

    public static async send_father(msg:any,data?:any,on_data?:(data)=>void) {
        this.msg_id ++;
        if(this.msg_id > 100000) {
            this.msg_id = 1
        }
        const msg_id = this.msg_id
        this.msg_id++;
        const on_data_msg_id = this.msg_id;
        if(on_data) {
            on_msg_id_map[on_data_msg_id] = on_data
        }
        const a = await new Promise(resolve => {
            child_resolve[msg_id] = resolve
            process.send?.({
                msg,
                msg_id,
                on_data_msg_id,
                data:data
            });
        })
        delete  on_msg_id_map[on_data_msg_id]
        return a
    }


    public static down_load_file(
        url: string,
        dirPath: string,
        on_progress: (value: number) => void
    ): Promise<string> {

        return new Promise(async (resolve, reject) => {
            try {

                await FileUtil.mkdirSync(dirPath, { recursive: true })

                const urlObj = new URL(url);

                const stream = needle.get(url, {
                    follow_max: 5,
                    headers: {
                        "User-Agent": "node",
                        "Accept": "*/*"
                    }
                });

                let fileName = "";
                let total = 0;
                let downloaded = 0;
                let lastPercent = -1;

                let filePath = "";
                let fileStream: fs.WriteStream | null = null;

                // ==============================
                // ❌ 统一清理函数
                // ==============================
                const cleanup = (err: any) => {
                    if (fileStream) fileStream.destroy();

                    if (filePath && fs.existsSync(filePath)) {
                        try {
                            fs.unlinkSync(filePath);
                        } catch {}
                    }

                    reject(err);
                };

                // ==============================
                // 📦 响应开始
                // ==============================
                stream.on("response", (res) => {

                    // ❌ HTTP 错误
                    if (res.statusCode && res.statusCode >= 400) {
                        cleanup(new Error(`下载失败: ${res.statusCode}`));
                        stream.destroy();
                        return;
                    }

                    // 👉 文件名解析
                    const disposition = res.headers["content-disposition"];
                    if (disposition) {
                        const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
                        if (match?.[1]) {
                            fileName = decodeURIComponent(match[1]);
                        }
                    }

                    if (!fileName) {
                        fileName = path.basename(urlObj.pathname);
                    }

                    if (!fileName || fileName === "/") {
                        fileName = `download_${Date.now()}`;
                    }

                    filePath = path.resolve(dirPath, fileName);

                    // ✅ 在 response 后创建（关键）
                    fileStream = fs.createWriteStream(filePath);

                    fileStream.on("error", cleanup);

                    // ✅ 在这里 pipe（关键）
                    stream.pipe(fileStream);

                    total = Number(res.headers["content-length"] || 0);
                });

                // ==============================
                // 📊 进度
                // ==============================
                stream.on("data", (chunk) => {
                    downloaded += chunk.length;

                    if (total > 0) {
                        const percent = Math.floor((downloaded / total) * 100);

                        if (percent !== lastPercent) {
                            lastPercent = percent;
                            on_progress(percent);
                        }
                    }
                });

                // ==============================
                // ✅ 完成
                // ==============================
                stream.on("end", () => {
                    if (fileStream) {
                        fileStream.end();
                    }
                });

                if (fileStream) {
                    fileStream.on("finish", () => {
                        on_progress(100);
                        resolve(filePath);
                    });
                } else {
                    // ⚠️ 防止极端情况
                    stream.on("close", () => {
                        if (filePath) {
                            on_progress(100);
                            resolve(filePath);
                        }
                    });
                }

                // ==============================
                // ❌ 错误处理
                // ==============================
                stream.on("error", cleanup);
            } catch (e) {
                reject(e);
            }
        });
    }


}