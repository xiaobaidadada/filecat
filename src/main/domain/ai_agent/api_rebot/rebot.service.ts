import WebSocket from 'ws';
import axios from 'axios';
import { ai_rebot_item } from "../../../../common/req/filecat.ai.pojo";
import { ai_agentService } from "../ai_agent.service";
import { aiAgentMemoryService } from "../ai_agent.memory";
import { settingService } from "../../setting/setting.service";
import { ai_agent_message_item, getContentAsString } from "../../../../common/req/filecat.ai.pojo";

const BASE_URL = 'https://api.sgroup.qq.com';

async function getAppAccessToken(appId: string, clientSecret: string) {
    const res = await axios.post('https://bots.qq.com/app/getAppAccessToken', {
        appId,
        clientSecret,
    });
    return res.data; // { access_token, expires_in }
}

function get_token(accessToken: string) {
    return `QQBot ${accessToken}`;
}

async function get_gateway_url(accessToken: string) {
    const res = await axios.get(`${BASE_URL}/gateway`, {
        headers: { Authorization: get_token(accessToken) },
    });
    return res.data;
}

enum OpCode {
    Dispatch = 0,
    Heartbeat = 1,
    Identify = 2,
    Resume = 6,
    Reconnect = 7,
    InvalidSession = 9,
    Hello = 10,
    HeartAck = 11,
}

interface WsMessage {
    op: OpCode;
    d: any;
    s?: number;
    t?: string;
}

/** 发送普通消息给用户 */
async function sendC2CMessage(openid: string, content: string, msg_id: string, accessToken: string) {
    try {
        const resp = await axios.post(`${BASE_URL}/v2/users/${openid}/messages`, {
            content,
            msg_type: 0,
            msg_id,
        }, {
            headers: {
                Authorization: get_token(accessToken),
                'Content-Type': 'application/json',
            },
        });
        console.log('[QQ Bot] 回复单聊消息:', resp.status, resp.data);
    } catch (err) {
        console.error('[QQ Bot] 回复单聊消息失败:', err.message);
    }
}

/** 发送消息到群聊 */
async function sendGroupMessage(groupOpenid: string, content: string, msg_id: string, accessToken: string) {
    try {
        const resp = await axios.post(`${BASE_URL}/v2/groups/${groupOpenid}/messages`, {
            content,
            msg_type: 0,
            msg_id,
        }, {
            headers: {
                Authorization: get_token(accessToken),
                'Content-Type': 'application/json',
            },
        });
        console.log('[QQ Bot] 回复群聊消息:', resp.status, resp.data);
    } catch (err) {
        console.error('[QQ Bot] 回复群聊消息失败:', err.message);
    }
}

class QQBotConnection {
    private ws: WebSocket | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private accessToken: string = '';
    private appId: string = '';
    private clientSecret: string = '';
    private config: ai_rebot_item;
    private seqNum: number = 0;
    private user_id?: string;

    // 使用 root 用户（id="1"）来标识机器人系统
    private readonly SYSTEM_USER_ID = '1';

    constructor(config: ai_rebot_item) {
        this.config = config;
        this.appId = config.appId;
        this.clientSecret = config.clientSecret;
        this.user_id = config.user_id
    }

    async start(): Promise<void> {
        if (!this.appId || !this.clientSecret) {
            console.error('[QQ Bot] appId 或 clientSecret 为空，无法启动');
            this.updateStatus('error', 'appId 或 clientSecret 为空');
            return;
        }

        try {
            this.updateStatus('connecting');
            const tokenRes = await getAppAccessToken(this.appId, this.clientSecret);
            this.accessToken = tokenRes.access_token;
            console.log('[QQ Bot] 获取 access_token 成功');

            const gatewayRes = await get_gateway_url(this.accessToken);
            const wsUrl = gatewayRes.url;
            console.log('[QQ Bot] 获取网关地址:', wsUrl);

            this.connect(wsUrl);
        } catch (err: any) {
            console.error('[QQ Bot] 启动失败:', err.message);
            this.updateStatus('error', err.message);
            // 5分钟后重试
            setTimeout(() => this.start(), 5 * 60 * 1000);
        }
    }

    private connect(wsUrl: string) {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log('[QQ Bot] WebSocket 已连接');
            this.updateStatus('connected');

            // 发送 Identify
            this.ws!.send(JSON.stringify({
                op: OpCode.Identify,
                d: {
                    token: get_token(this.accessToken),
                    intents: (1 << 0) | (1 << 25) | (1 << 30), // PUBLIC_GUILD_MESSAGES | GROUP_MESSAGES | DIRECT_MESSAGE
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
            this.updateStatus('disconnected');
            this.clearHeartbeat();

            // 如果不是主动关闭，尝试重连
            if (this.config.open) {
                console.log('[QQ Bot] 将在30秒后重连...');
                setTimeout(() => {
                    if (this.config.open) {
                        this.start().catch(console.error);
                    }
                }, 30_000);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[QQ Bot] WebSocket 错误:', err.message);
            this.updateStatus('error', err.message);
        });
    }

    private handleMessage(msg: WsMessage) {
        if (msg.s != null) {
            this.seqNum = msg.s;
        }

        switch (msg.op) {
            case OpCode.Hello:
                this.setupHeartbeat(msg.d.heartbeat_interval);
                break;

            case OpCode.Dispatch:
                this.handleDispatch(msg);
                break;

            case OpCode.HeartAck:
                // 心跳确认
                break;

            case OpCode.Reconnect:
                console.log('[QQ Bot] 服务端要求重连');
                this.stop();
                this.start().catch(console.error);
                break;

            case OpCode.InvalidSession:
                console.log('[QQ Bot] 无效 session，重新连接');
                this.stop();
                this.start().catch(console.error);
                break;
        }
    }

    private setupHeartbeat(interval: number) {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    op: OpCode.Heartbeat,
                    d: this.seqNum,
                }));
            }
        }, Math.floor(interval / 2));
    }

    private clearHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private async handleDispatch(msg: WsMessage) {
        if (!this.accessToken) return;

        switch (msg.t) {
            case 'C2C_MESSAGE_CREATE': {
                // 单聊消息
                const msgId = msg.d.id;
                const openid = msg.d.author?.id;
                const content = msg.d.content;

                // console.log('[QQ Bot] 收到单聊消息:', openid, content);

                if (!openid || !content) break;

                try {
                    const reply = await this.chatWithAI(openid, content, 'C2C');
                    if (reply) {
                        await sendC2CMessage(openid, reply, msgId, this.accessToken);
                    }
                } catch (err) {
                    console.error('[QQ Bot] 处理单聊消息异常:', err);
                    await sendC2CMessage(openid, '抱歉，处理消息时出错了', msgId, this.accessToken);
                }
                break;
            }

            case 'GROUP_AT_MESSAGE_CREATE': {
                // 群聊 @机器人消息
                const msgId = msg.d.id;
                const groupOpenid = msg.d.group_openid;
                const content = msg.d.content;

                // console.log('[QQ Bot] 收到群聊@消息:', groupOpenid, content);

                if (!groupOpenid || !content) break;

                try {
                    const reply = await this.chatWithAI(groupOpenid, content, 'GROUP');
                    if (reply) {
                        await sendGroupMessage(groupOpenid, reply, msgId, this.accessToken);
                    }
                } catch (err) {
                    console.error('[QQ Bot] 处理群聊消息异常:', err);
                    await sendGroupMessage(groupOpenid, '抱歉，处理消息时出错了', msgId, this.accessToken);
                }
                break;
            }
        }
    }

    /**
     * 使用 AI 进行聊天
     * @param uniqueId openid 或 groupOpenid，作为会话的唯一标识
     * @param content 消息内容
     * @param chatType C2C 或 GROUP
     * @returns AI 回复内容
     */
    private async chatWithAI(uniqueId: string, content: string, chatType: 'C2C' | 'GROUP'): Promise<string | null> {
        // 使用 uniqueId 作为 sessionId
        const sessionId = `qq_${chatType.toLowerCase()}_${uniqueId}`;

        // 确保会话存在，指定 source 为 robot_qq
        const session = aiAgentMemoryService.ensure_session(
            this.SYSTEM_USER_ID,
            sessionId,
            `QQ ${chatType === 'C2C' ? '单聊' : '群聊'} - ${uniqueId.slice(0, 8)}...`,
            'robot_qq'
        );

        const userMsg: ai_agent_message_item = {
            role: 'user',
            content: content,
        };

        try {
            // 构建上下文消息
            const workMessages = aiAgentMemoryService.build_context_by_session(session, [userMsg]);

            let assistantText = '';
            let inputChars = 0;
            let outputChars = 0;

            await new Promise<void>((resolve, reject) => {
                const chat_core = require('../chat.core').chat_core;
                const controller = new AbortController();
                const timeout = setTimeout(() => {
                    controller.abort();
                    reject(new Error('AI 回复超时'));
                }, 120_000); // 2分钟超时

                chat_core.chat({
                    tools: ai_agentService.getModelToolSchemas(),
                    originMessages: workMessages,
                    user_id: this.user_id??this.SYSTEM_USER_ID,
                    controller,
                    on_msg: (msg: string) => {
                        assistantText += msg;
                    },
                    on_end: (stats: any) => {
                        clearTimeout(timeout);
                        if (stats) {
                            inputChars = stats.input_chars || 0;
                            outputChars = stats.output_chars || 0;
                        }
                        resolve();
                    },
                }).catch((err: Error) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            if (assistantText) {
                const assistantMsg: ai_agent_message_item = {
                    role: 'assistant',
                    content: assistantText,
                };

                // 保存到会话
                await aiAgentMemoryService.appendTurn(
                    this.SYSTEM_USER_ID,
                    session.id,
                    userMsg,
                    assistantMsg,
                    {
                        input_chars: inputChars,
                        output_chars: outputChars,
                    }
                );
            }

            return assistantText || null;
        } catch (err: any) {
            console.error('[QQ Bot] AI 聊天失败:', err.message);
            const errorMsg = `AI 处理失败: ${err.message || '未知错误'}`;

            // 保存错误消息
            const assistantMsg: ai_agent_message_item = {
                role: 'assistant',
                content: errorMsg,
            };
            try {
                await aiAgentMemoryService.appendTurn(
                    this.SYSTEM_USER_ID,
                    session.id,
                    userMsg,
                    assistantMsg,
                    { input_chars: content.length, output_chars: errorMsg.length }
                );
            } catch (e) {
                console.error('[QQ Bot] 保存错误消息失败:', e);
            }

            return '抱歉，AI 服务暂时不可用，请稍后再试。';
        }
    }

    private updateStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', msg?: string) {
        // this.config._status = status;
        // this.config._status_msg = msg;
        // 将状态广播给前端（通过 WebSocket）
        // 此项通过 rebotService 统一处理状态查询
    }

    stop() {
        this.config.open = false;
        this.clearHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

/**
 * QQ 机器人服务管理器
 */
class RebotService {
    private connections: Map<number, QQBotConnection> = new Map();

    /**
     * 重新加载所有机器人配置
     */
    async reload(): Promise<void> {
        const setting = settingService.ai_rebot_setting();
        const list = setting.list || [];

        // 停止已删除或已关闭的连接
        const activeIndexes = new Set(list.filter(it => it.open).map((it, i) => i));
        for (const [index, conn] of this.connections) {
            if (!activeIndexes.has(index)) {
                console.log('[Rebot] 停止机器人连接:', index);
                conn.stop();
                this.connections.delete(index);
            }
        }

        // 启动新的或重新启动变更的连接
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item.open) continue;

            const existing = this.connections.get(i);
            if (existing) {
                // 检查配置是否变更
                const existingConfig = list[i];
                if (existingConfig.appId !== item.appId || existingConfig.clientSecret !== item.clientSecret) {
                    console.log('[Rebot] 机器人配置变更，重新启动:', i);
                    existing.stop();
                    this.connections.delete(i);
                } else {
                    // 已经在运行，跳过
                    continue;
                }
            }

            // 启动新连接
            if (item.platform === 'qq') {
                console.log('[Rebot] 启动 QQ 机器人:', item.name || i);
                const conn = new QQBotConnection({ ...item });
                this.connections.set(i, conn);
                conn.start().catch(err => {
                    console.error('[Rebot] QQ 机器人启动失败:', err);
                    // item._status = 'error';
                    // item._status_msg = err.message;
                });
            }
        }
    }

    /**
     * 获取所有机器人的状态
     */
    getStatus(): ai_rebot_item[] {
        const setting = settingService.ai_rebot_setting();
        const list = setting.list || [];
        return list.map((item, index) => {
            const conn = this.connections.get(index);
            return {
                ...item,
                // _status: item.open
                //     ? (conn ? item._status || 'connected' : item._status || 'disconnected')
                //     : 'disconnected',
                // _status_msg: item._status_msg,
            };
        });
    }

    /**
     * 停止所有机器人连接
     */
    stopAll(): void {
        for (const [, conn] of this.connections) {
            conn.stop();
        }
        this.connections.clear();
    }
}

export const rebotService = new RebotService();
