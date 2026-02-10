export enum TokenTimeMode {
    close,
    length,//指定长度
    forver // 永不过期
}

export class TokenSettingReq {
    mode: TokenTimeMode;
    length: number; // 秒
}

export class FileSettingItem {
    path: string;
    default: boolean = false;
    note: string;
    index: number;
}

export class ai_agent_Item {
    token: string;
    open: boolean = false;
    note: string;
    index: number;
    url: string;
    model: string;
    json_params?: string;
    sys_prompt?: string;

    dotenv?: string;
}

export class ai_docs_item {
    dir:string;
    open: boolean = false;
    note: string;
}

export class ai_docs_setting {
    list:ai_docs_item[];
    param:''
}
export class ai_docs_setting_param {
    docs_max_num = 5
    force_use_local_data = false;
}

export const ai_docs_setting_param_default = `
# 获取最多文章数量
docs_max_num=5
# 强制每次聊天前都执行本地知识库搜索
force_use_local_data=false
`

export class ai_agent_item_dotenv {
    tool_error_max = 1 ; // 工具报错最大尝试次数
    tool_call_max = 5; // 工具最多调用次数
    char_max = 12000; // 单轮请求字符最大数量，多了会截断
    messages_show_max = 100; // 聊天消息最多展示多少条
    messages_current_max = 100; // 聊天消息最多发送最近的多少条去请求（这些设置更能节省token）
}
export const ai_agent_item_dotenv_default = `
# 工具报错最大尝试次数
tool_error_max=1
# 工具最多调用次数
tool_call_max=5
# 单轮请求字符最大数量，多了会截断前面的
char_max=12000
# 聊天消息最多展示多少条
messages_show_max=100
# 聊天消息最多发送最近的多少条去请求（这些设置更能节省token）
messages_current_max=100
`
export const json_params_default = JSON.stringify({
    stream: false
})

export class QuickCmdItem {
    cmd: string;
    note: string;
    index?: number;
    father_index?: number;
}

export class FileQuickCmdItem {
    file_suffix: string;
    cmd: string;
    note: string;
    params: string;
}

export enum SysSoftware {
    ffmpeg = "ffmpeg",
    smartmontools = "smartmontools",
    ntfs_3g = "ntfs_3g"
}

export class SysSoftwareItem {
    id: SysSoftware;
    installed: boolean; // 是否安装
    path?: string; // 如果没有在path环境变量内可以使用这个
}

export class systemdPojo {
    name: string;
    load_state: string; // 装载状态
    active_state: string; // 激活状态
    unit_state: string; // 存活状态
    comm: string; // 执行命令
    user: string; // 所属用户
    isSys: boolean; // 是系统创建的(或者加入到filecat监管的)
}

// 系统设置类型
export const enum sys_setting_type {
    auth,
    cmd,
    cyc, // 垃圾站
    sys_env
}

export interface dir_upload_max_num_item {
    path: string,
    user_upload_num?: number, // 单个用户最大并发数量
    sys_upload_num?: number, // 系统最大并发数量

    open_ws_file?: boolean, // 开启用ws处理大文件 也就是断点传输 和分块
    ws_file_standard_size?: number, // 大文件判断的标准大小
    ws_file_parallel_num?: number, // 并发的ws数量
    ws_file_block_mb_size?: number, // 文件的块大小 用 Mb做单位

    index?: number,
    note?: string,
}
