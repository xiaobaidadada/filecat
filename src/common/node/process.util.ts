import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import {spawn} from "child_process";
import {settingService} from "../../main/domain/setting/setting.service";

export enum filecat_cmd  {
    filecat_restart = "filecat-restart",
    filecat_upgrade = "filecat-upgrade",
    filecat_down = "filecat-down",
}

export class ProcessUtil {
    public static requestRestart() {
        process.send?.({
            msg:filecat_cmd.filecat_restart
        });
    }

    public static kill_self() {
        process.send?.({
            msg:filecat_cmd.filecat_down
        });
    }

    public static  requestUpgrade(run_env,file_path?:string) {
        process.send?.({
            msg:filecat_cmd.filecat_upgrade,
            file_path,
            run_env
        });
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


    public static  npmGlobalInstall(
        pkgName: string,
        registry?: string,
        onLog?: (msg: string, type: "stdout" | "stderr") => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const args: string[] = ["i", "-g", pkgName];

            if (registry) {
                args.push(`--registry=${registry}`);
            }
            const isWin = process.platform === "win32";
            const npm = isWin ? "npm.cmd" : "npm";
            const child = spawn(npm, args, {
                stdio: ["ignore", "pipe", "pipe"],
                shell: process.platform === "win32",
                env:{
                    ...process.env,
                    PATH: settingService.get_env_path()
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