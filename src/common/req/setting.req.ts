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
    note?: string;
}

export class ai_docs_setting {
    list:ai_docs_item[];
    param:''
}

export class ai_docs_load_info {
    progress :any = "100"
    num:number = 0;
    size:number = 0;
    char_num:number = 0;
    total_num:number = 0;
    consume_time_ms_len:number = 0;

    init() {
        this.progress = 0;
        this.num = 0;
        this.size = 0;
        this.char_num = 0;
        // this.total_num = 0
        this.consume_time_ms_len = 0;
    }
}
export class ai_docs_setting_param {
    docs_max_char_num = 10000
    force_use_local_data = false;
    dir_recursion_depth = 10
    ignore_dir:string|string[] = ["node_modules",".git","*.pdf","*.dll","build",".ieda","package-lock.json","*.zip","*.exe","*.rar","*.gz","*.lock","*.png","images","*.woff2","*.svg","*.webp","*.jpg"]
    max_file_num = 5000
    max_file_byte_size = 20_000_000
    max_file_concurrency = 2
    await_time_ms_len=500
    await_file_num=100
    use_zh_segmentation = true
    allow_file_path = ["*.txt","*.md","*.html","*.js","*.ts","*.tsx","*.json","*.csv","*.xml","*.css","*.java","*.go","*.php","*.c","*.cc","*.cpp","*.h","*.py"]
    index_storage_type:'sqlite'|'memory'='memory'
}
export const ai_docs_setting_param_default = `
# 获取的最多字符数量 优先级大于docs_max_char_num
docs_max_char_num=10000
# 强制每次聊天前都执行本地知识库搜索，建议在模型的系统提示词中设置，让AI每次都调用本地知识库搜索，会更加精准
force_use_local_data=false
# 读取知识库目录的时候，递归最大深度
dir_recursion_depth=10
# gitignore类型的忽略表达式，用于忽略某些文件不被索引，也支持数组 ["abc","node_modules"]
ignore_dir=["node_modules",".git","*.pdf","*.dll","build",".ieda","package-lock.json","*.zip","*.exe","*.rar","*.gz","*.lock","*.png","images","*.woff2","*.svg","*.webp","*.jpg","*.jpeg"]
# 只允许符合条件的目录，非文本内容加载在中文分词情况下特别消耗cpu
allow_file_path=["*.txt","*.md","*.html","*.js","*.ts","*.tsx","*.json","*.csv","*.xml","*.css","*.java","*.go","*.php","*.c","*.cc","*.cpp","*.h","*.py"]
# 加载最多文件数量
max_file_num=5000
# 可以加载的文件最大大小 默认是20MB 单位是字节
max_file_byte_size=20000000
# 文件加载最大并发数量 太大的话会影响机械硬盘的性能
max_file_concurrency=2
# 需要等待的目录时间间隔单位是毫秒，会让系统有时间释放临时内存
await_time_ms_len=500
# 配合await_time_ms_len读取多少个文件后进行等待
await_file_num=100
# 使用中文分词
use_zh_segmentation=true
# 索引的存储类型 memory sqlite
index_storage_type=memory
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
