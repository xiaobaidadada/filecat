import WebSocket from 'ws';
import axios from 'axios';
import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv } from "../../../../common/req/filecat.ai.pojo";
import { chatWithAI, resolveModelConfig } from "./types";

const QQ_BASE_URL = 'https://api.sgroup.qq.com';

async function getAppAccessToken(appId: string, clientSecret: string) {
    const res = await axios.post('https://bots.qq.com/app/getAppAccessToken', { appId, clientSecret });
    return res.data;
}

function get_token(accessToken: string) { return `QQBot ${accessToken}`; }

async function get_gateway_url(accessToken: string) {
    const res = await axios.get(`${QQ_BASE_URL}/gateway`, {
        headers: { Authorization: get_token(accessToken) },
    });
    return res.data;
}

enum OpCode {
    Dispatch = 0, Heartbeat = 1, Identify = 2, Resume = 6,
    Reconnect = 7, InvalidSession = 9, Hello = 10, HeartAck = 11,
}

interface WsMessage { op: OpCode; d: any; s?: number; t?: string; }

async function sendC2CMessage(openid: string, content: string, msg_id: string, accessToken: string) {
    try {
        await axios.post(`${QQ_BASE_URL}/v2/users/${openid}/messages`, {
            content, msg_type: 0, msg_id,
        }, { headers: { Authorization: get_token(accessToken), 'Content-Type': 'application/json' } });
    } catch (err: any) {
        console.error('[QQ Bot] 回复单聊消息失败:', err);
    }
}

async function sendGroupMessage(groupOpenid: string, content: string, msg_id: string, accessToken: string) {
    try {
        await axios.post(`${QQ_BASE_URL}/v2/groups/${groupOpenid}/messages`, {
            content, msg_type: 0, msg_id,
        }, { headers: { Authorization: get_token(accessToken), 'Content-Type': 'application/json' } });
    } catch (err: any) {
        console.error('[QQ Bot] 回复群聊消息失败:', err.message);
    }
}

export class QQBotConnection {
    private ws: WebSocket | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private accessToken: string = '';
    private seqNum: number = 0;
    config: ai_rebot_item;

    private readonly SYSTEM_USER_ID = '1';
    private modelConfig: ai_agent_Item | null;
    private modelEnv: ai_agent_item_dotenv | null;

    constructor(config: ai_rebot_item) {
        this.config = config;
        const { modelConfig, modelEnv } = resolveModelConfig(config, 'QQ Bot');
        this.modelConfig = modelConfig;
        this.modelEnv = modelEnv;
    }

    async start(): Promise<void> {
        if (!this.config.appId || !this.config.clientSecret) {
            console.error('[QQ Bot] appId 或 clientSecret 为空，无法启动');
            return;
        }
        try {
            const tokenRes = await getAppAccessToken(this.config.appId, this.config.clientSecret);
            this.accessToken = tokenRes.access_token;
            // console.log('[QQ Bot] 获取 access_token 成功');
            const gatewayRes = await get_gateway_url(this.accessToken);
            // console.log('[QQ Bot] 获取网关地址:', gatewayRes.url);
            this.connect(gatewayRes.url);
        } catch (err: any) {
            console.error('[QQ Bot] 启动失败:', err.message);
            setTimeout(() => this.start(), 5 * 60 * 1000);
        }
    }

    private connect(wsUrl: string) {
        this.ws = new WebSocket(wsUrl);
        this.ws.on('open', () => {
            console.log('[QQ Bot] WebSocket 已连接');
            this.ws!.send(JSON.stringify({
                op: OpCode.Identify,
                d: {
                    token: get_token(this.accessToken),
                    intents: (1 << 0) | (1 << 25) | (1 << 30),
                }
            }));
        });
        this.ws.on('message', (data) => {
            try {
                const msg: WsMessage = JSON.parse(data.toString());
                this.handleMessage(msg);
            } catch (err) {
                console.error('[QQ Bot] 解析消息失败:', err);
            }
        });
        this.ws.on('close', (code) => {
            console.log('[QQ Bot] WebSocket 关闭, code:', code);
            this.clearHeartbeat();
            if (this.config.open) {
                // console.log('[QQ Bot] 将在30秒后重连...');
                setTimeout(() => { if (this.config.open) this.start().catch(console.error); }, 30_000);
            }
        });
        this.ws.on('error', (err) => {
            console.error('[QQ Bot] WebSocket 错误:', err.message);
        });
    }

    private handleMessage(msg: WsMessage) {
        if (msg.s != null) this.seqNum = msg.s;
        switch (msg.op) {
            case OpCode.Hello:
                this.setupHeartbeat(msg.d.heartbeat_interval);
                break;
            case OpCode.Dispatch:
                this.handleDispatch(msg);
                break;
            case OpCode.HeartAck: break;
            case OpCode.Reconnect:
                console.log('[QQ Bot] 服务端要求重连');
                this.clearHeartbeat();
                if (this.ws) { this.ws.close(); this.ws = null; }
                if (this.config.open) this.start().catch(console.error);
                break;
            case OpCode.InvalidSession:
                console.log('[QQ Bot] 无效 session，重新连接');
                this.clearHeartbeat();
                if (this.ws) { this.ws.close(); this.ws = null; }
                if (this.config.open) this.start().catch(console.error);
                break;
        }
    }

    private setupHeartbeat(interval: number) {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ op: OpCode.Heartbeat, d: this.seqNum }));
            }
        }, Math.floor(interval / 2));
    }

    private clearHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    private async handleDispatch(msg: WsMessage) {
        if (!this.accessToken) return;
        switch (msg.t) {
            case 'C2C_MESSAGE_CREATE': {
                const msgId = msg.d.id, openid = msg.d.author?.id, content = msg.d.content;
                if (!openid || !content) break;
                try {
                    const reply = await chatWithAI({
                        uniqueId: openid, content, chatType: 'C2C',
                        source: 'robot_qq', sourceLabel: 'QQ',
                        userId: this.config.user_id, systemUserId: this.SYSTEM_USER_ID,
                        modelConfig: this.modelConfig, modelEnv: this.modelEnv,
                    });
                    if (reply) await sendC2CMessage(openid, reply, msgId, this.accessToken);
                } catch (err) {
                    console.error('[QQ Bot] 处理单聊消息异常:', err);
                    await sendC2CMessage(openid, '抱歉，处理消息时出错了', msgId, this.accessToken);
                }
                break;
            }
            case 'GROUP_AT_MESSAGE_CREATE': {
                const msgId = msg.d.id, groupOpenid = msg.d.group_openid, content = msg.d.content;
                if (!groupOpenid || !content) break;
                try {
                    const reply = await chatWithAI({
                        uniqueId: groupOpenid, content, chatType: 'GROUP',
                        source: 'robot_qq', sourceLabel: 'QQ',
                        userId: this.config.user_id, systemUserId: this.SYSTEM_USER_ID,
                        modelConfig: this.modelConfig, modelEnv: this.modelEnv,
                    });
                    if (reply) await sendGroupMessage(groupOpenid, reply, msgId, this.accessToken);
                } catch (err) {
                    console.error('[QQ Bot] 处理群聊消息异常:', err);
                    await sendGroupMessage(groupOpenid, '抱歉，处理消息时出错了', msgId, this.accessToken);
                }
                break;
            }
        }
    }

    stop() {
        this.config.open = false;
        this.clearHeartbeat();
        if (this.ws) { this.ws.close(); this.ws = null; }
    }
}
