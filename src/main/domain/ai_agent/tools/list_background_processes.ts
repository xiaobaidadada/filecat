/**
 * list_background_processes tool — 获取所有后台进程列表
 *
 * @param args.session_id 可选，按会话过滤
 * @param session_id 当前会话 ID（从 callTool 透传）
 */
import { ai_agent_params_type } from "./ai_agent.constant";
import { backgroundProcessManager } from "../background_process.manager";

export const list_background_processes_tool = async (
    session_id: string = "unknown"
) => {
    const effectiveSessionId = session_id;
    const processes = backgroundProcessManager.listProcesses(
        effectiveSessionId !== "unknown" ? effectiveSessionId : undefined
    );

    if (processes.length === 0) {
        return "当前没有正在运行的后台进程。";
    }

    // 返回格式化的进程列表
    const formatted = processes.map((p) => ({
        pid: p.pid,
        session_id: p.session_id,
        cmd: p.cmd,
        cwd: p.cwd,
        start_time: new Date(p.start_time).toISOString(),
        running: p.running,
        exit_code: p.exit_code,
        output_file: p.output_file,
    }));

    return JSON.stringify(
        {
            total: formatted.length,
            processes: formatted,
            hint: "使用 get_background_process_output 并传入 pid 获取某个进程的输出内容",
        },
        null,
        2
    );
};

export const list_background_processes_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "list_background_processes",
        description:
            "获取当前会话下所有正在运行的后台命令进程列表。返回每个进程的 PID、所属会话 ID、执行的命令、输出文件路径、运行状态等信息。",
        parameters: {
            type: "object",
            properties: {
            },
            required: [],
        },
    },
};
