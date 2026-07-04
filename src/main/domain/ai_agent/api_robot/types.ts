import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv, ai_agent_message_item, getContentAsString } from "../../../../common/req/filecat.ai.pojo";
import {ai_agentService, } from "../ai_agent.service";
import { aiAgentMemoryService } from "../ai_agent.memory";
import { settingService } from "../../setting/setting.service";
import { Env } from "../../../../common/node/Env";
import { chat_core, ChatOptions } from "../chat.core";
import axios from "axios";

/** 消息来源类型，各个机器人共用 */
export type MessageSource = 'robot_qq' | 'robot_dingtalk' | 'robot_wecom' | 'robot_lark';

/** AI 聊天参数 */
export interface BotChatParams {
    uniqueId: string;
    content: string;
    chatType: 'C2C' | 'GROUP';
    source: MessageSource;
    sourceLabel: string; // 如 "QQ" 或 "钉钉"
    userId?: string;
    systemUserId: string;
    modelConfig: ai_agent_Item;
    modelEnv: ai_agent_item_dotenv;
}

/** 从 ai_rebot_item 解析 modelConfig。
 * - 如果指定了 model_index，使用对应的模型
 * - 如果 model_index == null，使用系统中第一个开启的模型
 * - 如果没有任何开启的模型，报错
 */
export function resolveModelConfig(
    config: ai_rebot_item,
    tag: string,
): { modelConfig: ai_agent_Item; modelEnv: ai_agent_item_dotenv } {

    if (config.model_index != null && (config.model_index as string) !== "") {
        const { models } = settingService.ai_agent_setting();
        const modelIndex = Number(config.model_index);
        if (isNaN(modelIndex)) {
            console.warn(`[${tag}] model_index "${config.model_index}" 不是有效数字`);
        } else {
            const matched = models.find(m => m.index === modelIndex);
            if (matched) {
                const modelEnv = new ai_agent_item_dotenv();
                if (matched.dotenv) Env.load(matched.dotenv, modelEnv);
                console.log(`[${tag}] 机器人 "${config.name}" 使用指定模型: ${matched.note || matched.model} (index=${modelIndex})`);
                return { modelConfig: matched, modelEnv };
            }
            console.warn(`[${tag}] 未找到 model_index=${modelIndex} 的模型配置`);
        }
    }
    return { modelConfig: null, modelEnv: null };
}

/** 公共 AI 聊天逻辑 — QQ 和钉钉通用 */
export async function chatWithAI(params: BotChatParams): Promise<string | null> {
    const { uniqueId, content, chatType, source, sourceLabel, userId, systemUserId, modelConfig, modelEnv } = params;
    const sessionId = `${source.replace('robot_', '')}_${chatType.toLowerCase()}_${uniqueId}`;

    const session = aiAgentMemoryService.ensure_session(
        systemUserId,
        sessionId,
        `${sourceLabel} ${chatType === 'C2C' ? '单聊' : '群聊'} - ${uniqueId.slice(0, 8)}...`,
        source
    );

    const userMsg: ai_agent_message_item = { role: 'user', content };

    try {
        const workMessages = aiAgentMemoryService.build_context_by_session(session, [userMsg]);
        let assistantText = '';
        let inputChars = 0;
        let outputChars = 0;

        await new Promise<void>((resolve, reject) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
                reject(new Error('AI 回复超时'));
            }, 120_000);

            const chatOpts: ChatOptions = {
                tools: ai_agentService.getModelToolSchemas(),
                originMessages: workMessages,
                user_id: userId ?? systemUserId,
                controller,
                on_msg: (payload) => { assistantText += payload.text; },
                on_end: (stats) => {
                    clearTimeout(timeout);
                    if (stats) { inputChars = stats.input_chars || 0; outputChars = stats.output_chars || 0; }
                    resolve();
                    const finalText = (stats?.once_messages_list ?? [])
                        .map(it => getContentAsString(it.content)).filter(Boolean).join("\n\n");
                    const assistantMsg: ai_agent_message_item = {
                        role: 'assistant', content: finalText, content_list: stats?.once_messages_list ?? [],
                    };
                    aiAgentMemoryService.appendTurn(systemUserId, session.id, userMsg, assistantMsg, {
                        input_chars: inputChars, output_chars: outputChars,
                    }).catch(console.error);
                },
            };
            chatOpts.aiConfig = modelConfig||ai_agentService.ai_config;
            chatOpts.aiEnv = modelEnv||ai_agentService.ai_config_env;
            chat_core.chat(chatOpts).catch((err: Error) => { clearTimeout(timeout); reject(err); });
        });

        return assistantText || null;
    } catch (err: any) {
        console.error(`[${sourceLabel}] AI 聊天失败:`, err.message);
        return '抱歉，AI 服务暂时不可用，请稍后再试。';
    }
}
