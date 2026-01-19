import {running_type} from "./file.req";

export interface NavIndexItem {
    name:string;
    url:string;
    index?:number
}


export interface tree_item<T=any> {
    name: string;
    children?: tree_item<T>[];
    extra_data?:T; // 额外的字段数据
    code?:number;
}

export type tree_list = tree_item[];

export type workflow_realtime_tree_list = tree_item<{
    running_type?: running_type;
}>[];

// 逻辑卷
export class lv_item {
    name:string;
    size:string; // 格式化展示大小
}

// 物理卷
export class pv_item {
    name:string;
    size:string; // 格式化展示大小
    free_size:string; // 可使用大小
}

// 卷组
export class vg_item {
    name:string;
    pv_cout:any; // 拥有的pv数量
    lv_count:any; // 拥有的逻辑卷数量
    size:string; // 格式化展示大小
    free_size:string; // 可使用大小
    lv_list:lv_item[] = [];
    pv_list:pv_item[] = [];
}

// ai
type AI_Agent_Role =
    'system' // 表示系统消息，用于设置上下文或给出指令，比如告诉AI它的角色或任务。
    | 'user' // 代表用户发送的消息，是AI需要处理的输入。
    | 'assistant'; //表示助手（如AI）发送的消息，是对用户消息的回应。
export class ai_agent_message_item {
    role:AI_Agent_Role;
    content:string;
    tool_call_id?: string;
}
export type ai_agent_messages = ai_agent_message_item[];