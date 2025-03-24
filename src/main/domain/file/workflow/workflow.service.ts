import {CmdType, WsData} from "../../../../common/frame/WsData";
import {
    job_item,
    running_type,
    step_item,
    work_flow_record,
    workflow_dir_name, workflow_pre_input,
    WorkflowGetReq,
    WorkflowGetRsq,
    WorkFlowRealTimeOneReq,
    WorkFlowRealTimeReq,
    WorkFlowRealTimeRsq,
    WorkflowReq,
    WorkRunType
} from "../../../../common/req/file.req";
import {Wss} from "../../../../common/frame/ws.server";
import {settingService} from "../../setting/setting.service";
import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {userService} from "../../user/user.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {data_common_key, data_dir_tem_name} from "../../data/data_type";
import {UserAuth} from "../../../../common/req/user.req";
import {sysType} from "../../shell/shell.service";
import {Base_data_util} from "../../data/basedata/base_data_util";
import {removeTrailingPath} from "../../../../common/StringUtil";
import {workflow_realtime_tree_list} from "../../../../common/req/common.pojo";
import {formatter_time} from "../../../../common/ValueUtil";
import vm from "node:vm";
import {FileUtil} from "../FileUtil";
import {SystemUtil} from "../../sys/sys.utl";

const readYamlFile = require('read-yaml-file')
const pty: any = require("@xiaobaidadada/node-pty-prebuilt")
const Mustache = require('mustache');

const sandbox = {
    // needle: needle, // needle http 请求工具
    // fs: fs,
    // path: path,
};
const sandbox_context = vm.createContext(sandbox); // 创建沙箱上下文

interface import_files_item {
    yaml_data: any;
    yaml_path: string;
}

enum send_ws_type {
    done,// 结束
    new_log, // 最新日志
}

class work_children {

    // 临时变量
    running_type: running_type = running_type.running;
    running_log: string; // 当前最新的日志输出

    wss_call_set: Set<Wss>;

    filename;
    not_log = false;
    workflow_dir_path: string;

    yaml_path: string;
    user_id: string;
    env: any; // env 环境变量
    import_files_map: Map<string, import_files_item> = new Map<string, import_files_item>(); // 导入的其它文件 key 是对应文件的 name 值是 读到的数据
    name: string;
    "run-name": string;
    jobs_map: Map<string, job_item> = new Map();


    done_jobs = new Set<string>();
    need_job_map: Map<string, Set<string>> = new Map(); // 对方的key 自己的key job['need-job'],job.key value是某个Job被依赖(need-job指向它)的集合

    all_job_resolve;

    pty_shell_set = new Set<PtyShell>();

    worker_children_use_yml_map = new Map<string, work_children>(); // 导入子文件生成的 ues-yml 与 其worker

    constructor(yaml_path: string = undefined, workflow_dir_path: string | undefined = undefined) {
        this.yaml_path = yaml_path;
        if (workflow_dir_path) {
            this.workflow_dir_path = workflow_dir_path;
        }
    }

    public static get_workflow_realtime_tree_list(r_list: workflow_realtime_tree_list, worker: work_children) {
        for (const it of worker.jobs_map.values()) {
            const v = {
                name: it.name,
                extra_data: {running_type: it.running_type},
                children: []
            };
            if (it.steps) {
                const children: any[] = [];
                for (const step of it.steps ?? []) {
                    const p = {
                        name: step.run ?? step["use-yml"],
                        extra_data: {running_type: step.running_type},
                        children: []
                    }
                    const children_worker = worker.worker_children_use_yml_map.get(step['use-yml']);
                    if (children_worker) {
                        this.get_workflow_realtime_tree_list(p.children, children_worker);
                    }
                    children.push(p)
                }
                v.children = children;
            }
            r_list.push(v)
        }
    }

    send_wss(type?: send_ws_type, ...wss: Wss[]) {
        const r_list: workflow_realtime_tree_list = [];
        if (type !== send_ws_type.new_log) {
            work_children.get_workflow_realtime_tree_list(r_list, this);
        }
        for (const w of wss) {
            const result = new WsData<SysPojo>(CmdType.workflow_realtime_one_rsq);
            result.context = {
                done: type === undefined ? undefined : type === send_ws_type.done,
                list: r_list,
                new_log: this.running_log
            };
            w.sendData(result.encode());
        }
    }

    send_all_wss(type?: send_ws_type) {
        if (this.wss_call_set) {
            this.send_wss(type, ...this.wss_call_set.values());
        }
    }

    add_wss(wss: Wss) {
        if (!this.wss_call_set) {
            this.wss_call_set = new Set();
        }
        if (!this.wss_call_set.has(wss)) {
            this.wss_call_set.add(wss);
        }
        this.send_wss(undefined, wss);
    }


    remove_wss(wss: Wss) {
        if (!this.wss_call_set) {
            this.wss_call_set.delete(wss);
        }
    }

    public async init(param?: {
        env?: any,
        not_log?: boolean,
        yaml_data?: any,
        yaml_path?: string,
        filecat_user_id?: string,
        filecat_user_name?: string,
        filecat_user_note?: string,
        send_all_wss?: (done?: send_ws_type) => void,
        pre_env?: any
    }) {
        if (param?.yaml_path) {
            this.yaml_path = param.yaml_path;
        }
        if (param?.send_all_wss) {
            this.send_all_wss = param.send_all_wss;
        }
        this.filename = path.basename(this.yaml_path);
        const yaml_data = param?.yaml_data ?? await readYamlFile(this.yaml_path);
        // 环境变量设置
        this.env = yaml_data.env ?? {};
        if (param.pre_env) {
            for (const key of Object.keys(param.pre_env)) {
                this.env[key] = param.pre_env[key];
            }
        }
        this.env['filecat_user_id'] = param.filecat_user_id;
        this.env['filecat_user_name'] = param.filecat_user_name;
        this.env['filecat_user_note'] = param.filecat_user_note;
        // 获取用户 id
        let user_id = `${yaml_data.user_id || yaml_data['user-id'] || ""}`;
        if (!user_id) {
            user_id = userService.get_user_id(`${yaml_data.username}`);
        }
        if (!user_id) {
            throw "user not exists";
        }
        this.user_id = user_id;
        userService.check_user_auth_by_user_id(this.user_id, UserAuth.workflow_exe_user, {
            auto_throw: true,
            root_check: true
        })
        // 获取工作目录
        if (!this.workflow_dir_path) {
            let find_p = path.dirname(this.yaml_path);
            let have_find = false;
            while (true) {
                if (await FileUtil.access(path.join(find_p, workflow_dir_name))) {
                    have_find = true; // 找到
                    break;
                }
                const p = path.join(find_p, "..");
                if (p === find_p) {
                    have_find = false; // 到根目录了 还没有找到
                    break;
                }
                find_p = p;
                if (!userService.check_user_path_by_user_id(this.user_id, find_p, false)) {  // 路径校验
                    have_find = false; // 目录不允许了
                    break;
                }
            }
            if (have_find) {
                this.workflow_dir_path = path.join(find_p, workflow_dir_name);
            } else {
                this.workflow_dir_path = path.join(path.dirname(this.yaml_path), workflow_dir_name); // 找不到就在当前目录下创建
                await fse.ensureDir(this.workflow_dir_path)
            }
        }
        // 获取多个任务
        if (yaml_data.jobs) {
            for (const key of Object.keys(yaml_data.jobs)) {
                const v: job_item = yaml_data.jobs[key];
                v.key = key;
                this.jobs_map.set(v.key, v);
            }
        }
        if (yaml_data['import-files']) {
            for (const p of yaml_data['import-files']) {
                if (path.isAbsolute(p)) {
                    const d = await readYamlFile(p);
                    this.import_files_map.set(d.name, {yaml_path: p, yaml_data: d});
                } else {
                    const p1 = path.join(path.dirname(this.yaml_path), p);
                    const d = await readYamlFile(p1);
                    this.import_files_map.set(d.name, {yaml_path: p1, yaml_data: d});
                }
            }
        }
        yaml_data['run-name'] = Mustache.render(`${yaml_data['run-name'] ?? ""}`, this.env ?? {});
        this["run-name"] = `${yaml_data['run-name'] ?? ""}`;
        this.name = `${yaml_data.name}`;
        if (param?.env) {
            for (const key of Object.keys(param.env)) {
                this.env[key] = param.env[key];
            }
        }
        if (param?.not_log !== undefined) {
            this.not_log = param?.not_log;
        }
        return this;
    }

    public async run_jobs(return_steps = false) {
        const start_time = Date.now();
        await new Promise(resolve => {
            this.all_job_resolve = resolve;
            for (const job of this.jobs_map.values()) {
                // 并行执行多个job
                this.run_job(job).then((e) => {

                }).catch(e => {
                    console.error(e);
                    job.running_type = running_type.fail;
                    job.fail_message = JSON.stringify(e);
                    job.code = 1;
                    resolve(-1);
                });
            }
        })
        // console.log('全部执行完成')
        const success_list = [];
        const fail_list = [];
        for (const it of this.jobs_map.values()) {
            if (it.code === 0 || it.code === undefined) {
                success_list.push(it);
            } else {
                fail_list.push(it);
            }
        }
        if (return_steps) {
            return {success_list: success_list, fail_list};
        }
        if (fail_list.length === 0) {
            this.send_all_wss(send_ws_type.done);
        } else {
            this.send_all_wss();
        }
        this.running_type = fail_list.length === 0 ? running_type.success : running_type.fail;
        try {
            const base_data_util = new Base_data_util({base_dir: this.workflow_dir_path});
            await base_data_util.init();
            await base_data_util.insert(JSON.stringify({
                success_list: success_list, fail_list,
            }), JSON.stringify({
                name: this.name,
                "run-name": this["run-name"],
                is_success: fail_list.length === 0,
                timestamp: formatter_time(new Date()),
                duration: `${((Date.now() - start_time) / 1000).toFixed(2)} s` // s 秒
            }));
        } catch (error) {
            console.log('插入数据库失败', error)
        }
    }

    // 完成job 以失败的方式
    private done_fail_job_handle(job: job_item, fail_message: string) {
        job.running_type = running_type.fail;
        job.code = 1;
        this.send_all_wss();
        job.fail_message = fail_message;
        this.close();
        this.all_job_resolve("ok"); // 只要有一个失败 全部都失败 不再继续执行了
    }

    private have_need_job_loop(start_job_name: string, job_name: string) {
        const other_need_me_set = this.need_job_map.get(job_name);
        if (other_need_me_set) {
            if (other_need_me_set.has(start_job_name)) return true; // job依赖最开始的job(这个job有依赖循环)
            for (const name of other_need_me_set) {
                if (this.have_need_job_loop(start_job_name, name)) {
                    return true; // 检测是否存在 依赖自己的还依赖别人
                }
            }
        }
        return false;
    }

    public async run_job(job: job_item) {
        try {
            if (!job.if || vm.runInContext(job.if, sandbox_context)) {
                if (job['sys-env']) {
                    for (const key of Object.keys(job['sys-env'])) {
                        job['sys-env'][key] = Mustache.render(`${job['sys-env'][key] ?? ""}`, this.env ?? {});
                    }
                }
                if (job.env) {
                    for (const key of Object.keys(job.env)) {
                        job.env[key] = Mustache.render(`${job.env[key] ?? ""}`, this.env ?? {});
                    }
                }
                job.cwd = Mustache.render(job.cwd ?? "", {...this.env, ...job.env});
                job.running_type = running_type.running;
                // 目录处理判断
                if (!path.isAbsolute(job.cwd)) {
                    this.done_fail_job_handle(job, "cwd not absolute")
                    // 参数错误
                    return;
                }
                // 某些 是否需要其它job执行完成 提前做个map
                if (job['need-job']) {
                    if (!this.jobs_map.has(job['need-job'])) {
                        // 需要的job不存在
                        this.done_fail_job_handle(job, `job not found ${job['need-job']}`);
                        return;
                    }
                    if (!this.done_jobs.has(job['need-job'])) {
                        // need没有完成
                        let set = this.need_job_map.get(job['need-job']);
                        if (!set) {
                            set = new Set();
                            this.need_job_map.set(job['need-job'], set);
                        }
                        set.add(job.key);
                        // this.need_job_map.set(job['need-job'],job.key);
                        // 检测循环依赖
                        if (this.have_need_job_loop(job.key, job.key)) {
                            // 出现了循环依赖
                            this.done_fail_job_handle(job, "have cyclic need")
                            return;
                        }
                        // need的情况 先不执行
                        return;
                    }
                }
                // 开始执行能执行的多个命令 创建ptyshell
                let now_step: step_item;
                let exec_resolve;
                const run_exec_resolve = (code, message?: string) => {
                    now_step.code = code;
                    if (code === 0) {
                        now_step.success_message = message ?? out_context;
                        job.code = 0;
                    } else {
                        job.code = code; // 任务整体也失败
                        now_step.fail_message = message ?? out_context;
                    }
                    out_context = "";
                    if (exec_resolve) {
                        exec_resolve(code);
                        exec_resolve = undefined;
                    }
                }
                let out_context = "";
                userService.check_user_path_by_user_id(this.user_id, job.cwd);
                const PATH = process.env.PATH + (sysType === "win" ? ";" : ":") + settingService.get_env_list();
                const ptyshell = new PtyShell({
                    cwd: job.cwd,
                    node_pty: pty,
                    env: {PATH, ...job['sys-env']},
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
                        if (!userService.check_user_cmd_by_id(this.user_id, exe_cmd, false)) {
                            // 检测命令能不能执行
                            return exec_type.not;
                        }
                        // 系统 支持的默认的 cd ,对于 ls pwd 权限临时改变了就改变吧 不做权限控制了 如果需要用户可以自己设置自定义脚本
                        if (exe_cmd === 'cd') {
                            // cd 需要检测一下目录
                            if (userService.check_user_path_by_user_id(this.user_id, path.isAbsolute(params[0]) ? params[0] : path.join(ptyshell.cwd, params[0]))) {
                                return exec_type.auto_child_process;
                            }
                        }
                        return exec_type.auto_child_process;
                    }
                });
                this.pty_shell_set.add(ptyshell);
                if (!this.not_log) {
                    ptyshell.on_call = (cmdData) => {
                        this.running_log = cmdData;
                        this.send_all_wss(send_ws_type.new_log);
                        out_context += cmdData;
                    }
                    // ptyshell.set_on_call((cmdData) => {
                    //     this.running_log = cmdData;
                    //     this.send_all_wss(send_ws_type.new_log);
                    //     out_context += cmdData;
                    // })
                }
                // ptyshell.on_child_kill((code) => {
                //     // 任何命令结束都有的
                //     run_exec_resolve(code);
                // })
                ptyshell.on_child_kill = (code, pid) => {
                    run_exec_resolve(code);
                    if (pid !== undefined) {
                        SystemUtil.killProcess(pid);
                    }
                }
                const start_time = Date.now();

                if (job.repl) {
                    try {
                        job.code = await new Promise(async resolve => {
                            exec_resolve = resolve;
                            if (job.steps) {

                                for (let i = 0; i < job.steps.length; i++) {
                                    const step = job.steps[i];
                                    if (step.if) {
                                        if (!vm.runInContext(step.if, sandbox_context)) {
                                            step.running_type = running_type.not;
                                            continue;
                                        }
                                    }
                                    if (!now_step) {
                                        now_step = step; // 交互式的给第一个可以执行命令
                                    }
                                    step.running_type = running_type.running;
                                    step.run = Mustache.render(`${step.run ?? ""}`, {...this.env, ...job.env});
                                    await ptyshell.write(`${step.run}\r`);
                                }
                            } else {
                                exec_resolve(1);
                            }

                        })
                        for (const step of job.steps ?? []) { // 都完成
                            if (step.running_type === running_type.not) {
                                continue;
                            }
                            step.running_type = running_type.success;
                            step.code = 0;
                        }
                    } catch (error) {
                        for (const step of job.steps ?? []) { // 都完成
                            step.running_type = running_type.fail;
                            step.code = 1;
                        }
                    }

                } else {
                    // 开始多个命令执行 有前后顺序的
                    for (const step of job.steps) {
                        // @ts-ignore
                        if (job.running_type === running_type.fail) {
                            break;
                        }
                        if (step.if) {
                            if (!vm.runInContext(step.if, sandbox_context)) {
                                step.running_type = running_type.not;
                                this.send_all_wss();
                                continue;
                            }
                        }
                        step.running_type = running_type.running;
                        this.send_all_wss();
                        const step_satrt_time = Date.now();
                        if (step["use-yml"]) {
                            // 执行另一个文件
                            const yaml = this.import_files_map.get(step["use-yml"]);
                            if (yaml) {
                                if (step['with-env']) {
                                    for (const key of Object.keys(step['with-env'])) {
                                        step['with-env'][key] = Mustache.render(`${step['with-env'][key] ?? ""}`, {...this.env, ...job.env});
                                    }
                                }
                                const worker = new work_children(undefined, this.workflow_dir_path);
                                await worker.init({
                                    env: step['with-env'],
                                    yaml_data: yaml.yaml_data,
                                    yaml_path: yaml.yaml_path,
                                    filecat_user_name: this.env['filecat_user_name'],
                                    filecat_user_id: this.env['filecat_user_id'],
                                    filecat_user_note: this.env['filecat_user_note'],
                                    send_all_wss: this.send_all_wss.bind(this)
                                });
                                this.worker_children_use_yml_map.set(step["use-yml"], worker);
                                let success_list, fail_list;
                                try {
                                    const v = await worker.run_jobs(true); //  只需要记录整个执行结果 日志不记录了
                                    success_list = v.success_list;
                                    fail_list = v.fail_list;
                                } catch (e) {
                                    step.running_type = running_type.fail;
                                    this.worker_children_use_yml_map.delete(step["use-yml"]);
                                    throw e;
                                }
                                this.worker_children_use_yml_map.delete(step["use-yml"]);
                                step.use_job_children_list = [...success_list, ...fail_list]
                                step.duration = `${((Date.now() - step_satrt_time) / 1000).toFixed(2)} s`;
                                this.send_all_wss();
                                if (fail_list.length !== 0) {
                                    job.code = -1;
                                    step.code = -1;
                                    step.running_type = running_type.fail;
                                    this.done_fail_job_handle(job, "fail");
                                    break;
                                }
                                step.running_type = running_type.success;
                                step.code = 0;
                                continue;
                            }
                            step.running_type = running_type.fail;
                            this.send_all_wss();
                            step.code = -1;
                            step.fail_message = `not have yaml use name ${step['use-yml']}`;
                            job.code = -1;
                            step.duration = `${((Date.now() - step_satrt_time) / 1000).toFixed(2)} s`;
                            this.done_fail_job_handle(job, "fail");
                            break; // 剩下的也不需要执行了
                        }
                        // 普通的执行
                        now_step = step;
                        // 等待执行完执行下一条
                        const code = await new Promise(resolve => {
                            exec_resolve = resolve;
                            step.run = Mustache.render(`${step.run ?? ""}`, {...this.env, ...job.env});
                            ptyshell.write(`${step.run}\r`); // 这里没有必要使用 await
                            this.send_all_wss();
                        })
                        step.duration = `${((Date.now() - step_satrt_time) / 1000).toFixed(2)} s`;
                        step.code = code as number;
                        step.running_type = running_type.success;
                        if (code !== 0) {
                            step.running_type = running_type.fail;
                            // 终止后面的行为
                            this.send_all_wss();
                            break;
                        }
                        this.send_all_wss();
                    }

                }
                this.pty_shell_set.delete(ptyshell);
                if (job.repl) {
                    if (job.code === 0) {
                        job.success_message = out_context;
                    } else {
                        job.fail_message = out_context;
                    }
                }
                job.duration = `${((Date.now() - start_time) / 1000).toFixed(2)} s`;
            } else {
                job.duration = `0 s`;
                job.running_type = running_type.not;
            }

            // 标记自己完成 有step 失败了 整体还是会完成
            this.done_jobs.add(job.key);
            // 推送进度
            if (job.code !== undefined) {
                if (job.code === 0) {
                    job.running_type = running_type.success;
                } else {
                    job.running_type = running_type.fail;
                }
            }
            this.send_all_wss();
            if(job.running_type === running_type.fail) {
                this.all_job_resolve("ok");
            } else {
                // 判断need中是否有可以执行的了
                const job_set = this.need_job_map.get(job.key);
                if (job_set) {
                    if (job_set.has(job.key)) {
                        // 是自己 循环的情况不会出现
                        // this.need_job_map.delete(job.key);
                        job_set.delete(job.key);
                    } else {
                        // 需要自己的 不是自己 执行它
                        for (const it of job_set) {
                            this.run_job(this.jobs_map.get(it)).catch(e => {
                                throw e;
                            }).then(() => {

                            })
                        }
                        // await this.run_job(this.jobs_map.get(job_key));
                    }
                }
                // 判断是否完全完成 如果有循环依赖无法走到这里
                if (this.done_jobs.size === this.jobs_map.size) {
                    this.all_job_resolve("ok");
                }
            }
        } catch (error) {
            console.log('workflows job error ', error)
            this.done_fail_job_handle(job, JSON.stringify(error));
        }
    }

    public close() {
        for (const it of this.pty_shell_set) {
            it.close();
        }
        // 可以递归的关闭所有的 worker
        for (const worker of this.worker_children_use_yml_map.values()) {
            worker.close();
        }
    }
}

const work_exec_map = new Map<string, work_children>(); // key 是文件名 value 是 work_children

const realtime_user_dir_wss_map = new Map<string, Set<Wss>>(); // 路径和对应的 多个wss

export class WorkflowService {

    async workflow_get_pre_inputs(path: string) {
        const list: workflow_pre_input[] = [];
        const yml_data = await readYamlFile(path);
        if (yml_data.inputs && typeof yml_data.inputs === "object") {
            for (const key of Object.keys(yml_data.inputs)) {
                const v = yml_data.inputs[key];
                list.push({
                    key: key,
                    description: v.description,
                    required: v.required,
                    default: v.default
                })
            }
        }
        return list;
    }

    /**
     *  不需要子线程 因为每个命令都是用子进程执行的
     * @param data
     */
    public async workflow_exec(data: WsData<WorkflowReq>) {
        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkflowReq;
        const root_path = settingService.getFileRootPath(token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.path));
        const user_info = userService.get_user_info_by_token(token);
        if (pojo.run_type === WorkRunType.start) {
            await this.exec_file(file_path, user_info, pojo.inputs);
        } else if (pojo.run_type === WorkRunType.stop) {
            const worker = work_exec_map.get(file_path);
            if (!worker)
                throw "no task  exists";
            worker.close();
            work_exec_map.delete(file_path);
            this.online_change_push();
        }
    }

    public async exec_file(file_path, user_info, inputs?: workflow_pre_input[]) {
        if (work_exec_map.get(file_path))
            throw "Workflow exec task already exists";
        const worker = new work_children(file_path);
        work_exec_map.set(file_path, worker);
        try {
            const pre_env = {};
            if (inputs) {
                for (const it of inputs) {
                    pre_env[it.key] = it.default;
                }
            }
            await worker.init({
                filecat_user_id: userService.get_user_id(user_info.username),
                filecat_user_name: user_info.username,
                filecat_user_note: user_info.note,
                pre_env
            });
        } catch (e) {
            worker.running_type = running_type.fail;
            this.online_change_push();
            work_exec_map.delete(file_path);
            throw e;
        }
        this.online_change_push(); // 在init后不然没有 filename
        worker.run_jobs().then(e => {
            this.online_change_push();
            work_exec_map.delete(file_path);
        }).catch(e => {
            this.online_change_push();
            worker.running_type = running_type.fail;
            console.log('任务执行失败', e)
            work_exec_map.delete(file_path);
            worker.close();
        });
    }

    public async workflow_realtime_one(data: WsData<WorkFlowRealTimeOneReq>) {

        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkFlowRealTimeOneReq;
        const root_path = settingService.getFileRootPath(token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.filename_path));

        const v = work_exec_map.get(file_path);
        if (!v) {
            return;
        }
        v.add_wss(data.wss as Wss);
        (data.wss as Wss).setClose(() => {
            v.remove_wss(data.wss as Wss);
        })
    }

    public async workflow_get(data: WsData<WorkflowGetReq>) {
        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkflowGetReq;
        const root_path = settingService.getFileRootPath(token);
        const dir_path = path.join(root_path, decodeURIComponent(pojo.dir_path), workflow_dir_name);
        const basedata = new Base_data_util({base_dir: dir_path});
        const r = new WorkflowGetRsq();
        if (pojo.index !== undefined) {
            // @ts-ignore
            r.one_data = await basedata.find_one_by_index(pojo.index);
            return r;
        }
        const running_list: work_flow_record[] = [];
        for (const it of work_exec_map.values()) {
            running_list.push({
                meta: {
                    is_running: true,
                    name: it.name,
                    "run-name": it["run-name"]
                },
                // data:{
                //     success_list:Array.from(it.jobs_map.values())
                // },
                index: -1
            });
        }
        r.list = [...running_list, ...await basedata.find_page(pojo.page_num, pojo.page_size, true)];
        r.total = await basedata.find_num();
        return r;
    }

    public async workflow_search_by_run_name(data: WsData<WorkflowGetReq>) {
        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkflowGetReq;
        const root_path = settingService.getFileRootPath(token);
        const dir_path = path.join(root_path, decodeURIComponent(pojo.dir_path), workflow_dir_name);
        const basedata = new Base_data_util({base_dir: dir_path});
        const r = new WorkflowGetRsq();
        const regex = new RegExp(pojo.search_name);
        // @ts-ignore
        r.list = await basedata.find_list((index, meta) => {
            if (!meta) return false;
            return regex.test(JSON.parse(meta)['run-name']);
        });
        r.total = await basedata.find_num();
        return r;
    }

    public workflow_realtime(data: WsData<WorkFlowRealTimeReq>) {
        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkflowGetReq;
        const wss = (data.wss as Wss);
        const root_path = settingService.getFileRootPath(token);
        const dir_path = path.join(root_path, pojo.dir_path);
        const runing_filename_list = [];
        const parent = removeTrailingPath(decodeURIComponent(dir_path));
        for (const key of work_exec_map.keys()) {
            const child = removeTrailingPath(path.dirname(key));
            const p = work_exec_map.get(key);
            if (parent === child && p.running_type === running_type.running) {
                runing_filename_list.push(p.filename);
            }
        }
        // const result = new WsData<SysPojo>(CmdType.workflow_realtime);
        // result.context = runing_filename_list;
        // (data.wss as Wss).sendData(result.encode());
        const pre_path = wss.dataMap.get("pre_path");
        if (pre_path) {
            let set = realtime_user_dir_wss_map.get(pre_path);
            if (set) {
                set.delete(wss);
            }
        }
        let set = realtime_user_dir_wss_map.get(parent);
        if (!set) {
            set = new Set<Wss>();
            realtime_user_dir_wss_map.set(parent, set);
        }
        set.add(wss);
        wss.setClose(() => {
            set.delete(wss);
        });
        wss.dataMap.set("pre_path",parent);
        const rsq = new WorkFlowRealTimeRsq();
        rsq.running_file_list = runing_filename_list;
        return rsq;
    }


    private online_change_push() {
        const map = new Map();
        const faile_map = new Map();
        const run_map = new Map();
        for (const it of work_exec_map.values()) {
            const key = it.yaml_path;
            const dir_path = removeTrailingPath(path.dirname(key));
            let list: string[];
            if (it.running_type === running_type.fail) {
                list = faile_map.get(dir_path);
                if (!list) {
                    list = [];
                    faile_map.set(dir_path, list);
                }
            } else if (it.running_type === running_type.success) {
                list = map.get(dir_path);
                if (!list) {
                    list = [];
                    map.set(dir_path, list);
                }
            } else {
                // 成功
                list = run_map.get(dir_path);
                if (!list) {
                    list = [];
                    run_map.set(dir_path, list);
                }
            }
            list.push(work_exec_map.get(key).filename);
        }
        for (const key of realtime_user_dir_wss_map.keys()) {
            const result = new WsData<SysPojo>(CmdType.workflow_realtime);
            const rsq = new WorkFlowRealTimeRsq();
            result.context = rsq;
            if (map.has(key)) {
                rsq.sucess_file_list = map.get(key);
            }
            if (faile_map.has(key)) {
                rsq.failed_file_list = faile_map.get(key);
            }
            if (run_map.has(key)) {
                rsq.running_file_list = run_map.get(key);
            }
            const user_wss_set = realtime_user_dir_wss_map.get(key);
            for (const v of user_wss_set) {
                v.sendData(result.encode());
            }
        }
    }


}

export const workflowService: WorkflowService = new WorkflowService();
