import {base_data_record} from "./data.pojo";


export interface fileReq {
    files: string[]
}

export interface saveTxtReq {
    context: string
}

export interface cutCopyReq {
    files: string[],
    to: string
}

export interface fileInfoReq {
    name: string,
    newName: string;
    context?: string
}


export class workflow_pre_input {
    key: string; // 必须有
    description?: string; // 描述显示
    required?: boolean; // 是否必须要有
    default?: any; // 默认值
    options: any[];
}

export enum WorkRunType {
    start, // 开始
    stop // 结束
}

export class WorkflowReq {
    path: string;
    // token 已经可以通用获得了
    run_type: WorkRunType;

    inputs: workflow_pre_input[]; // 输入参数
}


export const workflow_dir_name = ".filecat_work_flows";

export enum running_type {
    not = 0,
    running = 1,
    success = 2,
    fail = 3
}

export interface step_item {
    // 这几个命令只能执行一个
    run: string; // 运行命令
    'use-yml': string; // 运行其它配置文件中的元素
    "run-js"?: string; // 纯执行js代码，可以操作环境变量
    runs?: string[] // 多个cmd命令一起直接被执行

    "catch-js"?: string;
    sleep?: number;

    "with-env": any; // use 使用的环境变量 覆盖对方的环境变量

    message?: string;

    duration?: string; // 运行时长
    code?: number; // 运行的结果 后面的可能都是空 因为没有执行

    use_job_children_list?: job_item[];

    running_type?: running_type;
    if?: string; // 配合 run
    while?: string; // 是否在执行一次

    "out-env"?: string; // run执行后输出的日志保存到这个变量

    "then-log-file"?: string; // 输出一些内容到这个文件
    "then-log"?: string;
}

export interface job_item {
    key: string; // 是job的key属性
    cwd: string;
    name: string;
    "need-jobs": string [] | undefined;
    steps: step_item[];
    // repl?: boolean;

    env: any
    "exclude-env"?: boolean; // 是否排除外部的env引入进来，默认不排除直接引入
    // 额外字段
    // fail_message?: string;
    // success_message?: string;
    message?: string;
    code?: number; // 完成的code

    duration?: string; // 运行时长

    running_type?: running_type; // 是否正在运行  空是不在运行，有值是正在运行，结果是code
    if?: string; // 执行js代码返回布尔值

    "run-js"?: string; // 纯执行js代码，可以操作环境变量
    while?: string; // 是否在执行一次
    "catch-js"?: string;
}

// 目录下所有正在执行的任务实时输出
export class WorkFlowRealTimeReq {
    dir_path: string;
}

export class WorkFlowRealTimeRsq {
    sucess_file_list: string[] = [];
    failed_file_list: string[] = [];
    running_file_list: string[] = [];
}

export class WorkFlowRealTimeOneReq {
    filename_path: string;

}


// 查询
export class WorkflowGetReq {
    dir_path: string;

    page_size: number;
    page_num: number;

    index: number; // 数据的索引 如果存在忽略 page参数

    search_name: string;

}

export type work_flow_record = base_data_record<
    {
        is_running: boolean, // 额外添加的对于正在运行中的
        name: string,
        "run-name": string,
        is_success?: boolean,
        duration?: number,
        timestamp?: string
    },
    {
        success_list?: job_item[],
        fail_list?: job_item[]
    }
>;

export class WorkflowGetRsq {
    list: work_flow_record[];
    total: number;
    one_data?: work_flow_record;
}


export class ws_file_upload_req {
    is_dir: boolean;
    file_path: string;
    file_full_path: string;
    chunk_index: number; // 当前块数
    total_chunk_index: number; // 总索引块数
    lastModified: number;
    part_count: number; // 1 2 3
    total_part_size: number; // 并发的总数
    size: number;
    parallel_done_num: number; // 总并发数量
}
