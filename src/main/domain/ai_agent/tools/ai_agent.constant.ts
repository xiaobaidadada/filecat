import {edit_schema} from "./edit_file";
import {list_files_schema, read_file_schema} from "./read";
import {exec_cmd_schema} from "./exec_cmd";
import {http_request_schema} from "./http_request";
import {search_in_files_schema} from "./search_in_files";
import {create_fs_entry_schema} from "./create_fs_entry";
import {apply_patch_schema} from "./apply_patch";
import {exec_cmd_background_schema} from "./exec_cmd_background";
import {list_background_processes_schema} from "./list_background_processes";
import {get_background_process_output_schema} from "./get_background_process_output";
import {sleep_schema} from "./sleep.tools";
import {getProcessAddon} from "../../bin/bin";
import {Ai_agentTools, tools_des_map} from "./ai_agent.tools";
import {kill_background_processes_schema, kill_background_processes_tool} from "./kill_background_processes";

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
    exec_cmd_background_schema,
    list_background_processes_schema,
    get_background_process_output_schema,
    http_request_schema,
    search_in_files_schema,
    create_fs_entry_schema,
    sleep_schema
    // apply_patch_schema
];


// 特殊处理
const kill_proc = getProcessAddon();
if(kill_proc) {
    ai_tools.push(kill_background_processes_schema)
    Ai_agentTools['kill_background_processes'] = kill_background_processes_tool
    tools_des_map['kill_background_processes'] = {
        sleep: {
            get_name: () => "kill background processes",
            get_params: (args) => {
                return `kill pid： ${args.pid}`
            }
        }
    }
}