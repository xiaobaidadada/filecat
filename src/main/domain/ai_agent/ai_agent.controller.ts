import {Body, Get, JsonController, Post, Req, Res} from "routing-controllers";
import {Response} from "express";
import {ai_agentService} from "./ai_agent.service";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {Sucess} from "../../other/Result";
import {ThreadsFilecat} from "../../threads/filecat/threads.filecat";
import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {aiAgentMemoryService} from "./ai_agent.memory";
import {settingService} from "../setting/setting.service";
import {llmImagesGenerate, llmAudioSpeech, llmEmbeddings} from "./llm_request";
import {max_req_size} from "../../../common/req/common.pojo";
import {ai_agent_message_item, ai_agent_messages, getContentAsString} from "../../../common/req/filecat.ai.pojo";

@JsonController("/ai_agent")
export class Ai_AgentController {

    @Post("/chat")
    async chat(@Body({options: {limit: max_req_size}}) data: {
        messages:ai_agent_messages,
        session_id:string,
    }, @Res() res: Response, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        const token = ctx.headers.authorization
        let stream ;
        try {
        stream =  await ai_agentService.chat(data.messages, res, token, data.session_id)
        } catch (err) {
            console.log(err);
            if (!res.writableEnded && !res.destroyed) {
                const message =
                    typeof err === 'string'
                        ? err
                        : err?.message || 'AI service error';
                const user = userService.get_user_info_by_token(ctx.headers.authorization);
                await ai_agentService.error_end_to_res(user.id,data.session_id,data.messages[data.messages.length-1].content,message,res)
            }
        }
        return stream
    }

    @Get("/sessions")
    async sessions(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        return Sucess(aiAgentMemoryService.list(user?.id ?? user?.user_id ?? user?.username ?? "default"))
    }

    @Post("/sessions/update/meta")
    async sessions_update_meta(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        aiAgentMemoryService.sessions_update_meta(user?.id ,data)
        return Sucess("ok")
    }

    @Post("/session")
    async session_create(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        return Sucess(aiAgentMemoryService.create_session(user?.id ?? user?.user_id ?? user?.username ?? "default", data?.title))
    }

    @Post("/session/get")
    async session_get(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        return Sucess(aiAgentMemoryService.get_session(user?.id ?? user?.user_id ?? user?.username ?? "default", data?.session_id))
    }

    @Post("/session/delete")
    async session_delete(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        aiAgentMemoryService.delete(user?.id ?? user?.user_id ?? user?.username ?? "default", data?.session_id)
        return Sucess("")
    }

    @Post("/session/messages")
    async session_messages(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        aiAgentMemoryService.update_messages_to_session(user?.id ?? user?.user_id ?? user?.username ?? "default", data?.session_id, data?.messages)
        return Sucess("")
    }

    @Post("/session/usage_stats")
    async session_usage_stats(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        const stats = aiAgentMemoryService.get_usage_stats(
            user?.id ?? user?.user_id ?? user?.username ?? "default",
            data?.session_id
        );
        return Sucess(stats);
    }

    @Post("/sessions/clear")
    async sessions_clear(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        aiAgentMemoryService.clear(user?.id ?? user?.user_id ?? user?.username ?? "default")
        return Sucess("")
    }

    // ============================================================
    //  非 chat/completions 的模型请求接口
    // ============================================================

    /**
     * 保存多模态请求到会话记录
     */
    private async saveNonCompletionTurn(
        userId: string,
        sessionId: string | undefined,
        prompt: string,
        assistantMessage: ai_agent_message_item,
    ) {
        const session = aiAgentMemoryService.ensure_session(userId, sessionId, prompt.slice(0, 28) );
        const userMsg: ai_agent_message_item = {
            role: "user",
            content: prompt,
        };
        await aiAgentMemoryService.appendTurn(userId, session.id, userMsg, assistantMessage, {
            input_chars: prompt.length,
            output_chars: getContentAsString(assistantMessage.content).length,
        });
        return session.id;
    }

    /**
     * 图片生成接口 (POST /ai_agent/images/generations)
     * 自动保存会话记录
     */
    @Post("/images/generations")
    async imagesGenerate(@Body() data: {
        prompt: string;
        n?: number;
        size?: string;
        quality?: string;
        style?: string;
        session_id?: string;
    }, @Res() res: Response, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        const userId = user?.id ?? user?.user_id ?? user?.username ?? "default";
        try {
            const response = await llmImagesGenerate(data);
            const result = await response.json();
            // 构造带多模态属性的 assistant 消息
            const images = (result?.data ?? []).map((img: any) => ({
                url: img.url,
                b64_json: img.b64_json,
                revised_prompt: img.revised_prompt,
            }));
            // const imageTexts = images
            //     .map((img: any, i: number) => `![生成图片${i + 1}](${img.url || `data:image/png;base64,${img.b64_json}`})${img.revised_prompt ? `\n> ${img.revised_prompt}` : ''}`)
            //     .join('\n\n');
            const assistantMsg: ai_agent_message_item = {
                role: "assistant",
                // content: imageTexts || `生成了 ${images.length} 张图片`,
                content: `生成了 ${images?.length??0} 张图片`,
                images,
            };
            const finalSessionId = await this.saveNonCompletionTurn(userId, data?.session_id, data.prompt, assistantMsg);
            return Sucess({...result, session_id: finalSessionId});
        } catch (err) {
            const errorMessage = err?.message || "图片生成失败";
            let hint = "";
            if (errorMessage.toLowerCase().includes("size") || errorMessage.toLowerCase().includes("resolution")) {
                hint = "。提示：不同模型支持的 size 不同，常见的有 1024x1024、1792x1024、1024x1792（DALL-E 3）。您可以在聊天页面顶部的请求类型菜单中点击「图片参数设置」修改 size 参数。";
            }
            // 错误也保存到会话
            const errMsg: ai_agent_message_item = {
                role: "assistant",
                content: `❌ 图片生成失败: ${errorMessage}${hint}`,
            };
            await this.saveNonCompletionTurn(userId, data?.session_id, data.prompt, errMsg);
            return {code: 500, message: errorMessage + hint};
        }
    }

    /**
     * 文本转语音接口 (POST /ai_agent/audio/speech)
     * 自动保存会话记录
     */
    @Post("/audio/speech")
    async audioSpeech(@Body() data: {
        input: string;
        voice?: string;
        speed?: number;
        response_format?: string;
        session_id?: string;
    }, @Res() res: Response, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        const userId = user?.id ?? user?.user_id ?? user?.username ?? "default";
        try {
            const response = await llmAudioSpeech(data);
            // 音频直接返回二进制流
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);
            const mimeType = response.headers.get("content-type") || "audio/mpeg";
            const base64Audio = audioBuffer.toString('base64');

            // 保存到会话
            const assistantMsg: ai_agent_message_item = {
                role: "assistant",
                content: `[音频文件: ${(data.input || '').slice(0, 50)}...]`,
                audio: { data: base64Audio, mime_type: mimeType },
            };
            const finalSessionId = await this.saveNonCompletionTurn(userId, data?.session_id, data.input, assistantMsg);

            // 仍然返回二进制
            res.setHeader("Content-Type", mimeType);
            res.setHeader("X-Session-Id", finalSessionId);
            res.send(audioBuffer);
        } catch (err) {
            const errMsg: ai_agent_message_item = {
                role: "assistant",
                content: `❌ 语音合成失败: ${err?.message || "未知错误"}`,
            };
            await this.saveNonCompletionTurn(userId, data?.session_id, data.input, errMsg);
            res.status(500).send(err?.message || "语音合成失败");
        }
    }

    /**
     * Embeddings 接口 (POST /ai_agent/embeddings)
     * 自动保存会话记录
     */
    @Post("/embeddings")
    async embeddings(@Body() data: {
        input: string | string[];
        encoding_format?: string;
        dimensions?: number;
        session_id?: string;
    }, @Res() res: Response, @Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        const user = userService.get_user_info_by_token(ctx.headers.authorization);
        const userId = user?.id ?? user?.user_id ?? user?.username ?? "default";
        try {
            const response = await llmEmbeddings(data);
            const result = await response.json();
            const embeddingsData = result?.data ?? [];
            const firstDim = embeddingsData[0]?.embedding?.length ?? 0;
            const summary = `向量维度: ${firstDim}, 数量: ${embeddingsData.length}`;
            const assistantMsg: ai_agent_message_item = {
                role: "assistant",
                content: `✅ Embeddings 结果 - ${summary}\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 2000)}\n\`\`\``,
                embeddings: result,
            };
            const finalSessionId = await this.saveNonCompletionTurn(userId, data?.session_id, typeof data.input === 'string' ? data.input : data.input.join(', '), assistantMsg);
            return Sucess({...result, session_id: finalSessionId});
        } catch (err) {
            const errMsg: ai_agent_message_item = {
                role: "assistant",
                content: `❌ Embeddings 请求失败: ${err?.message || "未知错误"}`,
            };
            await this.saveNonCompletionTurn(userId, data?.session_id, typeof data.input === 'string' ? data.input : data.input.join(', '), errMsg);
            return {code: 500, message: err?.message || "Embeddings 请求失败"};
        }
    }

    // ============================================================

    @msg(CmdType.ai_confirm_cmd)
    async confirmCmd(data: WsData<any>) {
        const ctx = data.context || {};
        const { askId, approved } = ctx;
        if (!askId) return '';
        const pending = ai_agentService.pendingConfirmMap.get(askId);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(approved === true);
            ai_agentService.pendingConfirmMap.delete(askId);
        }
        data.wss.setClose(()=>{
            const pending_p = ai_agentService.pendingConfirmMap.get(askId);
            if (pending_p) {
                clearTimeout(pending_p.timeout);
                pending_p.resolve(false);
                ai_agentService.pendingConfirmMap.delete(askId);
            }
        })
        return '';
    }

    @msg(CmdType.ai_load_info)
    async get_info(data: WsData<any>) {
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

    // @Post("/ai_load_restart")
    // async ai_load_restart(@Req() ctx, @Body() data: any) {
    //     userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
    //     await ai_agentService.close_index()
    //     await ThreadsFilecat.restart()
    //     Wss.sendToAllClient(CmdType.ai_load_info, ai_agentService.docs_info,ai_agentService.all_wss_set)
    //     ai_agentService.init_search_docs().catch(console.error);
    //     return  Sucess("")
    // }

    // @Post("/ai_load_close")
    // async ai_load_close(@Req() ctx, @Body() data: any) {
    //     userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
    //     await ai_agentService.close_index()
    //     Wss.sendToAllClient(CmdType.ai_load_info, ai_agentService.docs_info,ai_agentService.all_wss_set)
    //     return  Sucess("")
    // }

    // 知识库是否开启
    @Get("/docs_on_get")
    async docs_on_get(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        return Sucess(ai_agentService.docs_switch_get())
    }
    @Post("/docs_on_set")
    async docs_on_set(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        DataUtil.set(data_common_key.ai_agent_status,data.status)
        if(ai_agentService.docs_switch_get()) {
            await ai_agentService.init()
            Wss.sendToAllClient(CmdType.ai_load_info, ai_agentService.docs_info,ai_agentService.all_wss_set)
        } else {
            await ai_agentService.close_index()
        }
        return Sucess("")
    }

    @Post("/ai_del")
    async ai_del(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_setting);
        ai_agentService.delete_index_with_progress(data.param_path).catch(console.error);
        return  Sucess("")
    }

    /**
     * 切换当前激活的模型（前端模型选择器调用）
     * 直接将对应模型的 open 设为 true，其他设为 false，并重新加载配置
     */
    @Post("/set_active_model")
    async setActiveModel(@Req() ctx, @Body() data: { model_name: string }) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        ai_agentService.set_active_model(data.model_name);
        return Sucess("ok");
    }

    // 获取系统会话提示词列表（聊天页面使用，不需要setting权限）
    @Get("/system_prompts")
    async system_prompts(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.ai_agent_page);
        return Sucess(settingService.ai_system_prompts_get());
    }


}
