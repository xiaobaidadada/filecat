import {ai_agent_message_item, ai_agent_messages} from "../../../common/req/common.pojo";
import {Response} from "express";
import {userService} from "../user/user.service";
import {settingService} from "../setting/setting.service";
import os from "os";
import {ai_tools} from "./tools/ai_agent.constant";
import {ai_agentService,  ai_config, ai_config_env, ai_config_search_doc} from "./ai_agent.service";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {shellServiceImpl} from "../shell/shell.service";
import {exec_type} from "pty-shell";
import * as path from "path";
import {StringUtil} from "../../../common/StringUtil";
import { createParser } from 'eventsource-parser';
import {ai_tools_search_docs} from "./tools/search_docs"; // 引入库

export interface ChatOptions {
    originMessages: ai_agent_messages;
    // token?: string;
    user_id:string;
    controller: AbortController;
    on_msg: (msg: string) => void;
    on_end: (stats?: { input_chars: number; output_chars: number }) => void;
    sys_prompt?: string;
    cwd?: string;
}

export class ChatCore {

    // 检测权限 补充参数
    private async permission_test(user_id, user: UserData, toolName, args: any, cwd) {
        switch (toolName) {
            case "exec_cmd": {
                args.cwd = args.cwd ?? cwd ?? process.cwd()// 默认这个就是允许的 工作目录 一次性的不会变得
                const cmds = StringUtil.splitBashCommands(args.cmd)
                for (const cmd of cmds) {
                    const argv = cmd.split(" ");
                    const code = await shellServiceImpl.check_exe_cmd({
                        user_id: user.id,
                        cwd: args.cwd
                    })(argv[0], argv.slice(1));

                    if (code === exec_type.not) {
                        throw new Error(`没有权限执行命令：${cmd}`);
                    }
                }
                break;
            }

            case "list_files":
            case "read_file":
            case "search_in_files":
                if (cwd != null && !path.isAbsolute(args.path)) {
                    args.path = path.join(cwd, args.path);
                }
                userService.check_user_path_by_user_id(user_id, args.path);
                break;

            case "edit_file":
            case "create_fs_entry":
                if (cwd != null && !path.isAbsolute(args.path)) {
                    args.path = path.join(cwd, args.path);
                }
                userService.check_user_path_by_user_id(user_id, args.path);
                userService.check_user_auth_by_user_id(
                    user_id,
                    UserAuth.filecat_file_delete_cut_rename,
                    {
                        auto_throw: true,
                    }
                );
                break;
        }

    }


    // todo 长期记忆 短期记忆 等记忆处理
    public async chat(options: ChatOptions) {
        const {
            originMessages,
            // token,
            user_id,
            controller,
            on_msg,
            on_end,
            sys_prompt,
            cwd,
        } = options;

        // 统计每次 HTTP 请求大模型的输入/输出字符数
        let total_input_chars = 0;
        let total_output_chars = 0;
        if (!ai_config) {
            throw new Error("api 没有设置，请设置诸如豆包、openai 的 model api");
        }

        const user = userService.get_user_info_by_user_id(user_id);
        const rootPath = settingService.getFileRootPathById(user_id);

        const workMessages: ai_agent_messages = [
            {
                role: "system",
                content: `
用户当前所在的根目录是 ${rootPath}，
当前系统登陆用户是 ${user.username}，用户的id为 ${user.user_id}，${user.note}。

你是一个服务器机器人，当前操作系统是 ${os.platform()}，
你的能力是控制电脑服务器，执行任何可以控制服务器的命令，实现高效的运维，写代码，服务器问答，智能电脑服务器的自动化助手。

你是开源项目filecat的一部分，项目地址 https://github.com/xiaobaidadada/filecat。
如果用户没有问题，不要做任何tools工具调用，直接回答用户。
如果你需要修改代码，修改完最后要判断能够变异测试尝试进行测试，但是不要直接运行项目进行编译测试。
除非用户需要你直接操作本地文件，否则选择文字输出的形式给用户。
当用户没有任何问题的时候，你只需要向用户表达你可以帮助用户就可以了。


如果你需要调用tools，在调用tools的时候向用户简要的说明你的意图是什么。

${ai_agentService.docs_switch_get() ? ` 当你不了解某些知识的时候，直接使用search_docs工具函数来搜素本地知识库搜索相关资料，如果用到了知识库,需要给用户引用的知识库文件路径。` : ''}

${ai_config.sys_prompt ?? ''}

${sys_prompt ?? ''}
`
            },
            ...originMessages
            // ...await this.trimMessages(originMessages, config_env.char_max, on_msg, controller),
        ];

        if (ai_config_search_doc.force_use_local_data) {
            const t_ = await ai_agentService.search_docs({keywords: [workMessages[workMessages.length - 1].content]})
            workMessages[workMessages.length - 1].content = `本地知识库搜到 ${t_} 
            ${workMessages[workMessages.length - 1].content}`
        }

        const env = {
            toolLoop: ai_config_env.tool_call_max,
            tool_error_max: ai_config_env.tool_error_max
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
            const ioStats = { input_chars: 0, output_chars: 0 };
            await this.callLLSync(
                workMessages,
                ioStats,
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
                                // if(tc.function.name) {
                                //     on_msg(`\n${`ai正在补充 ${tools_des_map[tc.function.name]?.get_name()} ...`}`)
                                // }
                                toolCallMap.set(idx, {
                                    id: tc.id,
                                    type: "function",
                                    function: {
                                        name: tc.function?.name ?? "",
                                        arguments: tc.function?.arguments??""
                                    }
                                });
                                continue;
                            }

                            const call = toolCallMap.get(idx)!;

                            // name 只会来一次
                            if (tc.function?.name) {
                                call.function.name += tc.function.name;
                                on_msg(`\n${`等待 ${ai_agentService.getToolInfo(call.function.name, {})?.get_name?.() ?? call.function.name} ...`}`)
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
            on_msg("\n")
            assistantMessage.tool_calls = Array.from(toolCallMap.values());

            // 累加本次 HTTP 请求的输入/输出统计
            total_input_chars += ioStats.input_chars;
            total_output_chars += ioStats.output_chars;


            //  一次 LLM 完整结束，补 push assistant
            workMessages.push(assistantMessage);

            // 没有 tool_calls，直接结束
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                on_end({ input_chars: total_input_chars, output_chars: total_output_chars });
                return;
            }
            // const log_text =    `${assistantMessage.tool_calls.length} 工具。${JSON.stringify(assistantMessage.tool_calls.map(v=>v.function?.name))}`
            // console.log(`工具执行开始 ${log_text} `)
            // 有 tool_calls，开始执行工具 这些工具必须是可以并发执行的，如果工具之前自己本身有前后顺序（工具函数内部自己处理），ai提供的列表是可以并发的
            await Promise.all(assistantMessage.tool_calls.map(call=>{
                return (async ()=>{
                    if(!call.function?.name)return; // 有问题
                    const toolName = call.function.name as string;
                    let tool_info_value = ai_agentService.getToolInfo(toolName, {}) ?? {
                        get_name: () => toolName,
                        get_params: () => ""
                    };
                    try {
                        const args = JSON.parse(call.function.arguments || "{}");
                        tool_info_value = ai_agentService.getToolInfo(toolName, args) ?? tool_info_value;
                        await this.permission_test(user_id, user, toolName, args, cwd);

                        on_msg(`\n\r${tool_info_value.get_name()}  ${tool_info_value.get_params()}\n\r`)
                        let result = await ai_agentService.callTool(toolName, args);
                        let resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
                        // on_msg(`\n\r${tool_des_name} 执行完成`)
                        // if (resultStr.length > 5000) {
                        //     resultStr = resultStr.slice(0, 4000) + "\n...（内容过长已截断）";
                        // }
                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: resultStr
                        });
                    } catch (e) {
                        const msg = e?.message??JSON.stringify(e)
                        on_msg(`\n\r工具执行失败 ${ tool_info_value.get_name()} ${msg}`)
                        if (env.tool_error_max-- <= 0) throw e;

                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: msg
                        });
                    }
                })()
            }))
            // console.log(`工具执行结束 ${log_text} `)

        }

        on_msg("超出最大理解语义次数");
        on_end({ input_chars: total_input_chars, output_chars: total_output_chars });
    }


    private async callLLSync(
        messages: ai_agent_messages,
        ioStats: { input_chars: number; output_chars: number },
        call_data: (message: any) => void,
        error_call: (e: any) => void,
        controller: AbortController
    ) {
        const tools: any[] = [...ai_tools];
        if (ai_agentService.docs_switch_get()) {
            tools.push(ai_tools_search_docs);
        }
        tools.push(...ai_agentService.getMcpTools());

        const json_body: any = {
            messages,
            tools: tools,
            model: ai_config.model,
        };

        // 合并自定义配置参数
        try {
            if (ai_config.json_params) {
                const obj = JSON.parse(ai_config.json_params);
                Object.assign(json_body, obj);
            }
        } catch (err) {
            console.error("解析 ai_config.json_params 失败", err);
        }

        const requestBody = JSON.stringify(json_body);
        ioStats.input_chars += requestBody.length;

        try {
            const res = await fetch(ai_config.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ai_config.token}`
                },
                body: requestBody,
                signal: controller.signal
            });

            if (!res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    error_call(json.message || json.error?.message || text);
                } catch {
                    error_call(text);
                }
                return;
            }

            const contentType = res.headers.get("content-type") || "";
            const isSSE = contentType.includes("text/event-stream");

            // --- SSE 处理逻辑 ---
            if (isSSE && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();

                const parser = createParser({
                    onEvent: (event) => {
                        // 直接判断 data 即可
                        if (event.data === '[DONE]') return;
                        try {
                            const json = JSON.parse(event.data);
                            // 兼容 OpenAI 格式
                            const message = json.choices?.[0]?.delta ?? json.choices?.[0]?.message;
                            if (message) {
                                call_data(message);
                            }
                        } catch (e) {
                            // 解析失败可能是因为收到了非 JSON 的数据行，可以忽略或记录
                            console.warn("SSE 解析 JSON 失败，数据内容:", event.data);
                        }
                    }
                });

                try {
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, {stream: true});
                        ioStats.output_chars += chunk.length;
                        parser.feed(chunk);
                    }
                } catch (e: any) {
                    if (e.name !== "AbortError") {
                        error_call(e);
                    }
                } finally {
                    parser.reset();
                }
                return;
            }

            // --- 非 SSE 处理逻辑 ---
            const resultText = await res.text();
            ioStats.output_chars += resultText.length;
            const result = JSON.parse(resultText);
            call_data(result.choices[0].message);

        } catch (e: any) {
            if (e.name !== "AbortError") {
                error_call(e);
            }
        }
    }

}

export const chat_core = new ChatCore();
