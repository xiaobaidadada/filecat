/**
 * get_background_process_output tool — 获取某个后台进程的输出
 *
 * 根据 PID 读取对应后台进程的 stdout/stderr 输出文件内容。
 * 返回输出文件路径和内容。
 */
import { ai_agent_params_type } from "./ai_agent.constant";
import { backgroundProcessManager } from "../background_process.manager";
import {FileUtil} from "../../file/FileUtil";

export const get_background_process_output_tool = async ({
    pid,
}: {
    pid: number;
}) => {
    const result = backgroundProcessManager.getProcessOutput(pid);
    if (!result) {
        return JSON.stringify({
            success: false,
            message: `进程 PID=${pid} 不存在或已被清理。`,
        });
    }

    const { output_file, running } = result;

    // 读取输出文件内容
    let content = "";
    try {
        if (await FileUtil.access(output_file)) {
            content = (await FileUtil.readFileSync(output_file)).toString();
            // 截断过长的输出
            const MAX_OUTPUT = 50000;
            if (content.length > MAX_OUTPUT) {
                content =
                    content.slice(content.length - MAX_OUTPUT) +
                    `\n\n[输出过长，已截断，完整内容见文件: ${output_file}]`;
            }
        }
    } catch (e: any) {
        return JSON.stringify({
            success: false,
            message: `读取输出文件失败: ${e.message}`,
            output_file,
        });
    }

    return JSON.stringify(
        {
            success: true,
            pid,
            running,
            output_file,
            output:
                content || (running ? "(进程正在运行，暂无输出)" : "(无输出)"),
        },
        null,
        2
    );
};

export const get_background_process_output_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "get_background_process_output",
        description:
            "获取某个后台命令进程的 stdout/stderr 输出内容。传入进程 PID，返回该进程的输出文件路径和当前已有的输出内容。",
        parameters: {
            type: "object",
            properties: {
                pid: {
                    type: "number",
                    description: "后台进程的 PID",
                },
            },
            required: ["pid"],
        },
    },
};
