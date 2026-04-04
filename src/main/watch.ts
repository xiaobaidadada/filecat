import {fork, spawn} from 'child_process';
import readline from 'readline';
import * as path from "path"
import {FatherProcessUtil, filecat_cmd} from "../common/node/childProcessUtil";
import {fileCompress} from "./domain/file/file.compress";
import {get_zip_file_format_util} from "../common/StringUtil";
import {FileUtil} from "./domain/file/FileUtil";

let child: any = null;
let restart_timer: any;
let kill_child_ing = false

let lastRestart = 0;

function killChild() {
    if (child && !child.killed) {
        console.log('🛑 正在关闭子进程...');
        child.kill('SIGTERM');
    }
}

let update_ing = false; // 更新中

const upgrade_dir = path.join(__dirname, "upgrade")

export async function startLauncher() {

    const argv = process.argv;
    const isDev = __filename.endsWith('.ts');

    let entry: string;
    let nodePath = process.execPath;
    if (__filename.endsWith("watch.ts")) {
        entry = path.join(__dirname, "server.ts")
    } else if (__filename.endsWith("watch.js")) {
        entry = path.join(__dirname, "server.js")
    } else {
        entry = __filename;
    }


    const childArgs = argv.slice(2);

    async function startServer() {

        const now = Date.now();
        if (now - lastRestart < 1000) return;

        lastRestart = now;


        const upgrade_dir_ok = await FileUtil.find_max_numbered_version_file(upgrade_dir)
        if (upgrade_dir_ok) {
            // 如果升级目录存在的话以后都用这个目录 不用当前目录了 升级并不一定需要替换 第一次安装的永远不替换，这个升级机制不能改
            const entry_p = path.join(upgrade_dir_ok, "main.js");
            const node_path_p  = path.join(upgrade_dir_ok, path.basename(nodePath));
            if(await FileUtil.access_all([entry_p,node_path_p])) {
                entry = entry_p
                nodePath = node_path_p
                if(!isDev) {
                    // 复制main.js到当前 下次重启主进程的时候 父进程也可以用了
                    await FileUtil.copy(entry_p,__filename);
                }
            }
        }

        console.log('🚀 启动子进程...', new Date().toLocaleString());

        const args = [
            entry,
            ...childArgs,
            "--child",
        ];

        // 👉 dev 模式支持 ts-node
        if (isDev) {
            args.unshift("-r", "ts-node/register");
        }

        child = spawn(nodePath, args, {
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV
            }
        });


        child.on('message', async (params: {
            msg: any,
            msg_id: number,
            on_data_msg_id: number,
            data?: any,
        }) => {
            const {data, msg, msg_id} = params;

            try {
                switch (msg) {
                    case filecat_cmd.filecat_restart:
                        console.log('♻️ 子进程请求重启...');
                        killChild(); // 只负责触发 exit
                        return

                    case filecat_cmd.filecat_down:
                        console.log('♻️ 关闭自己...');
                        killChild()
                        process.exit(1);
                        return

                    case filecat_cmd.filecat_upgrade:
                        if (update_ing) break;
                        console.log('⬆️ 开始升级...');
                        kill_child_ing = true;
                        killChild()
                        try {
                            if (data.run_env === "exe") {
                                const format = get_zip_file_format_util(data.file_path)
                                if (!format) {
                                    console.log(`不能识别的文件压缩格式 ${data.file_path}`)
                                    break;
                                }
                                console.log(`开始解压 ${data.file_path}`)
                                await fileCompress.handle_un(format, data.file_path,await FileUtil.get_next_numbered_name(upgrade_dir), () => {
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

            FatherProcessUtil.send(child, { msg_id });
        });

        child.on('exit', (code: number, signal: string) => {
            console.log(`⚠️ 子进程退出：code=${code}, signal=${signal}`);
            restartServer();
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