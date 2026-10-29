import {edit_file_tool, edit_schema} from "./file/edit_file";
import {list_files_schema, list_files_tool, read_file_schema, read_file_tool} from "./file/read";
import {exec_cmd_schema, exec_cmd_tool} from "./command/exec_cmd";
import {http_request_schema, http_request_tool} from "./http/http_request";
import {ai_tools_search_docs, search_docs_tool} from "./doc/search_docs";
import {search_in_files_schema, search_in_files_tool} from "./file/search_in_files";
import {create_fs_entry_schema, create_fs_entry_tool} from "./file/create_fs_entry";
import {exec_cmd_background_schema, exec_cmd_background_tool} from "./command/exec_cmd_background";
import {list_background_processes_schema, list_background_processes_tool} from "./command/list_background_processes";
import {
    get_background_process_output_schema,
    get_background_process_output_tool
} from "./command/get_background_process_output";
import {sleep_schema, sleep_tool} from "./session/sleep.tools";
import {rename_file_schema, rename_file_tool} from "./file/rename_file";
import {pick_model_schema, pick_model_tool} from "./session/pick_next_model";
import {read_image_schema, read_image_tool} from "./file/read_image";
import {kill_background_processes_schema, kill_background_processes_tool} from "./command/kill_background_processes";


/**
 * 所有工具的统一签名。
 *
 * 第一个参数固定是会话 id，所有工具都要接收，用于：
 *  - 命令 / 后台进程按会话隔离
 *  - 文件读取状态按会话分桶
 *
 * 第二个参数是各工具自己的参数，形状由各工具自行定义，因此这里不约束。
 */
export type Ai_agent_tool_fn = (session_id: string, args: any) => any;


export type ai_agent_params_type = {
    type: string,
    function: {
        name: string,
        description: string,
        parameters: {
            type: string,
            properties: any,
            required: string[]
        }
    }
}

/**
 * 所有工具名。
 *
 * 显式声明而不是用 keyof typeof Ai_agentTools 推导：
 * 注册表若带索引签名，keyof 会变成 string | number，污染这个类型。
 */
export type Ai_agentTools_type =
    | "read_file"
    | "list_files"
    | "edit_file"
    | "exec_cmd"
    | "exec_cmd_background"
    | "list_background_processes"
    | "get_background_process_output"
    | "search_docs"
    | "http_request"
    | "search_in_files"
    | "create_fs_entry"
    | "sleep"
    | "rename_file"
    | "pick_model"
    | "read_image"
    | "kill_background_processes"
    ;

/**
 * 一个工具的完整登记项：执行函数 + 暴露给模型的 schema。
 *
 * 两者放在一起，保证每个工具一定同时具备「能执行」和「能声明」，
 * 不会出现注册了函数却忘记写 schema（或反过来）的情况。
 */
export type Ai_agent_tool_item = {
    fn: Ai_agent_tool_fn;
    schema: ai_agent_params_type;
};

export const Ai_agentTools: Record<Ai_agentTools_type, Ai_agent_tool_item> = {
    // 读取文件
    read_file: {fn: read_file_tool, schema: read_file_schema},
    // 读取目录
    list_files: {fn: list_files_tool, schema: list_files_schema},
    // 修改文件
    edit_file: {fn: edit_file_tool, schema: edit_schema},
    // 执行命令
    exec_cmd: {fn: exec_cmd_tool, schema: exec_cmd_schema},
    // 后台执行命令
    exec_cmd_background: {fn: exec_cmd_background_tool, schema: exec_cmd_background_schema},
    // 获取后台进程列表
    list_background_processes: {fn: list_background_processes_tool, schema: list_background_processes_schema},
    // 获取后台进程输出
    get_background_process_output: {fn: get_background_process_output_tool, schema: get_background_process_output_schema},
    // 搜索本地知识库
    search_docs: {fn: search_docs_tool, schema: ai_tools_search_docs},
    // 访问某个网页
    http_request: {fn: http_request_tool, schema: http_request_schema},
    search_in_files: {fn: search_in_files_tool, schema: search_in_files_schema},
    create_fs_entry: {fn: create_fs_entry_tool, schema: create_fs_entry_schema},
    sleep: {fn: sleep_tool, schema: sleep_schema},
    rename_file: {fn: rename_file_tool, schema: rename_file_schema},
    pick_model: {fn: pick_model_tool, schema: pick_model_schema},
    // 读取本地图片（转成 base64 交给模型看图片）
    read_image: {fn: read_image_tool, schema: read_image_schema},
    kill_background_processes: {fn: kill_background_processes_tool, schema: kill_background_processes_schema},
};

export const tools_des_map: Record<Ai_agentTools_type, {
    get_name: () => string,
    get_params: (args: any) => string,
}> = {
    edit_file: {
        get_name: () => "edit file",
        get_params: (args) => {
            return ` ${args.path} `
        }
    },
    exec_cmd: {
        get_name: () => "exe cmd",
        get_params: (args) => {
            return ` ${args.cmd} at ${args.cwd}`
        }
    },
    exec_cmd_background: {
        get_name: () => "exe cmd bg",
        get_params: (args) => {
            return ` ${args.cmd} at ${args.cwd}`
        }
    },
    list_background_processes: {
        get_name: () => "list bg proc",
        get_params: () => ""
    },
    get_background_process_output: {
        get_name: () => "get bg output",
        get_params: (args) => {
            return ` pid=${args.pid}`
        }
    },
    http_request: {
        get_name: () => "request http",
        get_params: (args) => {
            return `url is ${args.url}`
        }
    },
    list_files: {
        get_name: () => "query file dir",
        get_params: (args) => {
            return ` ${args.path}`
        }
    },
    read_file: {
        get_name: () => "read file",
        get_params: (args) => {
            return ` ${args.path}`
        }
    },
    search_docs: {
        get_name: () => "search docs",
        get_params: (args) => {
            return `keys： ${args.keywords?.join(" ")}`
        }
    },
    search_in_files: {
        get_name: () => "search in file",
        get_params: (args) => {
            return `path： ${args.path} pattern ${args.pattern}`
        }
    },
    create_fs_entry: {
        get_name: () => "create file",
        get_params: (args) => {
            return `path： ${args.path}`
        }
    },
    sleep: {
        get_name: () => "sleep",
        get_params: (args) => {
            return `sleep length： ${args.sleep_length}`
        }
    },
    rename_file: {
        get_name: () => "rename file",
        get_params: (args) => {
            return ` ${args.path} → ${args.newPath}`
        }
    },
    pick_model:{
        get_name: () => "pick model",
        get_params: (args) => {
            return `pick model： ${args.model}`
        }
    },
    read_image: {
        get_name: () => "read image",
        get_params: (args) => {
            return ` ${String(args.path ?? "").slice(0, 60)}`
        }
    },
    kill_background_processes:{
        get_name: () => "kill background processes",
        get_params: (args) => {
            return args?.pid
        }
    },
};

// 为ai提供有限的系统信息。
// 从注册表派生，因此不可能漏写或写错工具名。
// 注意：pick_model、read_image、search_docs 受运行时开关控制，由 chat.core 按条件追加，不在这里。
// 为ai提供有限的系统信息。
// 从注册表派生，新增工具自动带上，不会漏。
// 这三个受运行时开关控制，由 chat.core 按条件追加：
//   pick_model  模型切换开关
//   read_image  模型是否支持图片
//   search_docs 知识库开关
const dynamic_tools: Ai_agentTools_type[] = ["pick_model", "read_image", "search_docs"];

export const ai_tools: ai_agent_params_type[] = Object.entries(Ai_agentTools)
    .filter(([name]) => !dynamic_tools.includes(name as Ai_agentTools_type))
    .map(([, item]) => item.schema);
