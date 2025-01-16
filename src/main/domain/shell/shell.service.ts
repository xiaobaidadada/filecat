import {CmdType, WsData} from "../../../common/frame/WsData";
import os from "os";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import path from "path";
// import {config} from "../../other/config";
// import * as inspector from "node:inspector";
import {SystemUtil} from "../sys/sys.utl";
import {Env} from "../../../common/Env";
import {ShellInitPojo} from "../../../common/req/ssh.pojo";
import {settingService} from "../setting/setting.service";
import {SysEnum} from "../../../common/req/user.req";
import {exec_type, PtyShell} from "./PtyShell";
import {userService} from "../user/user.service";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {data_common_key, data_dir_tem_name} from "../data/data_type";

const {spawn, exec} = require('child_process');
export const sysType = os.platform() === 'win32' ? "win" : "linux";
let cr = '\r'; // xterm.js 按下 enter 是这个值

export function getSys() {
    if (sysType === "win") {
        return SysEnum.win
    } else if (sysType === "linux") {
        return SysEnum.linux
    } else {
        return;
    }
}

function getSysShell() {
    if (sysType === 'win') {
        if (SystemUtil.commandIsExist("pwsh")) {
            return "pwsh.exe";
        } else if (SystemUtil.commandIsExist("powershell")) {
            return "powershell.exe";
        } else if (SystemUtil.commandIsExist("cmd")) {
            return "cmd.exe";
        }
        cr = '\n';
    } else {
        if (SystemUtil.commandIsExist("bash")) {
            return "bash";
        } else if (SystemUtil.commandIsExist("sh")) {
            return "sh";
        }
    }
}

let shell: string | null = null;

export function getShell() {
    if (!shell) {
        shell = getSysShell()!
    }
    return shell;
}

// const pty:any = shell === 'powershell.exe'?require('../../../../local_node_modules/windows/node-pty'):require('../../../../local_node_modules/linux/node-pty');
const pty: any = require("@xiaobaidadada/node-pty-prebuilt")


const socketMap: Map<string, any> = new Map();

let line = "";

let prompt = `${process.env.USER ?? process.env.USERNAME}>`;

const shell_list = ['bash', 'sh', 'cmd.exe', 'pwsh.exe', 'powershell.exe','vim','nano','cat','tail']; // 一些必须用 node_pty 执行的 powershell 不行 必须得 powershell.exe
// ANSI 转义序列，设置绿色、蓝色、重置颜色
const green = '\x1b[32m';  // 绿色
const blue = '\x1b[34m';   // 蓝色
const reset = '\x1b[0m';   // 重置颜色

export class ShellService {

    async open(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        // 要传递的环境变量
        const PATH = process.env.PATH +(sysType === "win" ? ";" : ":")  + settingService.get_env_list();
        const pojo = data.context as ShellInitPojo;
        if(pojo.init_path) pojo.init_path = decodeURIComponent(pojo.init_path);
        const sysPath = path.join(settingService.getFileRootPath(pojo.http_token), (pojo.init_path !== null && pojo.init_path !== "null") ? pojo.init_path : "");
        const user_data = userService.get_user_info_by_token((data.wss as Wss).token);
        const ptyProcess = new PtyShell({
            cols: pojo.cols,
            rows: pojo.rows,
            cwd: sysPath,
            node_pty:pty,
            env:{PATH},
            // prompt_call:()=>{
            //     re
            // },
            node_pty_shell_list:shell_list,
            prompt_call:(cwd)=>{
                // 输出格式化的命令提示符
                const p = path.basename(cwd);
                const c = `${green}${user_data.username}${reset}:${blue}${p}${reset}:# `;
                const len = PtyShell.get_full_char_num(`${user_data.username}:${p}:# `); // 计算纯字符
                return {str:c,char_num:len};
            },
            on_call:(cmdData) => {
                const result = new WsData<SysPojo>(CmdType.shell_getting);
                result.context = cmdData;
                (data.wss as Wss).sendData(result.encode())
            },
            copy_handle:(p)=>{
                const result = new WsData<SysPojo>(CmdType.shell_copy);
                result.context = p;
                (data.wss as Wss).sendData(result.encode())
            },
            check_exe_cmd:(exe_cmd,params)=>{
                if (settingService.get_shell_cmd_check()) {
                    const selfHandler = settingService.getHandlerClass(data_common_key.self_shell_cmd_jscode,data_dir_tem_name.sys_file_dir);
                    // 开启了自定义的处理
                    if (selfHandler) {
                        const ok = selfHandler.handler((data.wss as Wss).token,exe_cmd,params);
                        if(ok !== exec_type.continue) {
                            return ok;
                        }
                        // 继续接下来的判断
                    }
                }
                if(!userService.check_user_cmd((data.wss as Wss).token,exe_cmd,false)) {
                    // 检测命令能不能执行
                    return exec_type.not;
                }
                // 系统 支持的默认的 cd ,对于 ls pwd 权限临时改变了就改变吧 不做权限控制了 如果需要用户可以自己设置自定义脚本
                if(exe_cmd === 'cd') {
                    // cd 需要检测一下目录
                    if(userService.check_user_path((data.wss as Wss).token,path.isAbsolute(params[0])?params[0]:path.join(ptyProcess.cwd,params[0]))) {
                        return exec_type.auto_child_process;
                    }
                }
                return exec_type.auto_child_process;
            }
        });
        // const sysPath = path.join(settingService.getFileRootPath(pojo.http_token), (pojo.init_path !== null && pojo.init_path !== "null") ? pojo.init_path : "");
        // const cm = `cd '${decodeURIComponent(sysPath)}' ${cr}`;
        // ptyProcess.write(cm);
        socketMap.set(socketId, ptyProcess);
        (data.wss as Wss).ws.on('close', function close() {
            const pty = socketMap.get(socketId);
            if (pty) {
                console.log('意外断开pty');
                pty.kill();
                socketMap.delete(socketId);
            }
        });
    }

    async send(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;

        const pty = socketMap.get(socketId);
        if (pty) {
            if (data.context !== null && data.context !== "null") {
                pty.write(data.context);
            }
        } else {
            const result = new WsData<SysPojo>(CmdType.shell_getting);
            result.context = "shell状态错误";
            (data.wss as Wss).sendData(result.encode());
            (data.wss as Wss).ws.close();
        }
    }

    // cancel(data: WsData<any>) {
    //     const socketId = (data.wss as Wss).id;
    //     (data.wss as Wss).ws.close();
    //     const pty = socketMap.get(socketId);
    //     if (pty) {
    //         console.log('主动断开pty');
    //         pty.kill();
    //         socketMap.delete(socketId);
    //     }
    // }

    cd(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        const pty = socketMap.get(socketId);
        if (pty) {
            const sysPath = path.join(settingService.getFileRootPath(data.context.http_token), decodeURIComponent(data.context.init_path));
            const cm = `cd '${sysPath}' ${cr}`;
            pty.write(cm);
        }
    }

    async dockerShellLogs(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        const pojo = data.context as ShellInitPojo;
        try {
            // 创建
            const exec = spawn('docker', ['logs', `${pojo.dockerId}`, '-f', '-n', 1000]);
            exec.stdout.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.docker_shell_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).sendData(result.encode())
            });

            exec.stderr.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.docker_shell_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).sendData(result.encode())
            });

            exec.on('close', (code) => {
                const exec = socketMap.get(socketId);
                if (exec) {
                    console.log('意外断开exec');
                    exec.kill();
                    socketMap.delete(socketId);
                }
                (data.wss as Wss).ws.close();
            });
            socketMap.set(socketId, exec);
            (data.wss as Wss).ws.on('close', function close() {
                const exec = socketMap.get(socketId);
                if (exec) {
                    console.log('意外断开exec');
                    exec.kill();
                    socketMap.delete(socketId);
                }
                (data.wss as Wss).ws.close();
            });
        } catch (ex) {
            const exec = socketMap.get(socketId);
            if (exec) {
                console.log('意外断开exec');
                exec.kill();
                socketMap.delete(socketId);
                (data.wss as Wss).ws.close();
            }
        }


    }

    async dockerShellLogs_cancel(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        (data.wss as Wss).ws.close();
        const exec = socketMap.get(socketId);
        if (exec) {
            console.log('主动断开exec');
            exec.kill();
            socketMap.delete(socketId);
        }
    }

    async dockerShellExecOpen(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        const pojo = data.context as ShellInitPojo;
        let dshell = "";
        if (SystemUtil.commandIsExist(`docker exec  ${pojo.dockerId} bash`)) {
            dshell = "bash"
        } else if (SystemUtil.commandIsExist(`docker exec  ${pojo.dockerId} sh`)) {
            dshell = "sh"
        } else {
            const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
            result.context = '\x1b[38;2;29;153;243m容器内不存在任何shell\x1b[0m ';
            (data.wss as Wss).sendData(result.encode());
            (data.wss as Wss).ws.close();
            return;
        }

        // 创建
        const ptyProcess = pty.spawn(getSys() === SysEnum.win?"docker.exe":"docker", ['exec','-it',pojo.dockerId,dshell], {
            name: 'xterm-color',
            cols: pojo.cols,
            rows: pojo.rows,
            cwd: process.env.HOME,
            // env: process.env,
            useConpty: process.env.NODE_ENV !== "production" ? false : undefined,
        });
        // const cm = `docker exec -it ${pojo.dockerId} ${dshell} ${cr}`;
        // ptyProcess.write(cm);
        ptyProcess.onData((cmdData) => {
            const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
            result.context = cmdData;
            (data.wss as Wss).sendData(result.encode())
        })
        ptyProcess.onExit(({exitCode, signal}) => {
            (data.wss as Wss).ws.close();
            // ptyProcess.kill(); // 已经被kill
            socketMap.delete(socketId);
        })
        socketMap.set(socketId, ptyProcess);
        (data.wss as Wss).ws.on('close', function close() {
            const pty = socketMap.get(socketId);
            if (pty) {
                console.log('ws客户端 意外断开pty');
                pty.kill();
                socketMap.delete(socketId);
            }
        });

    }

    async dockerShellExec(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        const pty = socketMap.get(socketId);
        if (pty) {
            if (data.context !== null && data.context !== "null") {
                pty.write(data.context);
            }
        } else {
            const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
            result.context = "error";
            (data.wss as Wss).sendData(result.encode());
            (data.wss as Wss).ws.close();
        }
    }

    dockerShellExecCancel(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        (data.wss as Wss).ws.close();
        const pty = socketMap.get(socketId);
        if (pty) {
            console.log('主动断开pty');
            pty.kill();
            socketMap.delete(socketId);
        }
    }


}

export const shellServiceImpl = new ShellService();
