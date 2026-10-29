import {SystemUtil} from "../../../sys/sys.utl";
import {ai_agent_params_type} from "../utils/ai_agent.constant";
import {register_session_cleaner} from "../session/session_cleanup";

export const exec_cmd_tool = async (
    session_id: string,
    { cmd, cwd }: { cmd: string; cwd: string },
) => {
    return SystemUtil.command(session_id, {cmd, cwd})
}

// 会话结束时杀掉这个会话还在运行的命令
register_session_cleaner("exec_cmd", (session_id) => {
    SystemUtil.kill_command(session_id);
});

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
                    description: "命令执行的工作目录，不支持相对路径，如果没有设置当前工作目录，你也没有指定绝对目录，这个值就是当前filecat的process.cwd()值"
                },
            },
            required: ["cmd"]
        }
    }
}
