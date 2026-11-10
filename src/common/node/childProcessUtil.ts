import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import {spawn} from "child_process";

export enum filecat_cmd  {
    filecat_down = "filecat-down",
    ai = "ai",
    filecat_act_start = "filecat-act-start",
    filecat_act_restart = "filecat-act-restart",
    filecat_act_stop = "filecat-act-stop",
    filecat_act_status = "filecat-act-status",
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


export class ChildProcessUtil {

    static msg_id = 1;


    public static async down_load_file(
        url: string,
        dirPath: string,
        on_progress: (value: number) => void
    ): Promise<string> {
        // 延迟 require：http 模块依赖 axios/https-proxy-agent，只有升级下载才用得到
        const {HttpRequest} = require("./http");
        // 统一使用 HttpRequest 下载（自动走 filecat 系统 http 代理）
        return HttpRequest.download_file(url, dirPath, on_progress);
    }


}
