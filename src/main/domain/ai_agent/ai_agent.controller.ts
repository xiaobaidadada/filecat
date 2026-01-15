import { Body, JsonController, Post, Res } from "routing-controllers";
import { Response } from "express";
import {ai_tools} from "./ai_agent.constant";
import {Readable} from "stream";

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const MODEL = "doubao-seed-1-6-251015";

@JsonController("/ai_agent")
export class Ai_AgentController {

    @Post("/chat")
    async chat(@Body() data: any, @Res() res: Response) {
        // SSE headers
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // nginx
        res.flushHeaders?.();
        const controller = new AbortController();
        let closed = false;
        res.on("close", () => {
            closed = true;
            controller.abort();
        });
        const aiResponse = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: data.messages,
                stream: true,
                temperature: 0.7,
                tools:ai_tools
            }),
            signal: controller.signal
        });
        if (!aiResponse.ok || !aiResponse.body) {
            throw new Error(`AI 请求失败: ${aiResponse.status}`);
        }
        // const reader = aiResponse.body.getReader();
        // const decoder = new TextDecoder("utf-8");
        const nodeStream = Readable.fromWeb(aiResponse.body as any);
        nodeStream.pipe(res);
        return res
    }
}
