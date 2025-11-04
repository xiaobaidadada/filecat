import {job_item, running_type, step_item} from "../../../../common/req/file.req";
import needle from "needle";
import vm from "node:vm";
import path from "path";
import {work_children} from "./workflow.service";
import {userService} from "../../user/user.service";

const Mustache = require('mustache');


const frozenEnv = Object.freeze({...process.env});
const sandbox = {
    needle: needle, // needle http 请求工具
    fetch,
    sys_env: frozenEnv
    // fs: fs,
    // path: path,
};

export class workflow_util {

    // 不管结果
    public static async run_js(js_code: string, filecat_env: any) {
        js_code = Mustache.render(js_code, filecat_env ?? {});
        const sandbox_context = vm.createContext({
            ...sandbox,
            "filecat_env": filecat_env
        }); // 创建沙箱上下文
        try {
            let r;
            const result = vm.runInContext(js_code, sandbox_context)
            if (result && typeof result.then === 'function') {
                r = !!(await result);
            } else {
                r = !!result;
            }
            return r;
        } catch (e) {
            console.log(e)
            return false;
        }
    }

    // 保存结果
    public static async run_and_get_code(js_code: string, filecat_env: any) {
        js_code = Mustache.render(js_code, filecat_env ?? {});
        const sandbox_context = vm.createContext({
            ...sandbox,
            "filecat_env": filecat_env
        }); // 创建沙箱上下文
        try {
            let r;
            const result = vm.runInContext(js_code, sandbox_context)
            if (result && typeof result.then === 'function') {
                r = !!(await result);
            } else {
                r = !!result;
            }
            return {
                r,
                js_code
            }
        } catch (e) {
            console.log(e)
            return {
                r: false,
                js_code,
                message: typeof e === "string" ? e : e?.message ?? JSON.stringify(e),
            }
        }
    }

    // 执行Js
    public static async run_code_js_by_step(step: step_item, job: job_item, env, ignore_return: boolean = false) {
        const step_start_time = Date.now();
        const code_r = await workflow_util.run_and_get_code(step['run-js'], env)
        if(!step['hidden-param']) {
            step['run-js'] = code_r.js_code
        }
        step.duration = `${((Date.now() - step_start_time) / 1000).toFixed(2)} s`;
        if ((code_r.r || ignore_return === true) && code_r.message == null) {
            step.code = 0;
            job.code = 0;
        } else {
            step.code = -1;
            step.message = code_r.message
            job.code = -1;
            throw step.message
        }
    }

    // 处理 job的前置操作
    public static handle_job_pre(job: job_item, instance: work_children) {
        // 处理 cwd 目录
        job.cwd = Mustache.render(job.cwd ?? "", instance.env);
        // 目录处理判断
        if (!path.isAbsolute(job.cwd)) {
            job.cwd = path.join(path.dirname(instance.yaml_path), job.cwd)
            // this.done_fail_job_handle(job, "cwd not absolute")
            // // 参数错误
            // return;
        }
        userService.check_user_path_by_user_id(instance.user_id, job.cwd);
    }

    // 判断所有的jobs是否完成
    public static all_jobs_done(jobs: string[], instance: work_children) {
        for (const job of jobs) {
            if (!instance.done_jobs.has(job)) {
                return false
            }
        }
        return true
    }


    public static reset_all_step_status(job: job_item) {
        for (const step of job.steps) {
            delete step.code
            delete step.running_type
            delete step.message
        }
    }
}