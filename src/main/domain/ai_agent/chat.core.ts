import {ai_agent_messages} from "../../../common/req/common.pojo";
import {Response} from "express";
import {userService} from "../user/user.service";
import {settingService} from "../setting/setting.service";
import os from "os";
import {Ai_agentTools, Ai_agentTools_type} from "./ai_agent.tools";
import {Readable} from "stream";
import {ai_tools, ai_tools_search_docs} from "./ai_agent.constant";
import {ai_agentService, API_KEY, BASE_URL, config, config_env, config_search_doc, MODEL} from "./ai_agent.service";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {shellServiceImpl} from "../shell/shell.service";
import {exec_type} from "pty-shell";
import * as path from "path";


export class ChatCore {

    // 检测权限 补充参数
    private async permission_test(token, user: UserData, toolName, args: any, cwd) {
        switch (toolName) {
            case "exec_cmd": {
                // todo shell-quote shell 中 || 语法的命令会有潜在问题
                const cmd = args.cmd?.trim();
                if (!cmd) throw new Error("cmd 不能为空");

                const argv = cmd.split(" ");
                const code = await shellServiceImpl.check_exe_cmd({
                    user_id: user.id,
                    cwd: cwd ?? process.cwd() // 默认这个就是允许的 工作目录 一次性的不会变得
                })(argv[0], argv.slice(1));

                if (code === exec_type.not) {
                    throw new Error(`没有权限执行命令：${cmd}`);
                }
                args.cwd = cwd
                break;
            }

            case "list_files":
            case "read_file":
            case "search_in_files":
                if (cwd != null && !path.isAbsolute(args.path)) {
                    args.path = path.join(cwd, args.path);
                }
                userService.check_user_path(token, args.path);
                break;

            case "edit_file":
                if (cwd != null && !path.isAbsolute(args.path)) {
                    args.path = path.join(cwd, args.path);
                }
                userService.check_user_path(token, args.path);
                userService.check_user_auth(
                    token,
                    UserAuth.filecat_file_delete_cut_rename
                );
                break;
        }

    }

    private async trimMessages(workMessages: ai_agent_messages, char_max: number, on_msg: (msg: string) => void, controller: AbortController) {
        if (char_max < 12000) {
            char_max = 12000; // 也不能太小
        }
        let count = 0;
        for (const workMessage of workMessages) {
            count += workMessage.content?.length ?? 0;
        }
        if (count <= char_max) {
            return workMessages;
        }
        on_msg(`历史消息过长，正在裁剪消息`);
        let assistantMessage: any = {
            role: "user",
            content: ``,
            // tool_calls: []
        };
        await this.callLLSync(
            [
                ...workMessages,
                {
                    role: "system",
                    content: `
                    请总结以上对话，保留：
1. 用户目标
2. 已完成的步骤
3. 关键结论
4. 当前状态
字符在${char_max} 以内
                    `
                },
            ],
            // ===== call_data =====
            (chunk) => {
                if (!chunk) return;
                // ===== 1. 普通内容流 =====
                if (chunk.content) {
                    assistantMessage.content += chunk.content;
                }

            }
            ,
            // ===== error_call =====
            (e) => {
                throw e
            },
            controller
        );
        return assistantMessage
    }

    // todo 长期记忆方式
    public async chat(
        originMessages: ai_agent_messages,
        token: string,
        controller: AbortController,
        on_msg: (msg: string) => void,
        on_end: () => void,
        sys_prompt?: string,
        cwd?: string,
    ) {
        if (!API_KEY) {
            throw new Error("api 没有设置，请设置诸如豆包、openai 的 model api");
        }

        const user = userService.get_user_info_by_token(token);
        const rootPath = settingService.getFileRootPath(token);

        const workMessages: ai_agent_messages = [
            {
                role: "system",
                content: `
 你是一个服务器机器人，当前操作系统是 ${os.platform()}，
   当前目录是 ${rootPath}，
   当前系统登陆用户是 ${user.username}，用户的id为 ${user.user_id}，${user.note}。
   
你是开源项目filecat的一部分，项目地址 https://github.com/xiaobaidadada/filecat。

${ai_agentService.is_use_local_data() ? ` 当你不了解某些知识的时候，直接使用search_docs工具函数来搜素本地知识库搜索相关资料，如果用到了知识库,需要给用户引用的知识库文件路径。` : ''}

${config.sys_prompt ?? ''}

${sys_prompt ?? ''}
`
            },
            ...await this.trimMessages(originMessages, config_env.char_max, on_msg, controller),
        ];

        if (config_search_doc.force_use_local_data) {
            const t_ = await ai_agentService.search_docs({keywords: [workMessages[workMessages.length - 1].content]})
            workMessages[workMessages.length - 1].content = `本地知识库搜到 ${t_} 
            ${workMessages[workMessages.length - 1].content}`
        }

        const env = {
            toolLoop: config_env.tool_call_max,
            tool_error_max: config_env.tool_error_max
        };

        // 隐式 planner
        // todo 文本 grep 搜索 历史会话搜索让ai有能力搜索到它需要知道的片面数据 让ai自己搜 只提供关键概要
        while (env.toolLoop-- > 0) {

            //  用来拼完整 assistant message
            let assistantMessage: any = {
                role: "assistant",
                content: "",
                tool_calls: []
            };

            const toolCallMap = new Map<number, any>();


            //  调用 LLM（流式）
            await this.callLLSync(
                workMessages,
                // ===== call_data =====
                (chunk) => {
                    if (!chunk) return;
                    // ===== 1. 普通内容流 =====
                    if (chunk.content) {
                        assistantMessage.content += chunk.content;
                        on_msg(chunk.content);
                    }

                    // ===== 2. tool_calls 流 =====
                    if (chunk.tool_calls) {
                        for (const tc of chunk.tool_calls) {
                            const idx = tc.index;

                            if (!toolCallMap.has(idx)) {
                                toolCallMap.set(idx, {
                                    id: tc.id,
                                    type: "function",
                                    function: {
                                        name: tc.function?.name ?? "",
                                        arguments: ""
                                    }
                                });
                            }

                            const call = toolCallMap.get(idx);
                            if (tc.id) {
                                call.id = tc.id;
                            }


                            // name 只会来一次
                            if (tc.function?.name) {
                                call.function.name = tc.function.name;
                            }

                            // arguments 是流式拼接的
                            if (tc.function?.arguments) {
                                call.function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }
                ,
                // ===== error_call =====
                (e) => {
                    throw e
                },
                controller
            );
            assistantMessage.tool_calls = Array.from(toolCallMap.values());


            //  一次 LLM 完整结束，补 push assistant
            workMessages.push(assistantMessage);

            // 没有 tool_calls，直接结束
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                on_end();
                return;
            }

            // 有 tool_calls，开始执行工具 这些工具必须是可以并发执行的，如果工具之前自己本身有前后顺序（工具函数内部自己处理），ai提供的列表是可以并发的
            await Promise.all(assistantMessage.tool_calls.map(call=>{
                return (async ()=>{
                    try {
                        const args = JSON.parse(call.function.arguments || "{}");
                        const toolName = call.function.name as Ai_agentTools_type;

                        await this.permission_test(token, user, toolName, args, cwd);
                        let result = await Ai_agentTools[toolName](args);
                        let resultStr = String(result);
                        // if (resultStr.length > 5000) {
                        //     resultStr = resultStr.slice(0, 4000) + "\n...（内容过长已截断）";
                        // }
                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: resultStr
                        });
                    } catch (e) {
                        if (env.tool_error_max-- <= 0) throw e;

                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: String(e)
                        });
                    }
                })()
            }))

        }

        on_msg("超出最大理解语义次数");
        on_end();
    }


    private async callLLSync(messages: ai_agent_messages,
                             call_data: (message: any) => void,
                             error_call: (e) => void,
                             controller: AbortController
    ) {
        // const l_time = Date.now();
        const tools: any[] = [...ai_tools]
        if (ai_agentService.is_use_local_data()) {
            tools.push(ai_tools_search_docs)
        }
        const json_body: any = {
            messages,
            tools: tools,
            temperature: 0.2,
            model: MODEL,
            // thinking : { // 豆包深度思考
            //     "type":"disabled"
            // }
        }
        try {
            if (config.json_params) {
                const obj = JSON.parse(config.json_params);
                for (const key of Object.keys(obj)) {
                    json_body[key] = obj[key];
                }
            }
        } catch (err) {
            console.log(err)
        }
        // 最后重新赋值确保不会被修改
        json_body.tools = tools
        json_body.messages = messages
        const res = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify(json_body),
            signal: controller.signal
        });
        // console.log(`一次请求耗时 ${(Date.now() - l_time)/1000} s`)
        const contentType = res.headers.get("content-type") || "";
        const isSSE = contentType.includes("text/event-stream");
        if (isSSE) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buf += decoder.decode(value, {stream: true});
                // SSE 按 \n\n 分段
                let parts = buf.split(/\r?\n\r?\n/);
                buf = parts.pop()!; // 留下未完整的一段

                for (const part of parts) {
                    // 过滤空段
                    if (!part.trim()) continue;
                    // SSE 可能包含多行 data:
                    const lines = part.split('\n');
                    let dataLines: string[] = [];
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            dataLines.push(line.replace(/^data:\s*/, ''));
                        }
                    }
                    const dataStr = dataLines.join('\n');
                    // [DONE] 表示结束
                    if (dataStr.trim() === '[DONE]') {
                        return;
                    }
                    // 解析 JSON 并回调
                    try {
                        const json = JSON.parse(dataStr);
                        // 你可以根据接口结构取你想要的字段
                        const message = json.choices?.[0]?.delta ?? json.choices?.[0]?.message;
                        if (message)
                            call_data(message);
                    } catch (e) {
                        if (e.name === "AbortError") {
                            // 客户端断开，正常终止
                            return;
                        }
                        error_call(e)
                        return
                    }
                }
            }
            // 如果读完了也结束
            return
        }

        if (!res.ok) {
            const text = await res.text();
            try {
                const json = JSON.parse(text);
                error_call((json.message || json.error?.message || text))
            } catch {
                error_call(text)
            }
            return
        }
        call_data((await res.json() as any).choices[0].message)
    }


    // // 暂时不用
    // private async flow_call(res: Response, work_messages: ai_agent_messages) {
    //     const finalMessages: ai_agent_messages = this.trimMessages(work_messages);
    //     finalMessages.push({
    //         role: 'system',
    //         content: '现在基于以上结果对用户进行简洁的回答，并使用markdown的格式。'
    //     })
    //     let json_body: any = {
    //         model: MODEL,
    //         messages: finalMessages,
    //         stream: true,
    //         temperature: 0.7
    //     }
    //     try {
    //         if (config.json_params) {
    //             const obj = JSON.parse(config.json_params);
    //             for (const key of Object.keys(obj)) {
    //                 json_body[key] = obj[key];
    //             }
    //         }
    //     } catch (err) {
    //         console.log(err)
    //     }
    //     // const l_time = Date.now();
    //     const aiResponse = await fetch(BASE_URL, {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json",
    //             "Authorization": `Bearer ${API_KEY}`
    //         },
    //         body: JSON.stringify(json_body)
    //     });
    //     // console.log(`最终回答耗时: ${((Date.now() - l_time)/1000)} s`)
    //     if (!aiResponse.ok || !aiResponse.body) {
    //         res.write(
    //             `event: error\ndata: ${aiResponse.status === 413
    //                 ? "请求内容过大（413）"
    //                 : "AI 请求失败"
    //             }\n\n`
    //         );
    //         res.end();
    //         return res;
    //     }
    //     if (!json_body.stream) {
    //         const r: any = await aiResponse.json()
    //         const msg = r.choices[0].message;
    //         this.write_to_res(res, msg.content);
    //         res.end();
    //         return res;
    //     }
    //     const nodeStream = Readable.fromWeb(aiResponse.body as any);
    //     res.on("close", () => {
    //         nodeStream.destroy();
    //     });
    //     nodeStream.pipe(res);
    //     return nodeStream;
    // }
}

export const chat_core = new ChatCore();