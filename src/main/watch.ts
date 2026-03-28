import {fork} from 'child_process';
import readline from 'readline';
import * as path from "path"
import {filecat_cmd} from "../common/node/process.util";
import {fileCompress} from "./domain/file/file.compress";
import {file_select_list} from "../common/file.pojo";
import {get_zip_file_format_util} from "../common/StringUtil";

let child: any = null;
let last = 0;
let running = false;

export function startLauncher() {
    const argv = process.argv;
    const isDev = __filename.endsWith('.ts');
    let p: string;
    if (__filename.endsWith("watch.ts")) {
        p = path.join(__dirname, "server.ts")
    } else if (__filename.endsWith("watch.js")) {
        p = path.join(__dirname, "server.js")
    } else {
        p = __filename;
    }
    const childArgs = argv.slice(2);

    function startServer() {
        if (running === true && Date.now() - last <= 3000) {
            console.log(`${last} server started`);
            return;
        }

        last = Date.now();
        running = true;

        console.log('🚀 启动子进程...', new Date().toLocaleString());

        child = fork(
            p, // 🔥 关键：不再是 server.ts / main.js
            [...childArgs, '--child'],
            {
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                execArgv: isDev ? ['-r', 'ts-node/register'] : [],
                env: {...process.env}
            }
        );

        child.on('message', async (msg: any) => {
            switch (msg.msg) {
                case filecat_cmd.filecat_restart:
                    console.log('♻️ 子进程请求重启...');
                    restartServer();
                    break;
                case filecat_cmd.filecat_down:
                    console.log('♻️ 关闭自己...');
                    if(child) {
                        child.kill('SIGTERM');
                    }
                    process.exit(1);
                    break;
                case filecat_cmd.filecat_upgrade:
                    if(msg.run_env === "exe") {
                        const format = get_zip_file_format_util(msg.file_path)
                        if (!format) {
                            console.log(`不能识别的文件压缩格式  ${msg.file_path}`)
                            return
                        }
                        console.log(`开始解压 ${msg.file_path}`)
                        await fileCompress.handle_un(format,msg.file_path,__dirname,()=>{} )
                        console.log(  `解压完成 `)
                    }
                    if(child) {
                        child.kill('SIGTERM');
                    }
                    console.log(  `升级完成 开始重启`)
                    restartServer();
                    break;

            }
        });

        child.on('exit', (code: number, signal: string) => {
            console.log(`⚠️ 子进程退出：code=${code}, signal=${signal}`);
            restartServer();
        });
    }

    function restartServer() {
        running = false;
        if (child) {
            console.log('♻️ 正在重启子进程...');
            child.kill('SIGTERM');
            setTimeout(() => startServer(), 1000 * 5);
        } else {
            startServer();
        }
    }


    // 启动
    startServer();

    // 键盘监听
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'r') {
            restartServer();
        }

        if (key.ctrl && key.name === 'c') {
            console.log('\n🛑 主进程退出');
            if (child) child.kill('SIGTERM');
            process.exit(0);
        }
    });
}