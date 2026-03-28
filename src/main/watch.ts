import {fork} from 'child_process';
import readline from 'readline';
import * as path from "path"
import {FatherProcessUtil, filecat_cmd, node_process_cmd} from "../common/node/childProcessUtil";
import {fileCompress} from "./domain/file/file.compress";
import {file_select_list} from "../common/file.pojo";
import {get_zip_file_format_util} from "../common/StringUtil";

let child: any = null;
let last = 0;
let running = false;

function killChild() {
    if (child && !child.killed) {
        console.log('🛑 正在关闭子进程...');
        child.kill('SIGTERM');
    }
}

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
        const close_child = ()=>{
            if(child) {
                child.kill('SIGTERM');
                console.log('关闭子进程')
            }
        }
        child.on('message', async (params: {
            msg:any,
            msg_id: number,
            on_data_msg_id: number,
            data?: any,
        }) => {
            const {data,msg,msg_id,on_data_msg_id} = params;
            try {
                switch (msg) {
                    case filecat_cmd.filecat_restart:
                        console.log('♻️ 子进程请求重启...');
                        restartServer();
                        break;
                    case filecat_cmd.filecat_down:
                        console.log('♻️ 关闭自己...');
                        close_child()
                        process.exit(1);
                        break;
                    case filecat_cmd.filecat_upgrade:
                        if(data.run_env === "exe") {
                            const format = get_zip_file_format_util(data.file_path)
                            if (!format) {
                                console.log(`不能识别的文件压缩格式  ${data.file_path}`)
                                return
                            }
                            console.log(`开始解压 ${data.file_path}`)
                            close_child()
                            try {
                                await fileCompress.handle_un(format,data.file_path,__dirname,()=>{} )
                            } catch (e) {
                                console.log(e)
                            }
                            console.log(  `解压完成 `)
                        } else if(data.run_env === "npm") {
                            close_child()
                            try {
                                await FatherProcessUtil.npmGlobalInstall("filecat",data.paths,data.registry)
                            }catch(e){
                                console.log(e)
                            }
                            console.log('npm 更新完成')
                        }
                        console.log(  `升级完成 开始重启`)
                        restartServer();
                        break;

                }
            } catch (e) {
                console.error(e);
            }
            FatherProcessUtil.send(child,{msg_id});
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

    // // 键盘监听
    // readline.emitKeypressEvents(process.stdin);
    // if (process.stdin.isTTY) process.stdin.setRawMode(true);
    //
    // process.stdin.on('keypress', (str, key) => {
    //     if (key.ctrl && key.name === 'r') {
    //         restartServer();
    //     }
    //
    //     if (key.ctrl && key.name === 'c') {
    //         console.log('\n🛑 主进程退出');
    //         if (child) child.kill('SIGTERM');
    //         process.exit(0);
    //     }
    // });
}

process.on('exit', () => {
    killChild();
});

process.on('SIGINT', () => {
    // Ctrl + C
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ 未捕获异常:', err);
    // process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Promise异常:', err);
    // process.exit(1);
});