import WebSocket from 'ws';
import axios from 'axios';
import { ai_rebot_item, ai_agent_Item, ai_agent_item_dotenv } from "../../../../common/req/filecat.ai.pojo";
import { chatWithAI, resolveModelConfig } from "./types";
import {CommonUtil} from "../../../../common/common.util";

const QQ_BASE_URL = 'https://api.sgroup.qq.com';


function get_token(accessToken: string) {
    return `QQBot ${accessToken}`;
}
async function get_gateway_url(accessToken: string) {
    const res = await axios.get(`${QQ_BASE_URL}/gateway`, {
        headers: { Authorization: accessToken },
    });
    return res.data;
}

enum OpCode {
    // https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html#%E9%80%9A%E7%94%A8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84-payload
    Dispatch = 0, Heartbeat = 1, Identify = 2, Resume = 6,
    Reconnect = 7, InvalidSession = 9, Hello = 10, HeartAck = 11,
}

interface WsMessage { op: OpCode; d: any; s?: number; t?: string; }


export class QQBotConnection {
    private ws: WebSocket | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;
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

    log(...args:any) {
        console.log(`[QQ Bot] ${this.config.name}`,...args);
    }

    token_cache:{expires_in:number,access_token:string,get_now:number};
    async getAppAccessToken(appId: string, clientSecret: string) {
        const now = Date.now();
        if(this.token_cache) {
            if((now - this.token_cache.get_now)/1000 < this.token_cache.expires_in) {
                return this.token_cache.access_token
            }
        }
        const res = await axios.post('https://bots.qq.com/app/getAppAccessToken', { appId, clientSecret });
        this.token_cache = {
            expires_in: parseInt(res.data.expires_in),
            access_token: get_token(res.data.access_token as string),
            get_now: Date.now(),
        }
        return this.token_cache .access_token;
    }

    async sendC2CMessage(openid: string, content: string, msg_id: string) {
        try {
            const accessToken = await this.getAppAccessToken(this.config.appId,this.config.clientSecret)
            await axios.post(`${QQ_BASE_URL}/v2/users/${openid}/messages`, {
                content, msg_type: 0, msg_id,
            }, { headers: { Authorization: accessToken, 'Content-Type': 'application/json' } });
        } catch (err: any) {
            this.log('回复单聊消息失败',err?.message)
        }
    }

    async sendGroupMessage(groupOpenid: string, content: string, msg_id: string) {
        try {
            const accessToken = await this.getAppAccessToken(this.config.appId,this.config.clientSecret)
            await axios.post(`${QQ_BASE_URL}/v2/groups/${groupOpenid}/messages`, {
                content, msg_type: 0, msg_id,
            }, { headers: { Authorization: accessToken, 'Content-Type': 'application/json' } });
        } catch (err: any) {
            this.log('回复群聊消息失败',err.message)
        }
    }

    async start(): Promise<void> {
        if (!this.config.appId || !this.config.clientSecret) {
            this.log('appId 或 clientSecret 为空，无法启动')
            return;
        }
        if(CommonUtil.sleep_lock_has(this.config.appId)) {
            return;
        }
        await CommonUtil.sleep_lock_key(this.config.appId,2000);
        try {
            const access_token = await this.getAppAccessToken(this.config.appId, this.config.clientSecret);
            // console.log('[QQ Bot] 获取 access_token 成功');
            const gatewayRes = await get_gateway_url(access_token);
            // console.log('[QQ Bot] 获取网关地址:', gatewayRes.url);
            this.connect(gatewayRes.url,access_token);
        } catch (err: any) {
            this.log('启动失败',err?.message)
            setTimeout(() => this.start(), 5 * 60 * 1000);
        }
    }

    private connect(wsUrl: string,access_token:string) {
        this.ws = new WebSocket(wsUrl);
        this.ws.on('open', () => {
            this.log(' WebSocket 已连接')
            this.ws!.send(JSON.stringify({
                op: OpCode.Identify,
                d: {
                    token: access_token,
                    intents: (1 << 0) | (1 << 25) | (1 << 30),
                }
            }));
        });
        this.ws.on('message', (data) => {
            try {
                const msg: WsMessage = JSON.parse(data.toString());
                this.handleMessage(msg);
            } catch (err) {
                this.log('解析消息失败')
            }
        });
        this.ws.on('close', (code) => {
            this.log('WebSocket 关闭, code:',code)
            this.clearHeartbeat();
            if (this.config.open) {
                // console.log('[QQ Bot] 将在30秒后重连...');
                setTimeout(() => { if (this.config.open) this.start().catch(console.error); }, 30_000);
            }
        });
        this.ws.on('error', (err) => {
            //https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html
            this.log('WebSocket 错误',err.message)
        });
    }

    private handleMessage(msg: WsMessage) {
        if (msg.s != null) this.seqNum = msg.s;
        switch (msg.op) {
            case OpCode.Hello:
                this.setupHeartbeat(msg.d.heartbeat_interval);
                break;
            case OpCode.Dispatch:
                this.handleDispatch(msg).catch(console.error);
                break;
            case OpCode.HeartAck: break;
            case OpCode.Reconnect:
                this.log('服务端要求重连')
                this.clearHeartbeat();
                if (this.ws) { this.ws.close(); this.ws = null; }
                if (this.config.open) this.start().catch(this.log);
                break;
            case OpCode.InvalidSession:
               this.log('无效 session，重新连接')
                this.clearHeartbeat();
                if (this.ws) { this.ws.close(); this.ws = null; }
                if (this.config.open) this.start().catch(this.log);
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
        const access_token = await this.getAppAccessToken(this.config.appId, this.config.clientSecret);
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
                    if (reply) await this.sendC2CMessage(openid, reply, msgId);
                } catch (err) {
                    this.log('处理单聊消息异常',err?.message)
                    await this.sendC2CMessage(openid, '抱歉，处理消息时出错了', msgId);
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
                    if (reply) await this.sendGroupMessage(groupOpenid, reply, msgId);
                } catch (err) {
                    this.log('处理群聊消息异常',err?.message)
                    await this.sendGroupMessage(groupOpenid, '抱歉，处理消息时出错了', msgId);
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
