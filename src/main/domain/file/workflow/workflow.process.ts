import {send_ws_type, work_children} from "./workflow.service";
import {sysType} from "../../shell/shell.service";
import {SysEnum} from "../../../../common/req/user.req";
import {settingService} from "../../setting/setting.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";

const pty: any = require("@xiaobaidadada/node-pty-prebuilt")
import {data_common_key, data_dir_tem_name} from "../../data/data_type";
import {userService} from "../../user/user.service";
import path from "path";
import {SystemUtil} from "../../sys/sys.utl";
import {job_item, step_item} from "../../../../common/req/file.req";
import Mustache from "mustache/mustache.mjs";


export class WorkflowProcess {

    // 所有的步骤执行输出
    job_all_step_out_context: string = ""

    run_exec_resolve
    instance: work_children
    pty: PtyShell
    now_step: step_item
    step_start_time: number;

    constructor(instance: work_children, job: job_item) {
        this.instance = instance;
        const PATH = process.env.PATH + (sysType === SysEnum.win ? ";" : ":") + settingService.get_env_list();
        const ptyshell = new PtyShell({
            cwd: job.cwd,
            node_pty: pty,
            env: {PATH, ...instance.env},
            node_pty_shell_list: settingService.get_pty_cmd(),
            check_exe_cmd: (exe_cmd, params) => {
                // 命令和路径检查
                if (settingService.get_shell_cmd_check()) {
                    const selfHandler = settingService.getHandlerClass(data_common_key.self_shell_cmd_jscode, data_dir_tem_name.sys_file_dir);
                    // 开启了自定义的处理
                    if (selfHandler) {
                        const ok = selfHandler.handler("", exe_cmd, params); // token 只能空了
                        if (ok !== exec_type.continue) {
                            return ok;
                        }
                        // 继续接下来的判断
                    }
                }
                if (!userService.check_user_cmd_by_id(instance.user_id, exe_cmd, false)) {
                    // 检测命令能不能执行
                    return exec_type.not;
                }
                // 系统 支持的默认的 cd ,对于 ls pwd 权限临时改变了就改变吧 不做权限控制了 如果需要用户可以自己设置自定义脚本
                if (exe_cmd === 'cd') {
                    // cd 需要检测一下目录
                    if (userService.check_user_path_by_user_id(instance.user_id, path.isAbsolute(params[0]) ? params[0] : path.join(ptyshell.cwd, params[0]))) {
                        return exec_type.auto_child_process;
                    }
                }
                return exec_type.auto_child_process;
            }
        });
        instance.pty_shell_set.add(ptyshell);
        ptyshell.on_call = (cmdData) => {
            instance.logger.running_log = cmdData;
            this.job_all_step_out_context += cmdData;
            if (this.now_step.message == null) this.now_step.message = ""
            this.now_step.message += cmdData;
            instance.logger.send_all_wss(send_ws_type.new_log);
        }
        ptyshell.on_call_child_raw = (data): any => {
            if (this.now_step?.["out-env"] != null && instance.env != null) {
                instance.env[this.now_step["out-env"]] = data.toString();
            }
        }
        ptyshell.on_child_kill = (code, pid) => {
            if (this.run_exec_resolve) {
                this.run_exec_resolve(code);
                this.now_step.duration = `${((Date.now() - this.step_start_time) / 1000).toFixed(2)} s`
                if (pid !== undefined) {
                    SystemUtil.killProcess(pid);
                }
                this.run_exec_resolve = undefined;
            }
        }
        this.pty = ptyshell;
    }

    public run_step(step: step_item): Promise<number> {
        this.now_step = step;
        this.step_start_time = Date.now();
        let runs: string[]
        if (step.run) {
            runs = [step.run]
        } else if (step.runs) {
            runs = step.runs
        }
        return new Promise((resolve, reject) => {
            if(!runs) {
                resolve(-1)
                this.instance.logger.running_log = 'not run or runs'
                return
            }
            this.run_exec_resolve = resolve;
            for (let cmd of runs) {
                cmd = Mustache.render(`${cmd ?? ""}`, this.instance.env);
                this.pty.write(`${cmd}\r`); // 这里没有必要使用 await
            }
            this.instance.logger.send_all_wss();
        })
    }

}