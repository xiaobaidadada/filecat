import {running_type} from "./file.req";
import {VirServerEnum} from "./net.pojo";

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

export interface env_item {
    path:string;
    note:string;
    open:boolean;
}

export class tcp_proxy_server_config {
    open:boolean;
    key?:string; // 废弃
    option_keys?:string[]
    port?:number;
}

export class tcp_proxy_client_item {
    proxy_host:string;
    proxy_port:number;
    note?:string;
    server_port:number;
    open:boolean;
}

export class tcp_proxy_bridge_fig_item {
    id?:string;

    server_port:number;
    server_client_num_id:number;
    server_client_name?:string;

    note?:string;
    open:boolean;

    client_num_id:number;
    client_proxy_port:number; // 作为客户端 请求的端口
    client_proxy_host:string; // 作为客户端要建立连接的ip
    client_name?:string;

}


export class tcp_proxy_server_client {
    // 服务器状态与配置
    index?:number;
    note?:string;
    status:boolean;
    // 客户端需要的配置
    proxy_fig_list:tcp_proxy_client_item[]= []
    // 客户端原本信息
    // client_id:string;
    client_num_id:number;
    client_name:string;
}

export class tcp_proxy_client_fig{
    client_name: string;
    // client_id?:string;
    client_num_id?:number;
    open: boolean = false;

    serverIp: string;
    serverPort: number;
    key: string = "";
}

export interface server_client_proxy {
    server_port:number;
    client_name:string;
    proxy_host:string;
    proxy_port:number;

    server_port_note?:string;
}

export interface workflow_setting_item {
    file_path:string;
    cron_str?:string; // cron定时器表达式 秒 分 时 日 月 星期
    sys_power_on?:boolean; // 开机就启动
    note?:string;
    user_id:string
    open:boolean
}