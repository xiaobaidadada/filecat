import * as Lark from '@larksuiteoapi/node-sdk';
import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv } from "../../../../common/req/filecat.ai.pojo";
import { chatWithAI, resolveModelConfig } from "./types";

interface LarkMessageData {
    message: {
        message_id: string;
        chat_id: string;
        content: string;
        message_type: string;
        chat_type: string;
    };
}

export class LarkBotConnection {
    private wsClient: any = null;
    private client: any = null;
    config: ai_rebot_item;

    private readonly SYSTEM_USER_ID = '1';
    private modelConfig: ai_agent_Item | null;
    private modelEnv: ai_agent_item_dotenv | null;

    constructor(config: ai_rebot_item) {
        this.config = config;
        const { modelConfig, modelEnv } = resolveModelConfig(config, 'Lark Bot');
        this.modelConfig = modelConfig;
        this.modelEnv = modelEnv;
    }

    async start(): Promise<void> {
        const appId = this.config.appId;
        const appSecret = this.config.clientSecret;
        if (!appId || !appSecret) {
            console.error('[Lark Bot] appId 或 appSecret 为空，无法启动');
            return;
        }
        if (this.wsClient) {
            this.stop();
        }

        try {
            const self = this;
            const baseConfig = {
                appId,
                appSecret,
                domain: 'https://open.feishu.cn',
            };

            this.client = new Lark.Client(baseConfig);
            this.wsClient = new Lark.WSClient(baseConfig);

            const eventDispatcher = new Lark.EventDispatcher({}).register({
                'im.message.receive_v1': async (data: LarkMessageData) => {
                    const { message: { chat_id, content, message_type, chat_type, message_id } } = data;

                    let text = '';
                    try {
                        if (message_type === 'text') {
                            text = JSON.parse(content).text || '';
                        }
                    } catch {
                        console.log('[Lark Bot] 非文本消息，跳过');
                        return;
                    }

                    if (!text) return;

                    const chatType = chat_type === 'p2p' ? 'C2C' : 'GROUP';
                    // console.log(`[Lark Bot] 收到${chatType === 'C2C' ? '单聊' : '群聊'}消息:`, chat_id, text.slice(0, 50));

                    try {
                        const reply = await chatWithAI({
                            uniqueId: chat_id,
                            content: text,
                            chatType,
                            source: 'robot_lark',
                            sourceLabel: '飞书',
                            userId: self.config.user_id,
                            systemUserId: self.SYSTEM_USER_ID,
                            modelConfig: self.modelConfig,
                            modelEnv: self.modelEnv,
                        });

                        const replyContent = JSON.stringify({ text: reply || '（无回复）' });

                        if (chat_type === 'p2p') {
                            await self.client.im.v1.message.create({
                                params: { receive_id_type: 'chat_id' },
                                data: {
                                    receive_id: chat_id,
                                    content: replyContent,
                                    msg_type: 'text',
                                },
                            });
                        } else {
                            await self.client.im.v1.message.reply({
                                path: { message_id },
                                data: {
                                    content: replyContent,
                                    msg_type: 'text',
                                },
                            });
                        }
                    } catch (err: any) {
                        console.error('[Lark Bot] 处理消息异常:', err);
                    }
                },
            });

            this.wsClient.start({ eventDispatcher });
            console.log('[Lark Bot] WebSocket 连接建立成功');
        } catch (err: any) {
            console.error('[Lark Bot] 启动失败:', err.message);
        }
    }

    stop() {
        this.config.open = false;
        if (this.wsClient) {
            try { this.wsClient.stop(); } catch (_) {}
            this.wsClient = null;
        }
        this.client = null;
    }
}
