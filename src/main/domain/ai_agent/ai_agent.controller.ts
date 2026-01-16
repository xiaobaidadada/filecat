import { Body, JsonController, Post, Res } from "routing-controllers";
import { Response } from "express";
import {ai_agentService} from "./ai_agent.service";

@JsonController("/ai_agent")
export class Ai_AgentController {

    @Post("/chat")
    async chat(@Body() data: any, @Res() res: Response) {

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        ai_agentService.chat(data.messages,res).catch(console.error);
        return res
    }

}
