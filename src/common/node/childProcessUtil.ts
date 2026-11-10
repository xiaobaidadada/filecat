import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import {spawn} from "child_process";
import {isMainThread, parentPort} from "worker_threads";

export enum filecat_cmd  {
    filecat_restart = "filecat-restart",
    filecat_upgrade = "filecat-upgrade",
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

/**
 * 是否运行在 worker 线程里。
 *
 * 守护进程和业务服务原来是「父进程 + spawn 子进程」，
 * 现在改成「主线程 + worker 线程」，两套 IPC 接口不一样：
 * - 子进程：process.send / process.on("message")
 * - worker：parentPort.postMessage / parentPort.on("message")
 * 这里统一封装，业务代码不用关心自己跑在哪种模式。
 */
const in_worker = !isMainThread && !!parentPort;

/** 向父进程（主线程）发消息，兼容子进程和 worker 两种模式 */
export function send_to_parent(msg: any) {
    if (in_worker) {
        parentPort!.postMessage(msg);
    } else if (process.send) {
        process.send(msg);
    }
}

/** 收到父进程（主线程）消息的回调注册，兼容子进程和 worker 两种模式 */
export function on_parent_message(handler: (msg: any) => void) {
    if (in_worker) {
        parentPort!.on("message", handler);
    } else {
        process.on("message", handler);
    }
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
on_parent_message((msg: any) => {
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
            send_to_parent({
                msg,
                msg_id,
                on_data_msg_id,
                data:data
            });
        })
        delete  on_msg_id_map[on_data_msg_id]
        return a
    }


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
