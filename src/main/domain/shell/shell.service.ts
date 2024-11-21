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

const {spawn, exec} = require('child_process');
export const sysType = os.platform() === 'win32' ? "win" : "linux";
let cr = '\r';

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
const init_sys_env_path = process.env.PATH;
export class ShellService {

    async open(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        // 要传递的环境变量
        process.env.PATH = init_sys_env_path +(sysType === "win" ? ";" : ":")  + settingService.getEnvPath();
        const pojo = data.context as ShellInitPojo;
        // 创建
        const ptyProcess = pty.spawn(getShell(), [], {
            name: 'xterm-color',
            cols: pojo.cols,
            rows: pojo.rows,
            cwd: process.env.HOME,
            env:process.env,
            useConptyDll:false, // 使用useConpty的话 新版本的windwos都不需要这个dll自带的有
            useConpty: process.env.NODE_ENV !== "production" ? false : undefined,// conpty 可以支持 bash 等命令 从 Windows 10 版本 1809 开始提供 ， 但是如果使用了 powershell 这个也就没有必要了，而且设置为false才能使用debug模式运行
            // exePath:"F:\\winpty-agent.exe"
        });
        const sysPath = path.join(settingService.getFileRootPath(pojo.http_token), (pojo.init_path !== null && pojo.init_path !== "null") ? pojo.init_path : "");
        const cm = `cd '${decodeURIComponent(sysPath)}' ${cr}`;
        ptyProcess.write(cm);
        ptyProcess.onData((cmdData) => {
            const result = new WsData<SysPojo>(CmdType.shell_getting);
            result.context = cmdData;
            (data.wss as Wss).sendData(result.encode())
        })
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

    cancel(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        (data.wss as Wss).ws.close();
        const pty = socketMap.get(socketId);
        if (pty) {
            console.log('主动断开pty');
            pty.kill();
            socketMap.delete(socketId);
        }
    }

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
        const ptyProcess = pty.spawn(getShell(), [], {
            name: 'xterm-color',
            cols: pojo.cols,
            rows: pojo.rows,
            cwd: process.env.HOME,
            // env: process.env,
            useConpty: process.env.NODE_ENV !== "production" ? false : undefined,
        });
        const cm = `docker exec -it ${pojo.dockerId} ${dshell} ${cr}`;
        ptyProcess.write(cm);
        ptyProcess.onData((cmdData) => {
            const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
            result.context = cmdData;
            (data.wss as Wss).sendData(result.encode())
        })
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
