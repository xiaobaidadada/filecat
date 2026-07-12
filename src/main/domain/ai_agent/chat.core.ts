import {Response} from "express";
import {userService} from "../user/user.service";
import {settingService} from "../setting/setting.service";
import os from "os";
import {ai_agent_params_type, ai_tools} from "./tools/ai_agent.constant";
import {ai_agentService} from "./ai_agent.service";
import {llmPostStream} from "./llm_request";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {shellServiceImpl} from "../shell/shell.service";
import {exec_type} from "pty-shell";
import * as path from "path";
import {StringUtil} from "../../../common/StringUtil";
import { createParser } from 'eventsource-parser';
import {ai_tools_search_docs} from "./tools/search_docs"; // 引入库
import {CmdType, WsData} from "../../../common/frame/WsData";
import { WsUtil} from "../../../common/frame/ws.server";
import {
    ai_agent_Item,
    ai_agent_item_dotenv,
    ai_agent_message_item,
    ai_agent_message_list,
    getContentAsString,
    ai_docs_setting_param,
    ai_agent_tool_call_item
} from "../../../common/req/filecat.ai.pojo";
import {wss_interface} from "../../../common/frame/type";
import {FileUtil} from "../file/FileUtil";
import {pick_model_schema} from "./tools/pick_next_model";

/** on_msg 回调的参数结构：支持分块序号、消息类型等，让前端可以分多个独立气泡渲染 */
export interface ChatMsgPayload {
    /** 文本内容片段 */
    text: string;
    /** 当前消息块在本次聊天中的序号（从 0 开始递增），前端用它区分不同气泡 */
    chunk_index: number;
    tool_call_ends?:ai_agent_tool_call_item[];
}

export interface ChatOptions {
    originMessages: ai_agent_message_list;
    token?: string;
    user_id:string;
    controller: AbortController;
    /** 流式消息回调，携带分块序号、消息类型等，前端据此创建独立气泡 */
    on_msg: (payload: ChatMsgPayload) => void;
    on_end: (stats?: { once_messages_list?:ai_agent_message_item[],_interrupted?:boolean  }) => void;
    sys_prompt?: string;
    sys_prompt_id?: string; // 系统提示词 ID（通过 index 标识）
    cwd?: string;
    /** 当前会话 ID，用于后台进程等需要关联会话的功能 */
    session_id?: string;
    /** 可动态传入的 AI 模型配置，不传则使用全局 ai_config */
    aiConfig?: ai_agent_Item;
    /** 可动态传入的环境变量配置，不传则使用全局 ai_config_env */
    aiEnv?: ai_agent_item_dotenv;
    tools?:ai_agent_params_type[]
    wss?:wss_interface
}

export class ChatCore {

    /**
     * AI 命令确认 - 等待用户确认
     * 通过 wss（WebSocket 连接）向当前用户的所有标签页推送确认请求
     */
    private async waitForCmdConfirm(user_id: string, cmd: string, wss?: wss_interface): Promise<boolean> {
        // 如果 dotenv 配置了直接执行，或者没有 wss 连接，跳过确认
        if (ai_agentService.ai_config_env?.allow_exec_cmd_directly || wss == null) {
            return true;
        }

        // 从 wss 对象上获取 token（用于查找该用户的所有标签页）
        const token = wss.token;
        if (!token) {
            // 没有 token 的情况下，直接允许（兼容旧逻辑）
            return true;
        }

        // 生成一个唯一的确认ID
        const askId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 先在 ai_agentService 中注册 pending 确认，供 WS handler 匹配
        // 直接存储 wss 对象，后续通过 wss.token 找到同一用户的所有标签页
        ai_agentService.pendingConfirmMap.set(askId, {
            user_id,
            cmd,
            createdAt: Date.now(),
            resolve: null as any,
            timeout: null as any,
            wss: wss,
        });

        return new Promise<boolean>((resolve) => {
            const pending = ai_agentService.pendingConfirmMap.get(askId)!;
            pending.resolve = resolve;

            let resolved = false;
            const safeResolve = (approved: boolean) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(pending.timeout);
                ai_agentService.pendingConfirmMap.delete(askId);
                resolve(approved);
                // 通知所有标签页关闭该 askId 的弹框
                const dismissData = new WsData(CmdType.ai_confirm_cmd, {
                    askId,
                    dismiss: true,
                });
                const dismissEncoded = dismissData.encode();
                const allWssDismiss = WsUtil.get_all_wss_by_token(token);
                for (const w of allWssDismiss) {
                    w.sendData(dismissEncoded);
                }
            };

            // 超时，默认拒绝
            pending.timeout = setTimeout(() => {
                safeResolve(false);
            }, 60000);

            // ===== 1. 向该用户的所有 WS 连接发送确认请求（同一 token 可能在多个标签页） =====
            const allWss = WsUtil.get_all_wss_by_token(token);
            if (!allWss || allWss.length === 0) {
                // 没有活跃的 WebSocket 连接，直接允许
                safeResolve(true);
                return;
            }
            const data = new WsData(CmdType.ai_confirm_cmd, {
                askId,
                cmd,
                user_id
            });
            const encoded = data.encode();
            for (const w of allWss) {
                w.sendData(encoded);
            }
        });
    }

    // 检测权限 补充参数
    private async permission_test(user_id, user: UserData, toolName:string, args: any, cwd:string,token?:string,wss?:wss_interface) {
        switch (toolName) {
            case "exec_cmd_background":
            case "exec_cmd": {
                args.cwd = args.cwd ?? cwd ?? process.cwd()// 默认这个就是允许的 工作目录 一次性的不会变得
                const cmds = StringUtil.splitBashCommands(args.cmd)
                for (const cmd of cmds) {
                    const argv = cmd.split(" ");
                    const code = await shellServiceImpl.check_exe_cmd({
                        user_id: user.id,
                        cwd: args.cwd,
                        token: token,
                        wss
                    })(argv[0], argv.slice(1));

                    if (code === exec_type.not) {
                        throw new Error(`没有权限执行命令：${cmd}`);
                    }
                }

                // 执行命令前需要用户确认
                const approved = await this.waitForCmdConfirm(user_id, args.cmd,wss);
                if (!approved) {
                    throw new Error(`用户拒绝了命令执行：${args.cmd}`);
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
            case "apply_patch":
                if (cwd != null && !path.isAbsolute(args.path)) {
                    args.path = path.join(cwd, args.path);
                }
                userService.check_user_path_by_user_id(user_id, args.path);
                userService.check_user_auth_by_user_id(
                    user_id,
                    UserAuth.filecat_file_delete_cut_rename,
                    {
                        auto_throw: true,
                        root_check: true
                    }
                );
                break;
        }

    }


    public async chat(options: ChatOptions) {
        const {
            originMessages,
            token,
            user_id,
            controller,
            on_msg,
            on_end,
            sys_prompt,
            sys_prompt_id,
            cwd,
            session_id,
            aiConfig,
            aiEnv,
            tools
        } = options;

        // 根据 sys_prompt_id（index）加载系统提示词
        let loadedSysPrompt = '';
        if (sys_prompt_id && !loadedSysPrompt) {
            const prompts = settingService.ai_system_prompts_get();
            const matched = prompts.find(p => String(p.index) === sys_prompt_id);
            if (matched && matched.prompt) {
                loadedSysPrompt = matched.prompt;
            }
        }

        // 使用传入的配置，如果未传入则回退到全局变量
        const config = aiConfig ?? ai_agentService.ai_config;
        const env = aiEnv ?? ai_agentService.ai_config_env;

        if (!config) {
            throw new Error("api 没有设置，请设置诸如豆包、openai 的 model api");
        }
        let user_local_file_prompt = ""
        if(env.options_local_file_path_prompt_list?.length) {
            for (const p of env.options_local_file_path_prompt_list) {
                try {
                    user_local_file_prompt += (await FileUtil.readFileSync(p)).toString();
                } catch (e) {
                    console.log(e)
                }
            }
        }

        const user = userService.get_user_info_by_user_id(user_id);
        const rootPath = settingService.getFileRootPathById(user_id);

        const workMessages: ai_agent_message_list = [
            {
                role: "system",
                content: `
filecat 当前软件用户当前所在的根目录是 ${rootPath}，
当前系统登陆用户是 ${user.username}，用户的id为 ${user.user_id}，${user.note}。
当前 execPath 的位置是${process.execPath}。
当前会话id 为：${session_id}

你是一个服务器机器人，当前操作系统是 ${os.platform()}，
你的能力是控制电脑服务器，执行任何可以控制服务器的命令，实现高效的运维，写代码，服务器问答，智能电脑服务器的自动化助手。
你是一个实时求实，不弄虚作假，严格按照事实来回答问题，永远不会嘲讽，对用户非常有耐心的机器人。

你是开源项目filecat的一部分，项目地址 https://github.com/xiaobaidadada/filecat。
如果用户没有问题，不要做任何tools工具调用，直接回答用户。
如果要使用tools，必须进行tools工具调用得到结果，要真的传入tool函数需要的参数，不要依据历史结论直接给用户猜测的结果。
如果你要修改项目的代码，修改完有条件的话，可以进行最小动作的测试，但是不要以执行项目来测试。
除非用户需要你直接操作本地文件，否则选择文字输出的形式给用户。
当用户没有任何问题的时候，你只需要向用户表达你可以帮助用户就可以了。
如果用户需要有结构的画图，生成画图文件，可以询问用户是否要生成Excalidraw json格式的文件，Excalidraw 的格式要求 appState 里必须有 scrollToContent 字段、zoom 等,以 .draw 后缀结尾。
如果没有特殊要求，以markdown格式回答用户。

${ai_agentService.docs_switch_get() ? ` 当你不了解某些知识的时候，直接使用search_docs工具函数来搜素本地知识库搜索相关资料，如果用到了知识库,需要给用户引用的知识库文件路径。` : ''}

${config.sys_prompt ?? ''}

${sys_prompt ?? ''}

${loadedSysPrompt ?? ''}

${user_local_file_prompt}
`
            },
            ...originMessages
            // ...await this.trimMessages(originMessages, config_env.char_max, on_msg, controller),
        ];


        const loopEnv = {
            toolLoop: env.tool_call_max,
            tool_error_max: env.tool_error_max,
            max_call_num:0, // 最大调用别的模型次数
            init_model:config.model,
        };

        // 隐式 planner
        // todo 文本 grep 搜索 历史会话搜索让ai有能力搜索到它需要知道的片面数据 让ai自己搜 只提供关键概要

        const once_messages_list:ai_agent_message_item[] = []
        let _interrupted = false
        /** 全局消息块序号：每次 AI 新产出（文本流 or 工具调用开始/结束）递增 */
        let globalChunkIndex = 0;

        while (loopEnv.toolLoop-- > 0) {

            //  用来拼完整 assistant message
            let assistantMessage:ai_agent_message_item = {
                role: "assistant",
                content: "",
                tool_call_ends:[]
            };
            once_messages_list.push(assistantMessage);
            const toolCallMap = new Map<number, any>();

            //  调用 LLM（流式）
            await this.callLLSync({
                tools,
                config:config,
                env:env,
                messages:workMessages,
                // ===== call_data =====
                call_data:(chunk) => {
                    if (!chunk) return;
                    // ===== 1. 普通内容流 =====
                    if (chunk.content) {
                        assistantMessage.content += chunk.content;
                        // 携带 chunk_index，让前端可以区分独立气泡
                        on_msg({
                            text: chunk.content,
                            chunk_index: globalChunkIndex
                        });
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
                                        arguments: tc.function?.arguments??""
                                    }
                                });
                                continue;
                            }

                            const call = toolCallMap.get(idx)!;

                            // name 只会来一次
                            if (tc.function?.name) {
                                call.function.name += tc.function.name;
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
                error_call:(e) => {
                    // 直接抛出异常，由外层 chat_ws 的 catch 统一处理
                    // 注意：不能先调 on_end，否则前端收到 ai_chat_end 后会 cleanup()，
                    // 导致后续的 ai_chat_error 消息无人接收
                    throw e
                },
                abort_error_call:()=>{
                    _interrupted = true
                },
                    controller:controller}
            );
            if(config.model !== loopEnv.init_model) {
                loopEnv.max_call_num --;
                if(loopEnv.max_call_num <= 0) {
                    config.model = loopEnv.init_model;
                }
            }

            assistantMessage.tool_calls = Array.from(toolCallMap.values());

            //  一次 LLM 完整结束，补 push assistant
            const assistantWorkMessage: ai_agent_message_item = {
                role: assistantMessage.role,
                content: assistantMessage.content,
            };
            if (assistantMessage.tool_calls?.length) {
                assistantWorkMessage.tool_calls = assistantMessage.tool_calls;
            }
            workMessages.push(assistantWorkMessage);

            // 没有 tool_calls，直接结束
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                on_end({ once_messages_list ,_interrupted});
                return;
            }

            // 有 tool_calls，开始执行工具
            await Promise.all(assistantMessage.tool_calls.map(call=>{
                return (async ()=>{
                    if(!call.function?.name)return;
                    const toolName = call.function.name as string;
                    let tool_info_value = ai_agentService.getToolInfo(toolName, {}) ?? {
                        get_name: () => toolName,
                        get_params: () => ""
                    };
                    const startTime = Date.now();
                    const callItem: ai_agent_tool_call_item = {
                        tool_name: toolName,
                        tool_display_name: tool_info_value.get_name?.() ?? toolName,
                        tool_args: null,
                        success: false,
                        error: undefined,
                        tool_result: undefined,
                        duration_ms: 0,
                        tool_call_id: call.id
                    };
                    try {
                        const args = JSON.parse(call.function.arguments || "{}");
                        callItem.tool_args = args;
                        tool_info_value = ai_agentService.getToolInfo(toolName, args) ?? tool_info_value;
                        callItem.tool_display_name = tool_info_value.get_name?.() ?? toolName;
                        await this.permission_test(user_id, user, toolName, args, cwd,token,options.wss);

                        let result = await ai_agentService.callTool(toolName, args,user_id, session_id, options.wss);
                        let resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
                        callItem.success = true;
                        callItem.tool_result = resultStr;
                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: resultStr
                        });

                        // 其他 tool额外处理
                        if (env.open_pick_model && toolName === "pick_model") {
                            // 挑选模型
                            config.model = args.model
                            loopEnv.max_call_num = args.max_call_num??1
                        }
                    } catch (e) {
                        const msg = `${e?.message??JSON.stringify(e)} ${e?.stack??""}`
                        callItem.success = false;
                        callItem.error = msg;
                        if (loopEnv.tool_error_max-- <= 0) throw e;

                        workMessages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: msg
                        });
                    } finally {
                        callItem.duration_ms = Date.now() - startTime;
                        assistantMessage.tool_call_ends.push(callItem)
                    }
                })()
            }))

            // 只是发送工具调用
            on_msg({
                text: "",
                chunk_index: globalChunkIndex,
                tool_call_ends: assistantMessage.tool_call_ends
            });
            globalChunkIndex++;

        }

        on_msg({
            text: "超出最大工具调用次数",
            chunk_index: globalChunkIndex
        });
        on_end({ once_messages_list,_interrupted });
    }


    private async callLLSync(
        props:{
            config: ai_agent_Item,
            env: ai_agent_item_dotenv,
            messages: ai_agent_message_list,
            call_data: (message: any) => void,
            error_call: (e: any) => void,
            abort_error_call?: () => void,
            controller: AbortController,
            tools:ai_agent_params_type[]
        }
    ) {
        const tools: ai_agent_params_type[] = [...ai_tools];
        if(props.env.open_pick_model) {
            tools.push(pick_model_schema)
        }
        if (ai_agentService.docs_switch_get()) {
            tools.push(ai_tools_search_docs);
        }
        tools.push(...ai_agentService.getMcpTools());
        // 合并插件工具
        tools.push(...ai_agentService.getPluginToolSchemas());
        if(props.tools) {
            tools.push(...props.tools);
        }
        let messages :ai_agent_message_list
        if(props.env.open_pick_model) {
            messages = [{
                role: "assistant",
                content: `当前使用的模型model，也就是你  为${props.config.model}`,
            },...props.messages]
        } else {
            messages = props.messages
        }
        const json_body: any = {
            messages,
            tools: tools,
            model: props.config.model,
        };

        // 合并自定义配置参数
        try {
            if (props.config.json_params) {
                const obj = JSON.parse(props.config.json_params);
                Object.assign(json_body, obj);
            }
        } catch (err) {
            console.error("解析 ai_config.json_params 失败", err);
        }

        try {
            const res = await llmPostStream(
                json_body,
                props.controller.signal,
                props.config,
                props.env
            );

            if (!res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    props.error_call(json.message || json.error?.message || text);
                } catch {
                    props.error_call(text);
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
                                props.call_data(message);
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
                        parser.feed(chunk);
                    }
                } catch (e: any) {
                    if (e.name !== "AbortError") {
                        props.error_call(e);
                    } else {
                        props.abort_error_call?.()
                    }
                } finally {
                    parser.reset();
                }
                return;
            }

            // --- 非 SSE 处理逻辑 ---
            const resultText = await res.text();
            const result = JSON.parse(resultText);
            props.call_data(result.choices[0].message);

        } catch (e: any) {
            console.log(`llm请求报错`,e)
            if (e.name !== "AbortError") {
                props.error_call(e);
            } else {
                props.abort_error_call?.()
            }
        }
    }

}

export const chat_core = new ChatCore();