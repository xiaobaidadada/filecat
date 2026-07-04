import axios from 'axios';
import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv } from "../../../../common/req/filecat.ai.pojo";
import { chatWithAI, resolveModelConfig } from "./types";

const AiBot = require('@wecom/aibot-node-sdk');
const { generateReqId } = AiBot;

interface WeComWsFrame {
    body?: {
        msgid?: string;
        chatid?: string;
        chattype?: string;
        from?: { userid?: string };
        msgtype?: string;
        text?: { content?: string };
        [key: string]: any;
    };
    headers?: { req_id?: string; [key: string]: any };
    [key: string]: any;
}

export class WeComBotConnection {
    private client: any = null;
    config: ai_rebot_item;

    private readonly SYSTEM_USER_ID = '1';
    private modelConfig: ai_agent_Item | null;
    private modelEnv: ai_agent_item_dotenv | null;

    constructor(config: ai_rebot_item) {
        this.config = config;
        const { modelConfig, modelEnv } = resolveModelConfig(config, 'WeCom Bot');
        this.modelConfig = modelConfig;
        this.modelEnv = modelEnv;
    }

    async start(): Promise<void> {
        const botId = this.config.appId;
        const botSecret = this.config.clientSecret;
        if (!botId || !botSecret) {
            console.error('[WeCom Bot] botId 或 secret 为空，无法启动');
            return;
        }
        if (this.client) {
            this.stop();
        }

        try {
            const self = this;
            const wsClient = new AiBot.WSClient({
                botId,
                secret: botSecret,
            });

            wsClient.on('authenticated', () => {
                console.log('[WeCom Bot] 认证成功');
            });

            wsClient.on('error', (err: any) => {
                console.error('[WeCom Bot] 错误:', err?.message || err);
            });

            // 监听文本消息
            wsClient.on('message.text', async (frame: WeComWsFrame) => {
                const text = frame.body?.text?.content || '';
                if (!text) return;

                const chatid = frame.body?.chatid || '';
                const chattype = frame.body?.chattype || 'single';
                const chatType = chattype === 'group' ? 'GROUP' : 'C2C';

                // console.log(`[WeCom Bot] 收到${chatType === 'C2C' ? '单聊' : '群聊'}消息:`, chatid, text.slice(0, 50));

                // 先发一条流式消息表示正在处理
                const streamId = generateReqId('stream');
                wsClient.replyStream(frame, streamId, '正在思考中...', false).catch(() => {});

                try {
                    const reply = await chatWithAI({
                        uniqueId: chatid,
                        content: text,
                        chatType,
                        source: 'robot_wecom',
                        sourceLabel: '企业微信',
                        userId: self.config.user_id,
                        systemUserId: self.SYSTEM_USER_ID,
                        modelConfig: self.modelConfig,
                        modelEnv: self.modelEnv,
                    });

                    // 发送最终结果
                    if (reply) {
                        await wsClient.replyStream(frame, streamId, reply, true);
                    } else {
                        await wsClient.replyStream(frame, streamId, '（无回复）', true);
                    }
                } catch (err: any) {
                    console.error('[WeCom Bot] 处理消息异常:', err);
                    wsClient.replyStream(frame, streamId, '抱歉，处理消息时出错了', true).catch(() => {});
                }
            });

            wsClient.on('event.enter_chat', async (frame: WeComWsFrame) => {
                console.log('[WeCom Bot] 用户进入会话');
                wsClient.replyWelcome(frame, {
                    msgtype: 'text',
                    text: { content: 'Hello! I\'m your AI assistant FileCat. How can I help you today?' },
                }).catch(() => {});
            });

            wsClient.connect();
            this.client = wsClient;
            console.log('[WeCom Bot] WebSocket 连接建立成功');
        } catch (err: any) {
            console.error('[WeCom Bot] 启动失败:', err.message);
        }
    }

    stop() {
        this.config.open = false;
        if (this.client) {
            try {
                this.client.disconnect();
            } catch (_) {}
            this.client = null;
        }
    }
}
