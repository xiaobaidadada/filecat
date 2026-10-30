import {SystemUtil} from "../../../sys/sys.utl";
import {register_session_cleaner} from "../session/session_cleanup";
import {ai_agent_params_type} from "../ai_agent.tools";
import {get_shell, get_shell_name, get_shells} from "../utils/shell/find_shell";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";

type exec_cmd_args = {
    cmd: string | string[];
    cwd: string;
    timeout?: number;
    shell?: string;
    use_shell?: boolean;
};
export const exec_cmd_tool = async (
    ctx: Ai_agent_tool_ctx,
    { cmd, cwd, timeout, shell, use_shell }: exec_cmd_args,
) => {
    const { session_id, command_env } = ctx;
    // 超时的语义就是终止命令，不会转成后台继续跑。
    // 不设默认超时：默认值容易误伤本来就耗时的任务；
    // 只有调用方明确给了 timeout 才计时。
    return SystemUtil.command(session_id, {cmd, cwd}, {
        timeout,
        shell,
        use_shell,
        extra_env: command_env,
    });
}

// 会话结束时杀掉这个会话还在运行的命令
register_session_cleaner("exec_cmd", (session_id) => {
    SystemUtil.kill_command(session_id);
});

/** 可用 shell 的描述，例如 bash(.exe 路径)、cmd 等 */
function shell_list_desc(): string {
    const all = get_shells();
    if (!all.length) {
        return "当前系统没有探测到任何可用的 shell，只能用 use_shell=false 直接执行可执行文件";
    }
    return all.map((p) => p.type).join("、");
}

export const exec_cmd_schema:ai_agent_params_type = {
    type: "function",
    function: {
        name: "exec_cmd",
        description: [
            `在服务器上执行系统命令，用于获取系统信息或执行系统操作。`,

            `当前系统可用的 shell 有：${shell_list_desc()}。`,
            `默认使用 ${get_shell_name()}，不指定 shell 时就是它。`,

            `不同 shell 语法不同，用错会被系统当成别的含义而不是报错，务必注意：`,

            `想执行 cmd 语法的命令就把 shell 指定为 cmd。`,

            `use_shell 设为 false 时不经过任何 shell，此时 cmd 必须传数组 [可执行文件, 参数1, 参数2...]，不接受字符串。适合执行确切的程序，参数可以逐项指定，不会被任何 shell 解释或分词。`,

            "优先使用专用工具而不是命令：读文件用 read_file（不要用 cat/head/tail），改文件用 edit_file（不要用 sed/awk），找文件用 list_files，搜内容用 search_in_files。",
            "不要用这个工具启动需要长期运行的服务或守护进程，用 exec_cmd_background。",
            "命令输出过长时只保留末尾部分，并会标注已截断。",
        ].join("\n"),
        parameters: {
            type: "object",
            properties: {
                cmd: {
                    anyOf: [
                        {type: "string"},
                        {type: "array", items: {type: "string"}},
                    ],
                    description: "要执行的命令。使用 shell 时传字符串（命令或脚本）；use_shell 为 false 时必须传数组 [可执行文件, 参数1, 参数2...]"
                },
                cwd: {
                    type: "string",
                    description: "命令执行的工作目录，不支持相对路径，如果没有设置这个值，你也没有指定绝对目录，这个值就是当前会话所在位置，活着当前filecat的process.cwd()值"
                },
                timeout: {
                    type: "number",
                    description: "可选，超时毫秒数。不传则不超时。超时后命令会被终止，不会转后台"
                },
                shell: {
                    type: "string",
                    enum: get_shells().map((p) => p.type),
                    description: `可选，指定用哪个 shell 执行。不传则用默认的 ${get_shell().type}`
                },
                use_shell: {
                    type: "boolean",
                    description: "可选，设为 false 表示完全不经过 shell，直接把 cmd 当可执行文件启动。"
                },
            },
            required: ["cmd"]
        }
    }
}
