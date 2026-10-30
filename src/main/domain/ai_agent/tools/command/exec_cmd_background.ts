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
import { backgroundProcessManager } from "../../background_process.manager";
import {ai_agent_params_type} from "../ai_agent.tools";
import {get_shell, get_shell_name, get_shells} from "../utils/shell/find_shell";

export const exec_cmd_background_tool = async (
    session_id: string,
    { cmd, cwd, shell, use_shell }: { cmd: string | string[]; cwd?: string; shell?: string; use_shell?: boolean },
) => {
    const info = backgroundProcessManager.execBackground(
        cmd,
        cwd || process.cwd(),
        session_id,
        { shell, use_shell }
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
        description: [
            "在服务器上后台执行系统命令（启动子进程后立即返回，不等待命令完成）。stdout和stderr会被重定向到日志文件。适用于需要长时间运行的命令（如启动服务、长时间编译等）。",
            `可用 shell：${get_shells().map((p) => p.type).join("、") || "无"}，默认 ${get_shell_name()}。不同 shell 语法不同，注意别把 cmd 的语法丢给 bash。`,
            "使用 list_background_processes 查看进程状态，使用 get_background_process_output 获取输出。",
        ].join(""),
        parameters: {
            type: "object",
            properties: {
                cmd: {
                    anyOf: [
                        {type: "string"},
                        {type: "array", items: {type: "string"}},
                    ],
                    description: "要后台执行的命令。使用 shell 时传字符串；use_shell 为 false 时必须传数组 [可执行文件, 参数1, 参数2...]",
                },
                cwd: {
                    type: "string",
                    description: "命令执行的工作目录，默认是当前目录",
                },
                shell: {
                    type: "string",
                    enum: get_shells().map((p) => p.type),
                    description: `可选，指定用哪个 shell 执行。不传则用默认的 ${get_shell().type}`,
                },
                use_shell: {
                    type: "boolean",
                    description: "可选，设为 false 表示完全不经过 shell，直接把 cmd 当可执行文件启动",
                },
            },
            required: ["cmd"],
        },
    },
};
