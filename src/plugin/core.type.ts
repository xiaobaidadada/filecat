
export interface plug_item {
    // 插件的路径
    path: string;
    note?: string;
    open:boolean;
    name:string;
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
    type:  'backend' | 'ai_tool';
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
    }
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

}

export const run_test = () => {
    console.log('Running test...');
}


// 插件要有 filecat_plugin 属性