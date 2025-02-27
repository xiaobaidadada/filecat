import {base_data_record} from "./data.pojo";


export interface fileReq {
    files:string[]
}

export interface saveTxtReq {
    context:string
}

export interface cutCopyReq {
    files:string[],
    to:string
}

export interface fileInfoReq {
    name:string,
    newName:string;
    context?:string
}



export enum WorkRunType {
    start, // 开始
    stop // 结束
}
export class WorkflowReq {
    path:string;
    // token 已经可以通用获得了
    run_type:WorkRunType;

}



export const workflow_dir_name = ".filecat_work_flows";

export enum running_type {
    not = 0,
    running= 1,
    success= 2,
    fail= 3
}
export interface step_item {
     run: string; // 运行命令
    'use-yml': string; // 运行其它配置文件中的元素
    "with-env": any; // use 使用的环境变量 覆盖对方的环境变量

    // 额外字段
    fail_message?: string;
    success_message?: string;

    duration?:string; // 运行时长
    code?:number; // 运行的结果 后面的可能都是空 因为没有执行

    use_job_children_list?:job_item[];

    running_type?: running_type;
    if?:string;
}

export interface job_item {
    key: string; // 是job的key属性
    cwd: string;
    name: string;
    "need-job": string | undefined;
    "sys-env":any; // 设置系统的token
    env:any; // 用于设置变量
    steps: step_item[];
    repl?:boolean;

    // 额外字段
    fail_message?: string;
    success_message?: string;
    code?:number; // 完成的code 整体 要么为0 要么为1

    duration?:string; // 运行时长

    running_type?: running_type; // 是否正在运行
    if?:string;
}

// 目录下所有正在执行的任务实时输出
export class WorkFlowRealTimeReq {
    dir_path:string;
}

export class WorkFlowRealTimeRsq {
    sucess_file_list:string[] = [];
    failed_file_list:string[] = [];
    running_file_list:string[] =  [];
}

export class WorkFlowRealTimeOneReq {
    filename_path:string;

}


// 查询
export class WorkflowGetReq {
    dir_path:string;

    page_size:number;
    page_num:number;

    index:number; // 数据的索引 如果存在忽略 page参数

    search_name:string;

}
export type work_flow_record = base_data_record<
    {
        is_running:boolean, // 额外添加的对于正在运行中的
        name:string,
        "run-name":string,
        is_success?:boolean,
        duration?:number,
        timestamp?:string},
    {
        success_list?:job_item[],
        fail_list?:job_item[]
    }
>;
export class WorkflowGetRsq {
    list:work_flow_record[];
    total:number;
    one_data?:work_flow_record;
}


export class ws_file_upload_req {
    is_dir:boolean;
    file_path:string;
    file_full_path:string;
    chunk_index:number; // 当前块数
    total_chunk_index:number; // 总索引块数
    lastModified:number;
    part_count:number; // 1 2 3
    total_part_size:number;
    size:number;
    parallel_done_num: number;
}