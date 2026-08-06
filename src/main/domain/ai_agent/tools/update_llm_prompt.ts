import {ai_agent_params_type} from "./ai_agent.constant";

/**
 * "更新 LLM 编辑提示词"工具。
 *
 * 使用说明：
 * - 当用户选择了某个系统提示词，且该系统提示词开启了 `llm_prompt_enable` 开关时，
 *   会在当前对话中向 LLM 注册本工具。
 * - LLM 在对话中可以对当前会话内容进行总结，通过调用本工具把总结结果写入
 *   所选系统提示词列表项的 `llm_prompt` 字段（全局保存），供之后的新会话沿用。
 * - 该工具的执行逻辑在 chat.core.ts 的 chat() 方法内部处理（因为需要定位到
 *   用户当前所选的具体系统提示词列表项），本文件只负责生成注册给 LLM 的 schema。
 *
 * 用户在设置页填写的"编辑规则"（llm_prompt_tip）会通过 llmPromptTip 参数传入，
 * 注入到工具的 description 与参数说明中，例如限制总结的 token 数量等。
 */

/**
 * 生成注册给 LLM 的 update_llm_prompt 工具 schema。
 *
 * @param llmPromptTip 用户在设置页为该系统提示词填写的编辑规则说明（可选）
 */
export function create_update_llm_prompt_schema(llmPromptTip?: string): ai_agent_params_type {
    const tip = (llmPromptTip ?? "").trim();
    return {
        type: "function",
        function: {
            name: "update_llm_prompt",
            description:
                `对本次会话内容进行总结，更新所选系统提示词的"LLM编辑提示词"内容。` +
                `当你觉得当前会话积累了大量有价值的信息（用户偏好、项目约定、上下文要点等）时，` +
                `调用本工具把总结要点写入提示词，使其作为后续对话的重要上下文持续生效，` +
                `写回的内容会保存在"系统会话提示词"列表项中，供之后的新会话沿用。` +
                (tip ? `\n编辑规则（用户要求）：${tip}` : "") +
                `\n建议：总结要简洁有条理，保留对后续对话最有用的上下文，避免冗余。`,
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: `总结后的提示词内容（纯文本），将写回系统提示词的"LLM编辑提示词"字段。要求：${tip || "简洁、要点明确、保留关键上下文"}`
                    },
                    note: {
                        type: "string",
                        description: "可选的简短说明，记录本次更新的原因（不会写入提示词，仅用于展示给用户看）"
                    }
                },
                required: ["content"]
            }
        }
    };
}
