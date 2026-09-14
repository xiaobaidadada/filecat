
/**
 * AI Tool 的 schema 类型（与 ai_agent.constant 中的定义保持一致，
 * 但不直接引用内部模块，以避免循环依赖）
 */
export interface AiToolSchema {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: any;
            required: string[];
        }
    }
}

export interface plug_item {
    // 插件的路径
    path: string;
    note?: string;
    open:boolean;
    name:string;
    params?:string;
}

export interface plug_css_item {
    label: string;
    path: string;
}

/**
 * 插件元信息
 */
export interface PluginMeta {
    /** 插件唯一标识 */
    id: string;
    /** 插件名称[cite: 4] */
    name: string;
    /** 插件版本[cite: 4] */
    version: string;
    /** 插件类型[cite: 4] */
    // type:  'backend' | 'ai_tool' | 'theme';
    /** 插件描述[cite: 4] */
    description?: string;
    /** 作者[cite: 4] */
    author?: string;
    /** 依赖的其他插件 ID 列表[cite: 4] */
    // dependencies?: string[];
    /** 插件申请的权限列表[cite: 4] */
    // permissions?: string[];

}

/**
 * 宿主程序提供的核心 API 上下文[cite: 4]
 */
export interface PluginContext {
    env: {
        port: number;
        work_dir: string;
        version:string;
    },
    params: { [key: string]: any };
}

/**
 * 插件自定义路由定义
 * 和系统自定义 API 路由一样的功能，让插件也能注册 HTTP 路由处理器
 */
export interface PluginRoute {
    /** 路由路径，必须以系统 API 前缀开头，例如 /api/plugin/my-route */
    router: string;
    /** 是否需要鉴权，默认 true */
    needAuth?: boolean;

    /**
     * 路由处理函数
     * @param req - Express Request 对象，插件自己读取 body、headers 等
     * @param res - Express Response 对象，插件自己控制响应
     * @returns 返回的内容会作为 HTTP 响应发送，返回 null/undefined 则不自动发送（由插件自己通过 res 发送）
     */
    handler: (req: import('express').Request, res: import('express').Response) => Promise<string | object | null | undefined>;
}

/**
 * 插件定义[cite: 4] 可以默认导出
 */
export interface Plugin {
    /** 插件元信息[cite: 4] */
    readonly meta: PluginMeta;

    /** 插件激活时调用，并注入宿主上下文[cite: 4] */
    activate(context: PluginContext): void | Promise<void>;

    /** 插件停用时调用[cite: 4] */
    deactivate?(): void | Promise<void>;


    /**
     * AI 工具定义列表
     * 每个工具包含 schema（给 LLM 的描述）和执行函数
     */
    tools?: AiToolItem[];

    css_list?: plug_css_item[];

    /**
     * 插件自定义 HTTP API 路由列表
     * 功能等同于系统的「自定义 API 路由」，handler 直接拿到 Request/Response
     */
    routes?: PluginRoute[];

    /**
     * 【登录鉴权回调】替代旧版的「自定义登录 auth」功能。
     * 用户登录时（密码校验之前）被调用：
     *   - 返回 true  ：放行登录，并为该用户签发 token（拥有用户全部权限）
     *   - 返回 false 或抛错：继续走系统默认的密码登录
     * 注意：多个插件同时注册时，任一插件返回 true 即视为通过。
     */
    login_auth?: (headers: any, req: import('express').Request) => Promise<boolean> | boolean;

    /**
     * 【shell 命令校验回调】替代旧版的「自定义 shell 命令校验」功能。
     * 用户执行 shell 命令前被调用，返回值语义（与 exec_type 一致）：
     *   -1  拒绝执行（reject）
     *    0  使用 child_process 执行
     *    1  使用 node-pty 执行
     *    2  不拦截，继续交给系统默认判断
     * 注意：多个插件同时注册时，按注册顺序依次调用，第一个不是「继续(2)」的返回值即生效。
     */
    shell_cmd_check?: (token: string, cmd: string, params: any[]) => Promise<number> | number;
}


/**
 * AI 工具项
 */
export interface AiToolItem {
    /** 工具 schema，用于向 LLM 描述工具（OpenAI function calling 格式） */
    schema: AiToolSchema;
    /** 工具执行函数，接收参数并返回结果 */
    handler: (args: any) => Promise<string | object>;
}

export const run_test = () => {
    console.log('Running test...');
}


// 插件要有 filecat_plugin 属性