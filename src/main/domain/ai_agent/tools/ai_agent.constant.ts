import {edit_schema} from "./edit_file";
import {list_files_schema, read_file_schema} from "./read";
import {exec_cmd_schema} from "./exec_cmd";
import {http_request_schema} from "./http_request";
import {search_in_files_schema} from "./search_in_files";
import {create_fs_entry_schema} from "./create_fs_entry";
import {apply_patch_schema} from "./apply_patch";

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

// 为ai提供有限的系统信息
export const ai_tools = [
    read_file_schema,
    list_files_schema,
    edit_schema,
    exec_cmd_schema,
    http_request_schema,
    search_in_files_schema,
    create_fs_entry_schema,
    // apply_patch_schema
];
