import axios from 'axios';
import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv } from "../../../../common/req/filecat.ai.pojo";
import { chatWithAI, resolveModelConfig } from "./types";

const { DWClient, TOPIC_ROBOT, EventAck } = require('dingtalk-stream');

interface DingTalkStreamMessage {
    code: number;
    headers: { topic: string; messageId: string; contentType?: string; [key: string]: string; };
    message: string;
    data: string;
    type: 'SYSTEM' | 'EVENT' | 'CALLBACK';
}

export class DingTalkBotConnection {
    private client: any = null;
    config: ai_rebot_item;

    private readonly SYSTEM_USER_ID = '1';
    private modelConfig: ai_agent_Item;
    private modelEnv: ai_agent_item_dotenv;

    constructor(config: ai_rebot_item) {
        this.config = config;
        const { modelConfig, modelEnv } = resolveModelConfig(config, 'DingTalk Bot');
        this.modelConfig = modelConfig;
        this.modelEnv = modelEnv;
    }

    async start(): Promise<void> {
        const appKey = this.config.appId;
        const appSecret = this.config.clientSecret;
        if (!appKey || !appSecret) {
            console.error('[DingTalk Bot] ClientId(AppKey) 或 ClientSecret(AppSecret) 为空，无法启动');
            return;
        }
        if (this.client) { this.stop(); }

        try {
            const self = this;
            const client = new DWClient({ clientId: appKey, clientSecret: appSecret });

            await client
                .registerCallbackListener(TOPIC_ROBOT, async (msg: DingTalkStreamMessage) => {
                    try {
                        const payload = JSON.parse(msg.data || '{}');
                        await self.handleRobotMessage(payload, client);
                    } catch (err) {
                        console.error('[DingTalk Bot] 处理消息异常:', err);
                    }
                    return { status: EventAck.SUCCESS, message: 'OK' };
                })
                .connect();

            this.client = client;
            console.log('[DingTalk Bot] Stream 连接建立成功');
        } catch (err: any) {
            console.error('[DingTalk Bot] 启动失败:', err.message);
        }
    }

    private async handleRobotMessage(payload: any, client: any) {
        const sessionWebhook = payload.sessionWebhook;
        const text = payload.text?.content || '';
        if (!text) return;

        const chatType = payload.conversationType === '1' ? 'C2C' : 'GROUP';
        const uniqueId = chatType === 'C2C' ? (payload.senderId || payload.senderStaffId) : (payload.conversationId || '');

        try {
            const reply = await chatWithAI({
                uniqueId, content: text, chatType,
                source: 'robot_dingtalk', sourceLabel: '钉钉',
                userId: this.config.user_id, systemUserId: this.SYSTEM_USER_ID,
                modelConfig: this.modelConfig, modelEnv: this.modelEnv,
            });
            if (reply) await this.replyViaWebhook(sessionWebhook, reply, client);
        } catch (err) {
            console.error('[DingTalk Bot] 处理消息异常:', err);
            await this.replyViaWebhook(sessionWebhook, '抱歉，处理消息时出错了', client);
        }
    }

    private async replyViaWebhook(sessionWebhook: string, content: string, client: any) {
        if (!sessionWebhook) { console.error('[DingTalk Bot] sessionWebhook 为空'); return; }
        try {
            const accessToken = await client.getAccessToken();
            const result = await axios.post(sessionWebhook,
                { msgtype: 'text', text: { content } },
                { headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': accessToken } }
            );
        } catch (err: any) {
            console.error('[DingTalk Bot] 回复消息失败:', err?.response?.data || err.message);
        }
    }

    stop() {
        this.config.open = false;
        if (this.client) {
            try {
                // DWClient 的 disconnect 后可能还会重连，需要彻底销毁
                this.client.socket?.close?.();
                this.client.disconnect?.();
            } catch (_) {}
            this.client = null;
        }
    }
}
