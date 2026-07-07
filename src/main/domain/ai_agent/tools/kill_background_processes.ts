/** 关闭当前会话指定后台进程（含子进程），使用 node-process-watcher 递归杀进程树 */
import {ai_agent_params_type, ai_tools} from "./ai_agent.constant";
import { backgroundProcessManager } from "../background_process.manager";
import { getProcessAddon } from "../../bin/bin";
import {Ai_agentTools, tools_des_map} from "./ai_agent.tools";
const kill_proc = getProcessAddon();

export const kill_background_processes_tool = async (
    args: { pid: number },
    session_id: string = "unknown"
) => {
    const pid = args.pid;
    if (!pid || typeof pid !== "number") {
        return "错误：请提供有效的进程 pid。";
    }

    const effectiveSessionId = session_id !== "unknown" ? session_id : undefined;
    const processes = backgroundProcessManager.listProcesses(effectiveSessionId);
    const target = processes.find((p) => p.pid === pid);

    if (!target) {
        return `错误：pid ${pid} 不属于当前会话，或进程已退出。当前会话可用 pid: ${processes.map(p => p.pid).join(", ") || "无"}`;
    }


    try {
        // kill_process(pid, true) — 第二个参数 true = 递归杀子进程
        kill_proc.kill_process(pid, true);
        return `已成功关闭进程 pid=${pid}（命令: ${target.cmd}），包括其所有子进程。`;
    } catch (e: any) {
        return `关闭进程 pid=${pid} 失败: ${e.message}`;
    }
};

export const kill_background_processes_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "kill_background_processes",
        description:
            "关闭当前 AI 聊天会话中指定的后台进程（包括其所有子进程）。只能关闭当前会话中通过 exec_cmd_background 启动的进程。需要传入目标进程的 pid。",
        parameters: {
            type: "object",
            properties: {
                pid: {
                    type: "number",
                    description: "要关闭的后台进程 pid（从 list_background_processes 获取）",
                },
            },
            required: ["pid"],
        },
    },
};


