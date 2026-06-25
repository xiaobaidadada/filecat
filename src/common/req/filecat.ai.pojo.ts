

export class ai_docs_item {
    dir: string;
    auto_load: boolean = false;
    note?: string;
}

export class ai_docs_setting {
    list: ai_docs_item[];
    param: string

    // 临时用
    docs_update_tag?: boolean
}

export class ai_docs_load_info {
    progress: any = "100"
    num: number = 0;
    size: number = 0;
    char_num: number = 0;
    total_num: number = 0;
    consume_time_ms_len: number = 0;

    init_statics(total_num: number) {
        this.progress = 0;
        this.num = 0;
        this.size = 0;
        this.char_num = 0;
        this.total_num = total_num
        this.consume_time_ms_len = 0;
    }
}

export class ai_docs_setting_param {
    docs_max_char_num = 10000
    dir_recursion_depth = 10
    ignore_dir: string | string[] = ["node_modules", ".git", "*.pdf", "*.dll", "build", ".ieda", "package-lock.json", "*.zip", "*.exe", "*.rar", "*.gz", "*.lock", "*.png", "images", "*.woff2", "*.svg", "*.webp", "*.jpg"]
    max_file_num = 5000
    max_file_byte_size = 20_000_000
    max_file_concurrency = 2
    await_time_ms_len = 500
    await_file_num = 100
    use_zh_segmentation = true
    allow_file_path = ["*.txt", "*.md", "*.html", "*.js", "*.ts", "*.tsx", "*.json", "*.csv", "*.xml", "*.css", "*.java", "*.go", "*.php", "*.c", "*.cc", "*.cpp", "*.h", "*.py"]
    index_storage_type: 'sqlite' | 'memory' = 'memory'
}

export const ai_docs_setting_param_default = `
# 获取的最多字符数量 优先级大于docs_max_char_num
docs_max_char_num=10000
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

export class ai_agent_option_item {
    value:string;
    label:string;
}

export class ai_agent_option_item_extra {
    options_agent_url_list?:ai_agent_option_item[]
    options_agent_key_list?:ai_agent_option_item[]
    options_agent_model_list?:ai_agent_option_item[]
}

/**
 * 请求类型枚举
 * - completions: 标准对话/聊天补全 (chat/completions)
 * - images:      图片生成 (images/generations)
 * - audio_speech: 文本转语音 (audio/speech)
 * - audio_transcription: 语音转文字 (audio/transcriptions)
 * - audio_translation: 语音翻译 (audio/translations)
 * - embeddings:  向量嵌入 (embeddings)
 */
export type LLMRequestType =
    | 'completions'
    | 'images'
    | 'audio_speech'
    | 'audio_transcription'
    | 'audio_translation'
    | 'embeddings';

export class ai_agent_Item {
    token: string;
    open: boolean = false;
    note: string;
    index: number;
    url: string;
    model: string;
    /** 请求类型，默认 completions 现在只用于动态拼凑 llm 的 url */
    request_type?: LLMRequestType;
    json_params?: string;
    sys_prompt?: string;

    dotenv?: string = '';

    /** 是否将此 model 注册为一个 tool，供 AI agent 在对话中动态调用 */
    tool_mode?: boolean = false;

    // show time
    show_options?:ai_agent_option_item_extra

    public static get_label_by_v(v?:string,list?:ai_agent_option_item[]) {
        if(!v || !list?.length) return v;
        for (const i of list) {
            if(i.value === v) return i.label;
        }
        return v;
    }

    public static have_label_by_v(v?:string,list?:ai_agent_option_item[]) {
        if(!v || !list?.length) return false;
        for (const i of list) {
            if(i.value === v) return true;
        }
        return false;
    }
}

export class ai_agent_item_dotenv extends ai_agent_option_item_extra{
    tool_error_max = 50; // 工具报错最大尝试次数
    tool_call_max = 300; // 聊天循环最大次数
    // char_max = 12000; // 单轮请求字符最大数量，多了会截断
    // messages_current_max = 100; // 聊天消息最多发送最近的多少条去请求（这些设置更能节省token）
    allow_exec_cmd_directly = false; // 是否允许AI直接执行命令而不需要用户确认
    proxy_url?: string;
}

export const ai_agent_item_dotenv_default = `

# 工具报错最大尝试次数
tool_error_max=50
# 聊天循环最大次数
tool_call_max=300
# 是否允许AI直接执行命令而不需要用户确认，默认为false，需要用户手动确认，如果使用 workflow 这里等价于为 true
allow_exec_cmd_directly=false

# 可选的代理 url，如果指定了所有访问大模型的请求将会走代理
#proxy_url=

# 可选的多个url 以数组分割
# options_agent_url_list=[{"value":"http://..","label":"openai"}]

# 可选的多个 key
# options_agent_key_list=[{"value":"sh-aaa","label":"option1"}]

# 可选的多个 model
# options_agent_model_list=[{"value":"gpt-5.5","label":"gpt"}]

`

export class ai_mcp_server_item {
    name: string;
    open: boolean = false;
    note?: string;
    index?: number;
    transport: "stdio" | "http" = "stdio";
    command: string;
    args?: string;
    cwd?: string;
    env?: string = "";
    endpoint?: string = "";
    headers?: string = "";
    // stream?: boolean = false;
    timeout_ms?: number = 10000;
}

export class ai_mcp_server_tool_item {
    runtime_name: string;
    tool_name: string;
    display_name: string;
    description?: string;
    input_schema?: any;
}

export class ai_mcp_server_tool_group {
    index: number;
    key: string;
    name: string;
    note?: string;
    transport: "stdio" | "http" = "stdio";
    open: boolean = false;
    loaded: boolean = false;
    tool_count: number = 0;
    tools: ai_mcp_server_tool_item[] = [];
    error?: string;
}

export class ai_mcp_setting {
    list: ai_mcp_server_item[];
}

export const json_params_default = JSON.stringify({
    "stream": true,
    "thinking": {"type": "disabled"}
})

export class ai_system_prompt_item {
    prompt: string;
    note: string;
    index?: number;
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

export class ai_agent_message_attachment_item {
    name: string;
    mime_type?: string;
    size: number;
    kind?: "text" | "image" | "binary";
    content: string;
}

/**
 * 多模态内容项 - 文本类型
 */
export type ai_agent_content_text = {
    type: "text";
    text: string;
};

/**
 * 多模态内容项 - 图片类型（URL或base64）
 */
export type ai_agent_content_image = {
    type: "image_url";
    image_url: { url: string }; // todo 进行真实url 更省token
};

/**
 * 多模态内容项
 */
export type ai_agent_content_part = ai_agent_content_text | ai_agent_content_image;

/**
 * 消息内容：可以是纯文本字符串，也可以是多模态内容数组
 */
export type ai_agent_content = string | ai_agent_content_part[];

export class ai_agent_message_item {
    role: AI_Agent_Role;
    content: ai_agent_content;
    tool_call_id?: string;
    attachments?: ai_agent_message_attachment_item[];

    // ============ 多模态结果字段（前端自判断） ============
    /** 图片生成结果（OpenAI 格式 images/generations 的 response.data） */
    images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    /** 音频数据（base64 或 URL） */
    audio?: { data?: string; url?: string; mime_type?: string };
    /** Embeddings 向量数据 */
    embeddings?: { data: Array<{ embedding: number[]; index: number }>; usage?: { total_tokens?: number } };
}

/** 获取消息内容的字符串表示（用于标题、存储、统计等场景） */
export function getContentAsString(content: ai_agent_content): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map(part => part.type === 'text' ? part.text : `[图片]`)
            .join('\n');
    }
    return '';
}

/** 获取内容长度（用于字符统计） */
export function getContentLength(content: ai_agent_content): number {
    if (typeof content === 'string') {
        return content.length;
    }
    if (Array.isArray(content)) {
        return content.reduce((sum, part) => {
            if (part.type === 'text') return sum + part.text.length;
            if (part.type === 'image_url') return sum + (part.image_url.url?.length ?? 0);
            return sum;
        }, 0);
    }
    return 0;
}

export type ai_agent_messages = ai_agent_message_item[];

export class ai_agent_chat_session_item {
    id: string;
    title: string;
    messages: ai_agent_message_item[] = [];
    summary: string = "";
    // 长期记忆
    long_term_memory: string = "";
    source?: "web" | "cli" | "robot_qq";
    created_at: number;
    updated_at: number;
    // 字符消耗统计
    usage_stats?: ai_agent_usage_stats;
}

/** AI Agent 字符消耗统计 */
export class ai_agent_usage_stats {

    /** AI 输出的总字符数 */
    output_chars: number = 0;
    // 最近一轮的
    recent_output_chars: number = 0;
    /** AI 输入总字符 */
    input_chars: number = 0;
    // 最近一轮的
    recent_input_chars: number = 0;
    /** 对话轮次 */
    turns: number = 0;
}

export class ai_agent_chat_session_meta {
    id: string;
    title: string;
    message_count: number;
    summary?: string;
    long_term_memory?: string;
    source?: "web" | "cli" | "robot_qq";
    created_at: number;
    updated_at: number;
    usage_stats?: ai_agent_usage_stats;
}

// ============ 机器人配置 ============

/** 机器人平台类型 */
export type RobotPlatform = 'qq';

/** 单个机器人配置 */
export class ai_rebot_item {
    /** 机器人平台 */
    platform: RobotPlatform = 'qq';
    /** 机器人名称/备注 */
    name: string = '';
    /** 是否开启 */
    open: boolean = false;
    /** QQ机器人 appId */
    appId: string = '';
    /** QQ机器人 clientSecret */
    clientSecret: string = '';
    /** 备注 */
    note?: string;
    /** 索引 */
    index?: number;
    /** 运行时状态 */
    _status?: 'connecting' | 'connected' | 'disconnected' | 'error';
    _status_msg?: string;
}

/** 机器人配置存储结构 */
export class ai_rebot_setting {
    list: ai_rebot_item[] = [];
}