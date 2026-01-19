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

/**
 * AI Agent 消息角色类型
 */
export type AI_Agent_Role =
/** 系统消息，通常用于设定上下文、规则、系统指令等 */
    'system'
    /** 用户消息，表示用户输入或请求 */
    | 'user'
    /** 模型助手的回复消息，可能包含工具调用指令 */
    | 'assistant'
    /** 工具输出消息，表示模型调用工具后的结果 */
    | 'tool';

export class ai_agent_message_item {
    role:AI_Agent_Role;
    content:string;
    tool_call_id?: string;
}
export type ai_agent_messages = ai_agent_message_item[];