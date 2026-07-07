/**
 * exec_cmd_background tool — 后台执行命令
 *
 * 在后台启动一个子进程执行命令，stdout/stderr 输出到文件。
 * 返回进程 PID 和输出文件路径。
 *
 * @param args.cmd 要执行的命令
 * @param args.cwd 工作目录（可选）
 * @param session_id 当前会话 ID
 */
import { ai_agent_params_type } from "./ai_agent.constant";
import { backgroundProcessManager } from "../background_process.manager";

export const exec_cmd_background_tool = async (
    { cmd, cwd }: { cmd: string; cwd?: string },
    session_id: string = "unknown"
) => {
    const info = backgroundProcessManager.execBackground(
        cmd,
        cwd || process.cwd(),
        session_id
    );

    return JSON.stringify(
        {
            success: true,
            message: `后台进程已启动，PID: ${info.pid}`,
            pid: info.pid,
            output_file: info.output_file,
            cmd: info.cmd,
            cwd: info.cwd,
            start_time: new Date(info.start_time).toISOString(),
            hint: "使用 list_background_processes 查看所有后台进程，使用 get_background_process_output 获取某个进程的输出",
        },
        null,
        2
    );
};

export const exec_cmd_background_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "exec_cmd_background",
        description:
            "在服务器上后台执行系统命令（启动子进程后立即返回，不等待命令完成）。stdout和stderr会被重定向到日志文件。适用于需要长时间运行的命令（如启动服务、长时间编译等）。使用 list_background_processes 查看进程状态，使用 get_background_process_output 获取输出。",
        parameters: {
            type: "object",
            properties: {
                cmd: {
                    type: "string",
                    description: "要后台执行的系统命令",
                },
                cwd: {
                    type: "string",
                    description: "命令执行的工作目录，默认是当前目录",
                },
            },
            required: ["cmd"],
        },
    },
};
