import {CmdType, WsData} from "../../../../common/frame/WsData";
import {
    job_item,
    running_type,
    work_flow_record,
    workflow_dir_name,
    workflow_pre_input,
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
import fse from 'fs-extra'
import {userService} from "../../user/user.service";
import {PtyShell} from "pty-shell";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {UserAuth} from "../../../../common/req/user.req";
import {Base_data_util} from "../../data/basedata/base_data_util";
import {removeTrailingPath} from "../../../../common/StringUtil";
import {workflow_realtime_tree_list} from "../../../../common/req/common.pojo";
import {formatter_time} from "../../../../common/ValueUtil";
import {FileUtil} from "../FileUtil";
import {workflow_util} from "./workflow.util";
import {WorkflowProcess} from "./workflow.process";
import {CommonUtil} from "../../../../common/common.util";


const readYamlFile = require('read-yaml-file')
const Mustache = require('mustache');


export interface import_files_item {
    yaml_data: any;
    yaml_path: string;
}

export enum send_ws_type {
    done,// 结束
    new_log, // 最新日志
}

export class workflow_logger {

    wss_call_set: Set<Wss> = new Set<Wss>();
    instance: work_children // 一直是最外层
    running_log: string

    constructor(instance: work_children) {
        this.instance = instance;
    }

    send_wss(type?: send_ws_type, ...wss: Wss[]) {
        const r_list: workflow_realtime_tree_list = [];
        if (type !== send_ws_type.new_log) {
            work_children.get_workflow_realtime_tree_list(r_list, this.instance);
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

    // 应该使用最外层的实例，这样才能每次显示全部的结构
    send_all_wss(type?: send_ws_type) {
        if (this.wss_call_set) {
            this.send_wss(type, ...this.wss_call_set.values());
        }
    }

    add_wss(wss: Wss) {
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
}

export class work_children {

    // 临时变量 在一个job内执行step的时候 step都是有顺序的执行
    running_type: running_type = running_type.running;

    logger: workflow_logger // 保证深层结构依然调用的同一个打印对象

    filename;
    // not_log = false;
    workflow_dir_path: string;

    yaml_path: string;
    user_id: string;
    env: any; // env 环境变量
    import_files_map: Map<string, import_files_item> = new Map<string, import_files_item>(); // 导入的其它文件 key 是对应文件的 name 值是 读到的数据
    name: string;
    "run-name": string;
    jobs_map: Map<string, job_item> = new Map();


    done_jobs = new Set<string>();
    need_job_set: Set<job_item> = new Set<job_item>(); // 对方的key 自己的key job['need-job'],job.key value是某个Job被依赖(need-job指向它)的集合

    all_job_resolve;

    pty_shell_set = new Set<PtyShell>();

    worker_children_use_yml_map = new Map<string, work_children>(); // 导入子文件生成的 ues-yml 与 其worker

    constructor(yaml_path: string = undefined, workflow_dir_path: string | undefined = undefined) {
        this.yaml_path = yaml_path;
        if (workflow_dir_path) {
            this.workflow_dir_path = workflow_dir_path;
        }
        this.logger = new workflow_logger(this)
    }

    public static get_workflow_realtime_tree_list(r_list: workflow_realtime_tree_list, worker: work_children) {
        for (const it of worker.jobs_map.values()) {
            const v = {
                name: it.name,
                extra_data: {running_type: it.running_type},
                code: it.code,
                children: []
            };
            if (it.steps) {
                const children: any[] = [];
                for (const step of it.steps ?? []) {
                    let name = ''
                    if (step.run) {
                        name = step.run
                    } else if (step["use-yml"]) {
                        name = step["use-yml"]
                    } else if (step["run-js"]) {
                        name = step["run-js"]
                    } else if (step["sleep"]) {
                        name = `sleep ${step.sleep}`
                    } else if (step["runs"]) {
                        name = JSON.stringify(step.runs)
                    }
                    const p = {
                        name: name,
                        extra_data: {running_type: step.running_type},
                        code: step.code,
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


    public async init(param?: {
        env?: any,
        // not_log?: boolean,
        yaml_data?: any,
        yaml_path?: string,
        filecat_user_id?: string,
        filecat_user_name?: string,
        filecat_user_note?: string,
        workflow_logger?: any,// 打印全部的结构
        pre_env?: any
    }) {
        if (param?.yaml_path) {
            this.yaml_path = param.yaml_path;
        }
        if (param?.workflow_logger) {
            this.logger = param.workflow_logger;
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
        if (param?.yaml_path)
            userService.check_user_path_by_user_id(this.user_id, param?.yaml_path);
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
                let p1 = p
                if (!path.isAbsolute(p)) {
                    p1 = path.join(path.dirname(this.yaml_path), p);
                }
                userService.check_user_path_by_user_id(this.user_id, p1);
                const d = await readYamlFile(p1);
                this.import_files_map.set(d.name, {yaml_path: p1, yaml_data: d});
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
        // file-env 处理
        if (yaml_data['file-env']) {
            for (const key of Object.keys(yaml_data['file-env'])) {
                let p1 = yaml_data['file-env'][key];
                if (!path.isAbsolute(p1)) {
                    p1 = path.join(path.dirname(this.yaml_path), p1);
                }
                userService.check_user_path_by_user_id(this.user_id, p1);
                this.env[key] = (await FileUtil.readFileSync(p1)).toString();
            }
        }
        return this;
    }

    // 运行jobs return_steps 不要保存数据而是返回成功失败
    public async run_jobs(return_steps = false) {
        const start_time = Date.now();
        await new Promise(resolve => {
            this.all_job_resolve = resolve;
            const v_List = [...this.jobs_map.values()]
            for (let i = 0; i < v_List.length; i++) {
                const job = v_List[i];
                // 并行执行多个job
                this.run_job(job).then(() => {
                })
            }
        })
        // console.log('全部执行完成')
        const all_jobs = []
        let failed = false;
        for (const it of this.jobs_map.values()) {
            all_jobs.push(it)
            if (it.code !== 0 && it.code !== undefined) {
                failed = true;
            }
        }
        this.close(failed ? running_type.fail : running_type.success)
        if (return_steps) {
            return {all_jobs, failed};
        }
        this.logger.send_all_wss(failed === true ? send_ws_type.done : undefined);
        this.running_type = failed === false ? running_type.success : running_type.fail;
        try {
            const base_data_util = new Base_data_util({base_dir: this.workflow_dir_path});
            await base_data_util.init();
            await base_data_util.insert(JSON.stringify({
                all_jobs
            }), JSON.stringify({
                name: this.name,
                "run-name": this["run-name"],
                is_success: failed === false,
                timestamp: formatter_time(new Date()),
                duration: `${((Date.now() - start_time) / 1000).toFixed(2)} s` // s 秒
            }));
        } catch (error) {
            console.log('插入数据库失败', error)
        }
    }

    // 完成job 以失败的方式
    private done_fail_job_handle(job: job_item, fail_message: string) {
        job.code = -1;
        this.logger.send_all_wss();
        job.message = fail_message;
        this.close();
        this.all_job_resolve("ok"); // 只要有一个失败 全部都失败 不再继续执行了
    }


    public async run_job(job: job_item) {
        try {
            let job_can_run = false
            if (!job.if) {
                job_can_run = true;
            } else {
                job_can_run = await workflow_util.run_js(job.if, this.env)
            }
            if (job_can_run) {
                workflow_util.handle_job_pre(job, this)
                // 某些 是否需要其它job执行完成 提前做个map
                if (job['need-jobs']) {
                    if (!workflow_util.all_jobs_done(job['need-jobs'], this)) {
                        // 没有全部完成
                        this.need_job_set.add(job)
                        return;
                    }
                }
                //可以开始执行了
                job.running_type = running_type.running;
                const start_time = Date.now();
                const process_runner = new WorkflowProcess(this, job);
                this.pty_shell_set.add(process_runner.pty);

                // 开始多个命令执行 有前后顺序的
                for (let i = 0; i < job.steps.length; i++) {
                    const step = job.steps[i];
                    if (step.if) {
                        if (!await workflow_util.run_js(step.if, this.env)) {
                            this.logger.send_all_wss();
                            continue;
                        }
                    }
                    step.running_type = running_type.running;
                    this.logger.send_all_wss();
                    if (step['sleep']) {
                        await CommonUtil.sleep(step['sleep']);
                    }
                    try {
                        if (step["run-js"]) {
                            await workflow_util.run_code_js_by_step(step, job, this.env)
                        } else if (step["use-yml"]) {
                            // 执行另一个文件
                            const yaml = this.import_files_map.get(step["use-yml"]);
                            if (step['with-env']) {
                                for (const key of Object.keys(step['with-env'])) {
                                    step['with-env'][key] = Mustache.render(`${step['with-env'][key] ?? ""}`, this.env);
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
                                workflow_logger: this.logger
                            });
                            this.worker_children_use_yml_map.set(step["use-yml"], worker);
                            const step_start_time = Date.now();
                            const r = await worker.run_jobs(true); //  只需要记录整个执行结果 日志不记录了
                            step.use_job_children_list = r.all_jobs
                            step.duration = `${((Date.now() - step_start_time) / 1000).toFixed(2)} s`;
                            if (r.failed) {
                                step.code = -1;
                                this.logger.send_all_wss();
                                throw ""
                            }
                            step.code = 0;
                            this.logger.send_all_wss();
                        } else if (step.run != null || step.runs != null) {
                            // 执行普通的 run
                            step.code = await process_runner.run_step(step)
                            if (step.code !== 0) {
                                // 终止后面的行为
                                throw step.message
                            }
                        } else {
                            // 只执行了sleep
                            step.code = 0;
                        }
                    } catch (e) {
                        if (step['catch-js'] != null && await workflow_util.run_js(step['catch-js'], this.env)) {
                            // 不做任何处理继续执行
                        } else {
                            throw e
                        }
                    }
                    if (step['then-log']) {
                        const log = Mustache.render(`${step['then-log'] ?? ""}`, this.env);
                        this.logger.running_log = log
                        if (!step.message) {
                            step.message = ''
                        }
                        step.message += log
                        this.logger.send_all_wss()
                        if (step['then-log-file']) {
                            const p = step['then-log-file']
                            let p1 = p
                            if (!path.isAbsolute(p)) {
                                p1 = path.join(path.dirname(this.yaml_path), p);
                            }
                            userService.check_user_path_by_user_id(this.user_id, p1);
                            await FileUtil.writeFileSync(p1, log);
                        }
                    }
                    if (step["while"] != null && this.running_type === running_type.running && await workflow_util.run_js(step["while"], this.env)) {
                        // 再执行一次
                        i--;
                        await CommonUtil.sleep(100);
                        continue;
                    }
                    this.logger.send_all_wss();
                }

                // step 全部处理完了
                this.pty_shell_set.delete(process_runner.pty);
                job.duration = `${((Date.now() - start_time) / 1000).toFixed(2)} s`;
            } else {
                job.duration = `0 s`;
            }
            if (job.while != null && this.running_type === running_type.running && await workflow_util.run_js(job.while, this.env)) {
                // 再执行一次自己
                workflow_util.reset_all_step_status(job)
                await CommonUtil.sleep(100);
                this.run_job(job);
                console.log('run again job')
                return
            }
            // 标记自己完成
            job.code = 0
            this.done_jobs.add(job.key);
            this.logger.send_all_wss();
            if (this.need_job_set.size) {
                // 判断need中是否有可以执行的了
                const v_List = [...this.need_job_set]
                for (let i = 0; i < v_List.length; i++) {
                    const job = v_List[i];
                    this.need_job_set.delete(job);
                    this.run_job(job).catch(e => {
                        throw e;
                    }).then(() => {
                    })
                }
            }
            if (this.done_jobs.size === this.jobs_map.size) {
                this.all_job_resolve("ok");
            }
        } catch (error) {
            if (job['catch-js'] != null && await workflow_util.run_js(job['catch-js'], this.env)) {
                // 不做任何处理继续执行
            } else {
                console.log('workflows job error ', error)
                this.done_fail_job_handle(job, typeof error === 'string' ? error : error?.message ?? JSON.stringify(error));
            }
        }
    }

    public close(type?: running_type) {
        this.running_type = type ?? running_type.fail
        for (const it of this.pty_shell_set) {
            it.close();
        }
        // 可以递归的关闭所有的 worker
        for (const worker of this.worker_children_use_yml_map.values()) {
            worker.close(type);
        }
        this.all_job_resolve("ok")
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
                    default: v.default,
                    options: v.options
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
        userService.check_user_path((data.wss as Wss).token, file_path)
        const v = work_exec_map.get(file_path);
        if (!v) {
            return;
        }
        v.logger.add_wss(data.wss as Wss);
        (data.wss as Wss).setClose(() => {
            v.logger.remove_wss(data.wss as Wss);
        })
    }

    public async workflow_get(data: WsData<WorkflowGetReq>) {
        const token: string = (data.wss as Wss).token;
        const pojo = data.context as WorkflowGetReq;
        const root_path = settingService.getFileRootPath(token);
        const dir_path = path.join(root_path, decodeURIComponent(pojo.dir_path), workflow_dir_name);
        userService.check_user_path((data.wss as Wss).token, dir_path)
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
        userService.check_user_path((data.wss as Wss).token, dir_path)
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
        userService.check_user_path((data.wss as Wss).token, dir_path)
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
        wss.dataMap.set("pre_path", parent);
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
