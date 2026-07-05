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

/**
 * 飞书机器人连接。
 * 使用长链模式（WebSocket），无需公网 IP 和 Webhook 地址。
 */
export class LarkBotConnection {
    private wsClient: Lark.WSClient = null;
    private client: Lark.Client = null;
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

        // 先停掉旧连接
        if (this.wsClient) {
            try { this.wsClient.close(); } catch (_) { /* ignore */ }
            this.wsClient = null;
            this.client = null;
        }

        try {
            const self = this;
            const baseConfig = {
                appId,
                appSecret,
                // domain: 'https://open.feishu.cn'
            };

            // 创建 HTTP Client（用于回复消息）
            this.client = new Lark.Client(baseConfig);

            // 创建 WebSocket Client
            this.wsClient = new Lark.WSClient(baseConfig);

            // 注册事件处理器。
            // 注意：事件处理不能 await 耗时操作，否则 SDK 的 ACK 会延迟，
            // 飞书服务端可能认为超时导致后续消息投递变慢。
            // 这里采用 fire-and-forget，立即返回让 SDK 发出 ACK。
            const eventDispatcher = new Lark.EventDispatcher({}).register({
                'im.message.receive_v1': async (data: LarkMessageData) => {
                    const { message: { chat_id, content, message_type, chat_type, message_id } } = data;

                    // 只处理文本消息
                    let text = '';
                    try {
                        if (message_type === 'text') {
                            text = JSON.parse(content).text || '';
                        }
                    } catch {
                        return; // 非 JSON 格式，跳过
                    }
                    if (!text) return;

                    const chatType = chat_type === 'p2p' ? 'C2C' : 'GROUP';

                    let  replyContent:{text:string} = {text:""}
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

                        if (!reply) return;
                         replyContent = { text: reply };
                    } catch (err: any) {
                        replyContent = { text: err?.message };
                        console.error('[Lark Bot] 处理消息异常:', err);
                    }
                    // 确保 client 未被 stop 置空
                    if (!self.client) {
                        console.warn('[Lark Bot] client 已释放，放弃回复');
                        return;
                    }

                    if (chat_type === 'p2p') {
                        await self.client.im.v1.message.create({
                            params: { receive_id_type: 'chat_id' },
                            data: {
                                receive_id: chat_id,
                                content: JSON.stringify(replyContent),
                                msg_type: 'text',
                            },
                        });
                    } else {
                        await self.client.im.v1.message.reply({
                            path: { message_id },
                            data: {
                                content: JSON.stringify(replyContent),
                                msg_type: 'text',
                            },
                        });
                    }
                },
            });

            // 启动 WebSocket，嵌入生命周期回调
            this.wsClient.start({
                eventDispatcher,
            });
            console.log('[Lark Bot] 启动成功');
        } catch (err: any) {
            console.error('[Lark Bot] 启动失败:', err.message);
            this.stop();
            setTimeout(() => this.start(), 5 * 60 * 1000);
        }
    }

    stop(): void {
        this.config.open = false;
        // 先停 WebSocket，阻止后续事件进入
        if (this.wsClient) {
            try { this.wsClient.close({force:true}); }catch (e) {
                console.log(e)
            }
            this.wsClient = null;
        }
        // client 后置空
        this.client = null;
    }
}
