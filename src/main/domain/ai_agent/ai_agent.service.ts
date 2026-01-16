import {ai_tools} from "./ai_agent.constant";
import * as ai_agent_tools from "./ai_agent.tools"
import {ai_agent_messages} from "../../../common/req/common.pojo";
import { Response } from "express";
import {Readable} from "stream";

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const MODEL = "doubao-seed-1-6-251015";

/**
 * 边输出部分结果，边进行工具调用，这是怎么做到的
 */
export class Ai_agentService {


    // 至少两次请求，先判断到不会需要tools，在输出，
    public async chat(messages:ai_agent_messages,res:Response) {
        // 先判断是否有工具调用
        while (true) {
            messages.push({
                role:'assistant',
                content:'如果有工具调用，不需要输出任何文本，直接返回函数'
            })
            const call_data = await this.callLLSync(messages);
            const msg = call_data.choices[0].message;
            if (msg.tool_calls) {
                for (const call of msg.tool_calls) {
                    const result = await ai_agent_tools[call.function.name](
                        call.function.arguments
                    );
                    messages.push({
                        role: "assistant",
                        tool_call_id: call.id,
                        content: String(result)
                    });
                    messages.push({
                        role: "assistant",
                        content: "工具调用已完成，我将基于已有信息给出结论。"
                    });
                }
                continue;
            }
            // 没有再进行工具调用
            break;
        }
        messages.push({
            role:'assistant',
            content:'现在基于以上结果对用户进行简洁的回答'
        })
        // 进行 流式输出 回调
        const aiResponse = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                stream: true,
                temperature: 0.7,
                tools: ai_tools
            })
        });
        if (!aiResponse.ok || !aiResponse.body) {
            res.write(`event: error\ndata: AI 请求失败\n\n`);
            res.end();
            return;
        }
        // ⭐ 核心：WebStream → NodeStream → pipe
        const nodeStream = Readable.fromWeb(aiResponse.body as any);
        // 客户端断开时，终止上游
        res.on("close", () => {
            nodeStream.destroy();
        });
        nodeStream.pipe(res);
    }


    private async  callLLSync(messages:ai_agent_messages) {
        const res = await fetch(`${BASE_URL}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model:MODEL,
                messages,
                tools: ai_tools,
                temperature: 0.2
            })
        });

        if (!res.ok) {
            const tr = await res.text()
            throw new Error(tr);
        }

        return res.json();
    }
}

export const ai_agentService = new Ai_agentService();