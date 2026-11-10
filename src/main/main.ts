import {Worker} from 'worker_threads';
import * as path from "path"
import * as fs from "fs"
import {FatherProcessUtil, filecat_cmd} from "../common/node/childProcessUtil";

/**
 * 守护进程（父进程）入口，打包产物是体积很小的 main.js。
 *
 * 这里刻意只依赖 node 内置模块和 childProcessUtil，
 * 绝不 import 项目业务模块（FileUtil 会牵连整个文件模块树），
 * 否则 webpack 会把整个项目打进 main.js，内存和启动时间都会暴涨。
 */

/** 判断单个路径是否存在 */
async function fs_access(p: string): Promise<boolean> {
    try {
        await fs.promises.access(p, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/** 判断多个路径是否全部存在 */
async function access_all(paths: string[]): Promise<boolean> {
    let num = 0;
    for (const p of paths) {
        if (await fs_access(p)) num++;
    }
    return num === paths.length;
}

/** 复制单个文件 */
async function copy_file(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(dest), {recursive: true});
    await fs.promises.copyFile(src, dest);
}

/** 从目录列表里找「base + 纯数字后缀」的最大数字，找不到返回 -1，base 本身算 0 */
async function max_numbered_suffix(dir: string, base: string): Promise<number> {
    const files = await fs.promises.readdir(dir);
    let max = -1;
    for (const f of files) {
        if (!f.startsWith(base)) continue;
        const suffix = f.slice(base.length);
        if (suffix.length === 0) {
            if (max < 0) max = 0;
            continue;
        }
        // 必须全是数字才算版本文件
        let num = 0;
        let ok = true;
        for (const c of suffix) {
            if (c >= '0' && c <= '9') {
                num = num * 10 + (c.charCodeAt(0) - 48);
            } else {
                ok = false;
                break;
            }
        }
        if (ok && num > max) max = num;
    }
    return max;
}

/**
 * 在目录里找「同名带数字后缀」的最大版本文件。
 * base=worker.js，目录有 worker.js、worker.js1、worker.js2 → 返回 worker.js2 的完整路径。
 * 找不到返回 null。
 */
async function find_max_numbered_version_file(file_path: string): Promise<string | null> {
    const dir = path.dirname(file_path);
    const base = path.basename(file_path);
    if (!await fs_access(dir)) return null;

    const max = await max_numbered_suffix(dir, base);
    if (max < 0) return null;
    if (max === 0) return path.join(dir, base);
    return path.join(dir, base + max);
}

/** 获取一个不重名的带数字后缀的路径，base 已存在则返回 base1、base2 …… */
async function get_next_numbered_name(file_path: string): Promise<string> {
    const dir = path.dirname(file_path);
    const base = path.basename(file_path);
    if (!await fs_access(dir)) return file_path;
    if (!await fs_access(path.join(dir, base))) return path.join(dir, base);

    const max = await max_numbered_suffix(dir, base);
    return path.join(dir, base + (max + 1));
}

let worker: Worker | null = null;
let restart_timer: any;
let kill_child_ing = false

let lastRestart = 0;

/**
 * 关闭业务 worker。
 *
 * 以前是 child.kill('SIGTERM')，worker 没有信号概念，
 * 用 terminate() 结束线程（内部等价于强制结束）。
 */
function killChild() {
    if (worker) {
        console.log('🛑 stop worker...');
        const w = worker;
        worker = null;
        w.terminate().catch((e) => {
            console.error('stop worker 失败:', e);
        });
    }
}

let update_ing = false; // 更新中

const upgrade_dir = path.join(__dirname, "upgrade")

// 一次性命令：不需要走守护进程，直接在当前进程跑业务
const oneShotFlags = [
    '--install',
    '--uninstall',
    '--stop', '--restart',
    '--version',
    '--update',
    '--help',
    '--', // compatible with all cases
];
const is_one_shot = oneShotFlags.some(flag => process.argv.includes(flag));

async function start() {

    const isDev = __filename.endsWith('.ts');

    // worker 线程入口：dev 用 work_main.ts，打包后用 worker.js
    let entry: string;
    if (isDev) {
        entry = path.join(__dirname, "work_main.ts")
    } else {
        entry = path.join(__dirname, "main_worker.js")
    }

    /**
     * 一次性命令（--install / --version 等）直接用 worker 跑业务入口，
     * 执行完就退出。不走常驻的守护循环。
     */
    if (is_one_shot) {
        const w = new Worker(entry, {
            execArgv: isDev ? ["-r", "ts-node/register"] : [],
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV
            }
        });
        w.on('error', (err) => {
            console.error('❌ 命令执行失败:', err);
            process.exit(1);
        });
        w.on('exit', (code) => {
            process.exit(code);
        });
        return;
    }

    async function startServer() {

        const now = Date.now();
        if (now - lastRestart < 1000) return;

        lastRestart = now;


        const upgrade_dir_ok = await find_max_numbered_version_file(upgrade_dir)
        if (upgrade_dir_ok) {
            // 如果升级目录存在的话以后都用这个目录 不用当前目录了 升级并不一定需要替换 第一次安装的永远不替换，这个升级机制不能改
            const entry_p = path.join(upgrade_dir_ok, "main_work.js");
            if (await access_all([entry_p])) {
                entry = entry_p
                if (!isDev) {
                    // 复制 main.js（守护进程）到当前，下次重启主进程的时候父进程也可以用了
                    const parent_p = path.join(upgrade_dir_ok, "main.js");
                    if (await access_all([parent_p])) {
                        await copy_file(parent_p, __filename);
                    }
                }
            }
        }

        console.log('🚀 start worker...', new Date().toLocaleString());

        worker = new Worker(entry, {
            // dev 模式下 worker 入口是 .ts，需要 ts-node 注册钩子
            execArgv: isDev ? ["-r", "ts-node/register"] : [],
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV
            }
        });


        worker.on('message', async (params: {
            msg: any,
            msg_id: number,
            on_data_msg_id: number,
            data?: any,
        }) => {
            const {data, msg, msg_id} = params;

            try {
                switch (msg) {
                    case filecat_cmd.filecat_restart:
                        console.log('♻️ worker 请求重启...');
                        killChild(); // 只负责触发 exit
                        return

                    case filecat_cmd.filecat_down:
                        console.log('♻️ 关闭自己...');
                        process.exit(1);
                        return

                    case filecat_cmd.filecat_upgrade:
                        if (update_ing) break;
                        console.log('⬆️ 开始升级...');
                        kill_child_ing = true;
                        killChild()
                        try {
                            if (data.run_env === "exe") {
                                // 延迟 require：升级解压才会用到，避免把文件模块打进守护进程包
                                let {fileCompress} = require("./domain/file/file.compress")
                                let {get_zip_file_format_util} = require("../common/StringUtil")
                                const format = get_zip_file_format_util(data.file_path)
                                if (!format) {
                                    console.log(`不能识别的文件压缩格式 ${data.file_path}`)
                                    break;
                                }
                                console.log(`开始解压 ${data.file_path}`)
                                await fileCompress.handle_un(format, data.file_path,await get_next_numbered_name(upgrade_dir), () => {
                                })
                                console.log(`解压完成`)
                            } else if (data.run_env === "npm") {
                                await FatherProcessUtil.npmGlobalInstall("filecat", data.paths, data.registry)
                                console.log('npm 更新完成')
                            }

                            console.log(`升级完成，准备重启`);
                        } catch (e) {
                            console.error('升级失败:', e);
                        } finally {
                            kill_child_ing = false;
                            update_ing = false;
                            restartServer();
                        }
                        break;
                }
            } catch (e) {
                console.error(e);
            }

            // 回复 worker：这条消息处理完了
            if (worker) {
                worker.postMessage({msg_id});
            }
        });

        worker.on('exit', (code: number) => {
            console.log(`⚠️ worker 退出：code=${code}`);
            restartServer();
        });

        worker.on('error', (err) => {
            console.error('❌ worker 异常:', err);
        });
    }

    function restartServer(timeout = 2000) {
        if (kill_child_ing) return;
        clearTimeout(restart_timer)
        restart_timer = setTimeout(() => {
            startServer();
        }, timeout);
    }

    // 启动
    startServer();
}

// ====== 进程生命周期 ======

process.on('exit', () => {
    killChild();
});

process.on('SIGINT', () => {
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ 未捕获异常:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Promise异常:', err);
});

start();
