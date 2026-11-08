/**
 * ask_user tool — AI 主动向用户提问
 *
 * 机制与命令确认完全一致：调用时抛 AskUserPending，本轮暂停并把当前 tool_call 悬空落盘。
 * 用户在卡片上填写后重新发起一轮，chat() 检测到悬空的 tool_call 会重新调用本工具，
 * 这次带上用户的答案直接返回结果 —— 对模型来说就是一次普通的工具调用。
 */
import {Ai_agent_tool_ctx, ai_agent_params_type} from "../ai_agent.tools";
import {AskUserPending} from "../../ask_user.pending";

/**
 * AI 主动向用户提问。
 *
 * 参数结构：
 *   title       对话框标题
 *   description 可选说明
 *   fields[]    要问的字段列表，每项 {key, label, type, options?, required?, placeholder?, multiline?}
 *
 * 工具本身不接答案：答案由 chat() 在恢复悬空调用时读回来，通过 ctx.ask_answer 传入。
 */
export const ask_user_tool = async (
    ctx: Ai_agent_tool_ctx,
    args: {
        title?: string;
        description?: string;
        fields?: any[];
    },
) => {
    const fields = Array.isArray(args.fields) ? args.fields : [];
    if (fields.length === 0) {
        throw new Error("ask_user 至少需要一个 fields 输入项，否则没有可问的内容");
    }

    // 没有前端连接就没法让用户回答，直接报错让模型改用普通消息
    if (!ctx.wss) {
        throw new Error("当前没有可用的前端连接，无法向用户提问；请改用普通消息提问");
    }

    // 抛出待确认信号：上层会把当前 tool_call 悬空落盘并结束本轮
    throw new AskUserPending({
        role: "assistant",
        message_type: "ask_user",
        content: "",
        _interrupted: true,
        ask_user: {
            ask_id: `ask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            kind: "ask_user",
            title: args.title ?? "",
            description: args.description,
            fields,
            confirmed: false,
        },
    });
};

export const ask_user_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "ask_user",
        description:
            "向用户提问/确认、或者让用户操作一些事情。调用后本轮对话立即结束，用户在界面上看到问题卡片并回答，回答会作为新消息继续对话。" +
            "当需要用户做选择、确认方案、或提供必要参数时使用，不要靠猜测代替用户决定。可以一次问多个字段。" +
            "字段类型：select（单选）、checkbox（多选）、text（自由填写）。",
        parameters: {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "对话框标题，一句话说明你要问什么",
                },
                description: {
                    type: "string",
                    description: "可选，补充说明或背景",
                },
                fields: {
                    type: "array",
                    description: "要用户填写的字段列表，至少一个",
                    items: {
                        type: "object",
                        properties: {
                            key: {
                                type: "string",
                                description: "字段标识，回答里用它作为键",
                            },
                            label: {
                                type: "string",
                                description: "展示给用户的问题文字",
                            },
                            type: {
                                type: "string",
                                enum: ["select", "checkbox", "text"],
                                description: "select=单选，checkbox=多选，text=文本输入",
                            },
                            options: {
                                type: "array",
                                items: {type: "string"},
                                description: "select / checkbox 的候选项，text 类型不需要",
                            },
                            required: {
                                type: "boolean",
                                description: "是否必填，不填表示可选",
                            },
                            placeholder: {
                                type: "string",
                                description: "text 类型的输入提示",
                            },
                            multiline: {
                                type: "boolean",
                                description: "text 类型是否多行输入",
                            },
                        },
                        required: ["key", "label", "type"],
                    },
                },
            },
            required: ["title", "fields"],
        },
    },
};
