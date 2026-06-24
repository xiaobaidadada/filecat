import {edit_file_tool} from "./edit_file";
import {list_files_tool, read_file_tool} from "./read";
import {exec_cmd_tool} from "./exec_cmd";
import {http_request_tool} from "./http_request";
import {search_docs_tool} from "./search_docs";
import {search_in_files_tool} from "./search_in_files";
import {create_fs_entry_tool} from "./create_fs_entry";
import {apply_patch_tool} from "./apply_patch";


export const Ai_agentTools = {
    // 读取文件
    read_file: read_file_tool,
    // 读取目录
    list_files: list_files_tool,
    // 修改文件 todo 使用替换修改完可以返回 diff
    edit_file: edit_file_tool,
    // 执行命令
    exec_cmd: exec_cmd_tool,
    // 搜索本地知识库
    search_docs: search_docs_tool,
    // 访问某个网页
    http_request: http_request_tool,
    search_in_files: search_in_files_tool,
    create_fs_entry: create_fs_entry_tool,
    apply_patch: apply_patch_tool
}

export type Ai_agentTools_type = keyof typeof Ai_agentTools;

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
    apply_patch: {
        get_name: () => "apply patch file",
        get_params: (args) => {
            return `path： ${args.path}`
        }
    },
};
