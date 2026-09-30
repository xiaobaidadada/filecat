import {running_type} from "./file.req";

export interface NavIndexItem {
    name: string;
    url: string;
    index?: number
}


export interface tree_item<T = any> {
    name: string;
    children?: tree_item<T>[];
    extra_data?: T; // 额外的字段数据
    code?: number;
}

export type tree_list = tree_item[];

export type workflow_realtime_tree_list = tree_item<{
    running_type?: running_type;
}>[];

// 逻辑卷
export class lv_item {
    name: string;
    size: string; // 格式化展示大小
}

// 物理卷
export class pv_item {
    name: string;
    size: string; // 格式化展示大小
    free_size: string; // 可使用大小
}

// 卷组
export class vg_item {
    name: string;
    pv_cout: any; // 拥有的pv数量
    lv_count: any; // 拥有的逻辑卷数量
    size: string; // 格式化展示大小
    free_size: string; // 可使用大小
    lv_list: lv_item[] = [];
    pv_list: pv_item[] = [];
}

export interface env_item {
    path: string;
    note: string;
    open: boolean;
}

export class tcp_proxy_server_config {
    open: boolean;
    key?: string; // 废弃
    option_keys?: string[]
    port?: number;
}

export class tcp_proxy_client_item {
    proxy_host: string;
    proxy_port: number;
    note?: string;
    server_port: number;
    open: boolean;
}

export class tcp_proxy_bridge_fig_item {
    id?: string;

    server_port: number;
    server_client_num_id: number;
    server_client_name?: string;

    note?: string;
    open: boolean;

    client_num_id: number;
    client_proxy_port: number; // 作为客户端 请求的端口
    client_proxy_host: string; // 作为客户端要建立连接的ip
    client_name?: string;

}

/** 同步目标：一条任务可以配多个目标（客户端 + 目录 + 是否全量） */
export class tcp_proxy_sync_target {
    client_num_id: number;
    client_name?: string;
    dir: string;
    /** 该目标上线时是否递归全量同步一遍 */
    full_sync?: boolean;
}

export class tcp_proxy_sync_task_item {
    id?: string;

    source_client_num_id: number;
    source_client_name?: string;
    source_dir: string;

    /** 多目标同步配置 */
    targets?: tcp_proxy_sync_target[];

    /** 以下为旧单目标字段，保留兼容但不再使用 */
    target_client_num_id: number;
    target_client_name?: string;
    target_dir: string;

    open: boolean;
    note?: string;

    ignore_list?: string[] = [];
    ignore_text?: string

    delete_missing?: boolean = true;

    /** 旧字段：双向同步已移除 */
    two_way_sync?: boolean;

    running_num?: number; // 正在进行同步的文件数量

    /** 旧字段：全量同步已下沉到每个 target */
    full_sync?: boolean;
}

export const fault_ignore_text = `
node_modules
.venv
.gradle
.cache
vendor
`


export class tcp_proxy_server_client {
    // 服务器状态与配置
    index?: number;
    note?: string;

    // 客户端需要的配置
    proxy_fig_list: tcp_proxy_client_item[] = []
    // 客户端原本信息
    // client_id:string;
    client_num_id: number;
    client_name: string;

    status: boolean;
    client_remote_address?: string;
    online_start_time?: number;
    offline_time?: number;

    // 开启目标filecat的访问
    open_filecat?: boolean;
    // 访问filecat的时候使用本地前端
    filecat_use_local_page?: boolean;
    // 可以用 127.0.0.1:5567 的格式形式指定需要代理的地址
    filecat_proxy_host_port?: string;
}


export class tcp_proxy_client_fig {
    client_name: string;
    // client_id?:string;
    client_num_id?: number;
    open: boolean = false;

    serverIp: string;
    serverPort: number;
    key: string = "";

    note?: string;

    //  展示用的
    status?: boolean;

    is_new?: boolean;
    index?: number;

}

export class tcp_proxy_client_all_fig {
    list: tcp_proxy_client_fig[];
}

export interface server_client_proxy {
    server_port: number;
    client_name: string;
    proxy_host: string;
    proxy_port: number;

    server_port_note?: string;
    open_success: boolean // 服务器是否开启成功
}

export interface workflow_setting_item {
    file_path: string;
    cron_str?: string; // cron定时器表达式 秒 分 时 日 月 星期
    sys_power_on?: boolean; // 开机就启动
    note?: string;
    user_id: string
    open: boolean
}

export interface browser_file_pojo {

    fullPath: string;
    isDir: boolean;
    name: string;
    size: number
}


// 6MB
export const max_req_size = 6250000

export interface sys_env_pojo {
    web_site_title: string,
    show_login_user_info: boolean,
    http_proxy?: string
    // 网站 logo：http(s):// 开头视为远程 URL，其它视为服务器本地文件路径；为空使用内置默认 logo
    logo?: string
}

// md 编辑器全局设置（所有用户共用，由管理员在设置页调整）
// 尺寸类字段存成「数值+单位」的 CSS 字符串，单位由用户自己选（px/%/rem/em/vw），
// 例如 "1400px"、"80%"、"40rem"。直接塞进 CSS 变量用，不做二次换算。
export interface md_editor_setting_pojo {
    // 正文最大宽度
    content_max_width: string
    // 正文左右内边距
    content_padding: string
    // 正文字号
    font_size: string
    // 行高（无单位倍数，如 "1.8"）
    line_height: string
    // 当前启用的主题 id，空字符串表示不使用主题（走编辑器自带外观）
    theme: string
    // 自动保存间隔（秒），0 表示关闭自动保存
    auto_save_interval: number
}

// md 编辑器设置的默认值 —— 唯一定义处，前后端都从这里取，禁止各写一份。
// 后端用它给缺失字段兜底，前端的初值、placeholder、恢复默认按钮也都用它。
export const MD_EDITOR_SETTING_DEFAULT: md_editor_setting_pojo = {
    // 用百分比：跟随编辑区宽度自适应，窄屏不会有横向滚动，宽屏也不会撑太开
    content_max_width: "70%",
    // 边距也用百分比，随宽度缩放，避免窄屏上留白占比过大
    content_padding: "4%",
    font_size: "16px",
    line_height: "1.8",
    // 默认不启用主题：空字符串保持编辑器原本外观，也不会去请求主题内容
    theme: "",
    // 默认每 5 秒检测一次改动并静默保存
    auto_save_interval: 5,
};

// md 编辑器主题。
// 主题就是一个 css 文件（<主题名>.css），列表接口只返回主题名，不返回 css 正文。
export interface md_theme_item {
    id: string;      // 主题名，同时是主题目录下 css 文件名（不含扩展名）
}
