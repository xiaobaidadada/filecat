import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import {spawn} from "child_process";

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
        return new Promise((resolve, reject) => {
            const client = url.startsWith("https") ? https : http;

            fs.mkdirSync(dirPath, { recursive: true });

            const urlObj = new URL(url);

            client.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`下载失败: ${res.statusCode}`));
                    return;
                }

                let fileName = "";

                // ==============================
                // 1️⃣ Content-Disposition 优先
                // ==============================
                const disposition = res.headers["content-disposition"];
                if (disposition) {
                    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
                    if (match?.[1]) {
                        fileName = decodeURIComponent(match[1]);
                    }
                }

                // ==============================
                // 2️⃣ URL ?file=xxx（你这个场景关键）
                // ==============================
                if (!fileName) {
                    const fileParam = urlObj.searchParams.get("file");
                    if (fileParam) {
                        fileName = path.basename(fileParam);
                    }
                }

                // ==============================
                // 3️⃣ pathname 兜底
                // ==============================
                if (!fileName) {
                    fileName = path.basename(urlObj.pathname);
                }

                // ==============================
                // 4️⃣ fallback
                // ==============================
                if (!fileName || fileName === "/") {
                    fileName = `download_${Date.now()}`;
                }

                const filePath = path.resolve(dirPath, fileName);
                const fileStream = fs.createWriteStream(filePath);

                const total = Number(res.headers["content-length"] || 0);
                let downloaded = 0;

                res.on("data", (chunk) => {
                    downloaded += chunk.length;

                    const ok = fileStream.write(chunk);
                    if (!ok) {
                        res.pause();
                        fileStream.once("drain", () => res.resume());
                    }

                    if (total) {
                        const percent = Math.round((downloaded / total) * 100);
                        on_progress(percent);
                    } else {
                        on_progress(0);
                    }
                });

                res.on("end", () => {
                    fileStream.end();
                });

                fileStream.on("finish", () => {
                    on_progress(100);
                    resolve(filePath); // ⭐ 返回绝对路径
                });

                res.on("error", (err) => {
                    fileStream.destroy();
                    reject(err);
                });

                fileStream.on("error", (err) => {
                    res.destroy();
                    reject(err);
                });
            }).on("error", (err) => {
                reject(err);
            });
        });
    }


}