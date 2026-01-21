import {Body, JsonController, Post, Req, Res} from "routing-controllers";
import {Response} from "express";
import {ai_agentService} from "./ai_agent.service";

@JsonController("/ai_agent")
export class Ai_AgentController {

    @Post("/chat")
    async chat(@Body() data: any, @Res() res: Response, @Req() ctx) {

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        const token = ctx.headers.authorization
        let stream ;
        try {
            stream =  await ai_agentService.chat(data.messages, res, token)
        } catch (err) {
            console.log(err);
            if (!res.writableEnded && !res.destroyed) {
                const message =
                    typeof err === 'string'
                        ? err
                        : err?.message || 'AI service error';

                // 1️⃣ 先发 error 数据
                res.write(`data: ${message}\n\n`);

                // 2️⃣ 再发 DONE
                res.write(`data: [DONE]\n\n`);

                // 3️⃣ 最后 end
                res.end();
            }
        }
        return stream
    }

}
