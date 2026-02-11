import {Body, JsonController, Post, Req, Res} from "routing-controllers";
import {Response} from "express";
import {ai_agentService} from "./ai_agent.service";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {Sucess} from "../../other/Result";

@JsonController("/ai_agent")
export class Ai_AgentController {

    @Post("/chat")
    async chat(@Body() data: any, @Res() res: Response, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);

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
                ai_agentService.write_to_res(res, message);

                // 2️⃣ 再发 DONE
                res.write(`data: [DONE]\n\n`);

                // 3️⃣ 最后 end
                res.end();
            }
        }
        return stream
    }

    @msg(CmdType.ai_load_info)
    get_info(data: WsData<any>) {
        const wss = (data.wss as Wss)
        userService.check_user_auth(wss.token, UserAuth.ai_agent_setting);
        ai_agentService.all_wss_set.add(wss)
        wss.setClose(()=>{
            ai_agentService.all_wss_set.delete(wss)
        })
        return ai_agentService.docs_info
    }

    @Post("/ai_load_one_file")
    async ai_load_one_file(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        await ai_agentService.load_one_file(ctx.headers.authorization, data.param_path)
        return  Sucess("")
    }

    @Post("/ai_load_restart")
    async ai_load_restart(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        ai_agentService.close_index()
        Wss.sendToAllClient(CmdType.ai_load_info, ai_agentService.docs_info,ai_agentService.all_wss_set)
        ai_agentService.init_search_docs().catch(console.error);
        return  Sucess("")
    }


}
