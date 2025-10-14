import {send_ws_type, work_children} from "./workflow.service";
import {shellServiceImpl, sysType} from "../../shell/shell.service";
import {SysEnum} from "../../../../common/req/user.req";
import {settingService} from "../../setting/setting.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";

const pty: any = require("@xiaobaidadada/node-pty-prebuilt")
import {data_common_key, data_dir_tem_name} from "../../data/data_type";
import {userService} from "../../user/user.service";
import path from "path";
import {SystemUtil} from "../../sys/sys.utl";
import {job_item, step_item} from "../../../../common/req/file.req";
import {Wss} from "../../../../common/frame/ws.server";

const Mustache = require('mustache');


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
        const env = job['exclude-env'] ? {} : instance.env;
        if (job.env) {
            for (const key of Object.keys(job.env)) {
                env[key] = Mustache.render(`${job.env[key] ?? ""}`, instance.env);
            }
        }
        const ptyshell = new PtyShell({
            cwd: job.cwd,
            node_pty: pty,
            env: {PATH, ...env},
            node_pty_shell_list: settingService.get_pty_cmd()
        });
        ptyshell.check_exe_cmd = shellServiceImpl.check_exe_cmd({
            user_id: instance.user_id, ptyShell:ptyshell
        })
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
            step.run = Mustache.render(`${step.run ?? ""}`, this.instance.env);
            runs = [step.run]
        } else if (step.runs) {
            for (let i = 0; i < step.runs.length; i++) {
                step.runs[i] = Mustache.render(`${step.runs[i] ?? ""}`, this.instance.env);
            }
            runs = step.runs
        }
        return new Promise((resolve, reject) => {
            if (!runs) {
                resolve(-1)
                this.instance.logger.running_log = 'not run or runs'
                return
            }
            this.run_exec_resolve = resolve;
            for (let cmd of runs) {
                this.pty.write(`${cmd}\r`); // 这里没有必要使用 await
            }
            this.instance.logger.send_all_wss();
        })
    }

}