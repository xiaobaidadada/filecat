import {CmdType, WsData} from "../../../common/frame/WsData";
import os from "os";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import path from "path";
// import {config} from "../../other/config";
// import * as inspector from "node:inspector";
import {SystemUtil} from "../sys/sys.utl";
import {Env} from "../../../common/Env";

const {spawn,exec } = require('child_process');
export const sysType = os.platform() === 'win32'?"win":"linux";
let cr = '\r';
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
        }  else if (SystemUtil.commandIsExist("sh")) {
            return "sh";
        }
    }
}
let shell :string|null = null;
export function getShell() {
    if (!shell) {
        shell = getSysShell()!
        }
    return  shell;
}
// const pty:any = shell === 'powershell.exe'?require('../../../../local_node_modules/windows/node-pty'):require('../../../../local_node_modules/linux/node-pty');
const pty: any = require("@homebridge/node-pty-prebuilt-multiarch")



const socketMap: Map<string, any> = new Map();

export class ShellService {

    async send(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        const socket = socketMap.get(socketId);
        if (!socket) {
            // 创建
            const ptyProcess = pty.spawn(getShell(), [], {
                name: 'xterm-color',
                cols: 240,
                rows: 30,
                cwd: process.env.HOME,
                env: process.env,
                useConpty: process.env.NODE_ENV!=="production" ? false : undefined,
            });
            const sysPath = path.join(Env.base_folder, (data.context !== null && data.context !== "null") ? data.context : "");
            const cm = `cd '${decodeURIComponent(sysPath)}' ${cr}`;
            ptyProcess.write(cm);
            ptyProcess.onData((cmdData) => {
                const result = new WsData<SysPojo>(CmdType.shell_getting);
                result.context = cmdData;
                (data.wss as Wss).ws.send(result.encode())
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

        } else {
            const pty = socketMap.get(socketId);
            if (pty) {
                if (data.context !== null && data.context !== "null") {
                    pty.write(data.context);
                }
            } else {
                const result = new WsData<SysPojo>(CmdType.shell_getting);
                result.context = "shell状态错误";
                (data.wss as Wss).ws.send(result.encode());
                (data.wss as Wss).ws.close();
            }

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

    cd(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        const pty = socketMap.get(socketId);
        if (pty) {
            const sysPath = path.join(Env.base_folder, (data.context !== null && data.context !== "null") ? decodeURIComponent(data.context) : "");
            const cm = `cd '${sysPath}' ${cr}`;
            pty.write(cm);
        }
    }

    async dockerShellLogs(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        try {
            // 创建
            const exec = spawn('docker', ['logs', `${data.context}`, '-f','-n',1000]);
            exec.stdout.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.docker_shell_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).ws.send(result.encode())
            });

            exec.stderr.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.docker_shell_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).ws.send(result.encode())
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

    async dockerShellExec(data: WsData<any>) {
        const socketId = (data.wss as Wss).id;
        const socket = socketMap.get(socketId);
        if (!socket) {
            let dshell = "";
            if (SystemUtil.commandIsExist(`docker exec  ${data.context } bash`)) {
                dshell = "bash"
            } else if (SystemUtil.commandIsExist(`docker exec  ${data.context } sh`)) {
                dshell = "sh"
            } else {
                const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
                result.context = '\x1b[38;2;29;153;243m容器内不存在任何shell\x1b[0m ';
                (data.wss as Wss).ws.send(result.encode());
                (data.wss as Wss).ws.close();
                return ;
            }
            // 创建
            const ptyProcess = pty.spawn(getShell(), [], {
                name: 'xterm-color',
                cols: 240,
                rows: 30,
                cwd: process.env.HOME,
                env: process.env,
                useConpty: process.env.NODE_ENV!=="production" ? false : undefined,
            });
            const cm = `docker exec -it ${data.context } ${dshell} ${cr}`;
            ptyProcess.write(cm);
            ptyProcess.onData((cmdData) => {
                const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
                result.context = cmdData;
                (data.wss as Wss).ws.send(result.encode())
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
        } else {
            const pty = socketMap.get(socketId);
            if (pty) {
                if (data.context !== null && data.context !== "null") {
                    pty.write(data.context);
                }
            } else {
                const result = new WsData<SysPojo>(CmdType.docker_shell_exec_getting);
                result.context = "error";
                (data.wss as Wss).ws.send(result.encode());
                (data.wss as Wss).ws.close();
            }

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
