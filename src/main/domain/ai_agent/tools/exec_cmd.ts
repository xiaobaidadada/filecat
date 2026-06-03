import {SystemUtil} from "../../sys/sys.utl";
import {ai_agent_params_type} from "./ai_agent.constant";


export const exec_cmd_tool = async ({cmd, cwd}: { cmd: string, cwd: string }) => {
    return SystemUtil.execAsync(cmd, cwd)
}

export const exec_cmd_schema:ai_agent_params_type = {
    type: "function",
    function: {
        name: "exec_cmd",
        description: "在服务器上执行系统命令，从而获取系统的信息，或者执行一些系统功能，要区分不同系统支持的命令情况，使用child_process的exec来执行不使用shell",
        parameters: {
            type: "object",
            properties: {
                cmd: {
                    type: "string",
                    description: "要执行的系统命令"
                },
                cwd: {
                    type: "string",
                    description: "命令执行的工作目录，默认是当前目录"
                },
            },
            required: ["cmd"]
        }
    }
}