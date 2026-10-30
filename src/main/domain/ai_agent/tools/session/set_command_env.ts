import {ai_agent_params_type} from "../ai_agent.tools";
import {ai_agentService} from "../../ai_agent.service";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";

type set_command_env_args = {
    /** 要设置的变量，k-v 形式 */
    env: Record<string, string>;
    /** true 表示整体替换现有配置；false（默认）表示按 key 合并覆盖 */
    replace?: boolean;
};

/**
 * 修改当前生效供应商的命令环境变量。
 * 只作用于当前供应商，不写全局配置，避免影响其它供应商。
 */
export const set_command_env_tool = async (
    ctx: Ai_agent_tool_ctx,
    {env, replace}: set_command_env_args,
) => {
    return ai_agentService.set_command_env(env ?? {}, replace === true);
}

export const set_command_env_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "set_command_env",
        description: [
            "设置执行命令时使用的环境变量。",
            "这里设置的变量会在你后续调用 exec_cmd / exec_cmd_background 执行命令时，覆盖到子进程的环境变量上。",
            "默认按 key 合并覆盖已有变量；replace 传 true 则用传入的 env 整体替换。",
        ].join(""),
        parameters: {
            type: "object",
            properties: {
                env: {
                    type: "object",
                    description: "要设置的环境变量，键值对形式，例如 {\"NODE_ENV\":\"production\"}。值会被转成字符串",
                    additionalProperties: {type: "string"},
                },
                replace: {
                    type: "boolean",
                    description: "是否整体替换现有配置，默认 false 表示只覆盖传入的这些 key",
                },
            },
            required: ["env"],
        },
    },
};
