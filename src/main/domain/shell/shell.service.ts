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
import {SysEnum, UserAuth} from "../../../common/req/user.req";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {userService} from "../user/user.service";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {word_detection_js} from "../../../common/word_detection_js";
import fs from "fs";
import {get_best_cmd} from "../../../common/path_util";
import {FileUtil} from "../file/FileUtil";

const {spawn, exec} = require('child_process');
const platform = os.platform()
export let sysType: SysEnum = SysEnum.unknown
if (platform === "win32") {
    sysType = SysEnum.win;
} else if (platform === "linux") {
    sysType = SysEnum.linux;
} else if (platform === "darwin") {
    sysType = SysEnum.mac;
}
let cr = '\r'; // xterm.js 按下 enter 是这个值

export function getSys() {
    return sysType
}

function getSysShell() {
    if (sysType === SysEnum.win) {
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

// let line = "";
//
// let prompt = `${process.env.USER ?? process.env.USERNAME}>`;

// ANSI 转义序列，设置绿色、蓝色、重置颜色
const green = '\x1b[32m';  // 绿色
const blue = '\x1b[34m';   // 蓝色
const reset = '\x1b[0m';   // 重置颜色

let word_detection = new word_detection_js();
// let word_detection_map = new Map<string, string>(); // 暂时不需要完整的路径
const s_f = (sysType === SysEnum.win ? ";" : ":");
let PATH_file_total = 0; // win我的电脑 也就三千多个没必要上 c++版的了
const exec_map = {// windwos文件命令执行优先级
    ".com": 4, // 越大优先
    ".exe": 3,
    ".bat": 2,
    ".cmd": 1
}

export class ShellService {


    async path_init() {
        try {
            word_detection.clear();
            word_detection = new word_detection_js();
            PATH_file_total = 0;
            const SYS_PATH = process.env.PATH + s_f + settingService.get_env_list();
            for (const item of SYS_PATH.split(s_f)) {
                try {
                    if (await FileUtil.access(item)) {
                        // 如果路径存在，使用 fs.statSync() 判断是否为目录
                        const stats = await FileUtil.statSync(item);
                        if (stats.isDirectory()) {
                            const items = await FileUtil.readdirSync(item);
                            for (const filename of items ?? []) {
                                if (getSys() === SysEnum.win && filename.endsWith(".dll")) {
                                    continue;
                                }
                                word_detection.add(filename);
                                // console.log(filename)
                                // word_detection_map.set(filename, item);
                                PATH_file_total++;
                            }
                        } else {
                            console.log('path加载 路径存在，但它不是一个目录');
                        }
                    } else {
                        console.log('path加载 目录不存在', item);
                    }
                } catch (err) {
                    console.error('path加载 检查目录时发生错误:', err);
                }
            }
            // console.log(PATH_file_total)
        } catch (ex) {
            console.log(ex)
        }
    }

    user_history_line_map: Map<string, string[]> = new Map();

    get_user_history_line(token: string) {
        const user_data = userService.get_user_info_by_token(token);
        let line = this.user_history_line_map.get(user_data.id);
        if (!line) {
            line = [];
            this.user_history_line_map.set(user_data.id, line);
        }
        return line;
    }

    check_exe_cmd({
                      token, ptyShell, user_id
                  }: {
        token?: string, ptyShell: PtyShell, user_id?: string
    }) {
        return async (exe_cmd, params) => {
            // 自定义命令
            switch (exe_cmd) {
                case "filecat-restart":
                    // 重启filecat
                    if (!!Env.watch  && process.send != null) {
                        if (token != null && userService.check_user_auth(token, UserAuth.shell_cmd_filecat_restart, false)) {
                            process.send('restart'); // 告诉主进程重启我
                        } else if (user_id != null && userService.check_user_auth_by_user_id(user_id, UserAuth.shell_cmd_filecat_restart, {
                            auto_throw: false
                        })) {
                            process.send('restart'); // 告诉主进程重启我
                        }
                        return exec_type.continue
                    }
                    return exec_type.not // 如果不是watch模式下，不允许执行
            }
            if (settingService.get_shell_cmd_check()) {
                const selfHandler = settingService.getHandlerClass(data_common_key.self_shell_cmd_jscode, data_dir_tem_name.sys_file_dir);
                // 开启了自定义的处理
                if (selfHandler) {
                    const ok = selfHandler.handler(token, exe_cmd, params);
                    if (ok !== exec_type.continue) {
                        return ok;
                    }
                    // 继续接下来的判断
                }
            }
            if (token != null && !userService.check_user_cmd(token, exe_cmd, false)) {
                // 检测命令能不能执行
                return exec_type.not;
            } else if (user_id != null && !userService.check_user_cmd_by_id(user_id, exe_cmd, false)) {
                // 检测命令能不能执行
                return exec_type.not;
            }
            // 系统 支持的默认的 cd ,对于 ls pwd 权限临时改变了就改变吧 不做权限控制了 如果需要用户可以自己设置自定义脚本
            if (exe_cmd === 'cd') {
                // cd 需要检测一下目录
                if (token) {
                    if (userService.check_user_path(token, path.isAbsolute(params[0]) ? params[0] : path.join(ptyShell.cwd, params[0]))) {
                        return exec_type.auto_child_process;
                    }
                } else if (user_id) {
                    if (userService.check_user_path_by_user_id(user_id, path.isAbsolute(params[0]) ? params[0] : path.join(ptyShell.cwd, params[0]))) {
                        return exec_type.auto_child_process;
                    }
                } else {
                    return exec_type.not;
                }
            }
            return exec_type.auto_child_process;
        }
    }

    async open(data: WsData<ShellInitPojo>) {
        const socketId = (data.wss as Wss).id;
        // 要传递的环境变量
        const PATH = process.env.PATH + (sysType === SysEnum.win ? ";" : ":") + settingService.get_env_list();
        const pojo = data.context as ShellInitPojo;
        if (pojo.init_path) pojo.init_path = decodeURIComponent(pojo.init_path);
        const sysPath = path.join(settingService.getFileRootPath(pojo.http_token), (pojo.init_path !== null && pojo.init_path !== "null") ? pojo.init_path : "");
        userService.check_user_path((data.wss as Wss).token, sysPath); // 系统路径也检查一下
        const user_data = userService.get_user_info_by_token((data.wss as Wss).token);
        const ptyShell = new PtyShell({
            cols: pojo.cols,
            rows: pojo.rows,
            cwd: sysPath,
            node_pty: pty,
            env: {PATH},
            history_line: this.get_user_history_line((data.wss as Wss).token),
            node_pty_shell_list: settingService.get_pty_cmd(),
            on_prompt_call: (cwd) => {
                // 输出格式化的命令提示符
                const p = path.basename(cwd);
                const c = `${green}${user_data.username}${reset}:${blue}${p}${reset}:# `;
                const len = PtyShell.get_full_char_num(`${user_data.username}:${p}:# `); // 计算纯字符
                return {str: c, char_num: len};
            },
            on_call: (cmdData) => {
                const result = new WsData<SysPojo>(CmdType.shell_getting);
                result.context = cmdData;
                (data.wss as Wss).sendData(result.encode())
            },
            on_control_cmd: (type, str) => {
                if (exec_cmd_type.copy_text === type) {
                    const result = new WsData<SysPojo>(CmdType.shell_copy);
                    result.context = str;
                    (data.wss as Wss).sendData(result.encode())
                }
            }
        });
        ptyShell.check_exe_cmd = this.check_exe_cmd({
            token: (data.wss as Wss).token, ptyShell
        })
        ptyShell.cmd_exe_auto_completion = (exe) => {
            // 系统命令检测
            let v = word_detection.detection_next_one_word(exe, ".");
            if (v !== undefined) {
                return v;
            }
            // 本目录下再检测一下
            v = ptyShell.cmd_params_auto_completion(exe);
            if (v !== undefined) {
                return v;
            }
            // windwos 的话判断一下特殊情况再检测一下
            if (getSys() === SysEnum.win) {
                // windows 可能出现多个同名带后缀的或者不带后缀的词
                const list = word_detection.detection_next_list_word(exe, ".");
                return get_best_cmd(list);
            }
        }
        ptyShell.on_child_kill = (code, pid) => {
            if (pid !== undefined) {
                SystemUtil.killProcess(pid)
            }
        }
        // const sysPath = path.join(settingService.getFileRootPath(pojo.http_token), (pojo.init_path !== null && pojo.init_path !== "null") ? pojo.init_path : "");
        // const cm = `cd '${decodeURIComponent(sysPath)}' ${cr}`;
        // ptyProcess.write(cm);
        socketMap.set(socketId, ptyShell);
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
                await pty.write(data.context);
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

    // cd(data: WsData<ShellInitPojo>) {
    //     const socketId = (data.wss as Wss).id;
    //     const pty = socketMap.get(socketId);
    //     if (pty) {
    //         const sysPath = path.join(settingService.getFileRootPath(data.context.http_token), decodeURIComponent(data.context.init_path));
    //         const cm = `cd '${sysPath}' ${cr}`;
    //         pty.write(cm);
    //     }
    // }

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
        const ptyProcess = pty.spawn(getSys() === SysEnum.win ? "docker.exe" : "docker", ['exec', '-it', pojo.dockerId, dshell], {
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
