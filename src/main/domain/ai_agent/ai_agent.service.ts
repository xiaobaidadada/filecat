import {ai_tools} from "./ai_agent.constant";
import {ai_agent_messages} from "../../../common/req/common.pojo";
import { Response } from "express";
import {Readable} from "stream";
import os from "os";
import {Ai_agentTools, Ai_agentTools_type} from "./ai_agent.tools";
import {settingService} from "../setting/setting.service";
import path from "path";
import {userService} from "../user/user.service";
import {SystemUtil} from "../sys/sys.utl";
import {exec_type} from "pty-shell";
import {shellServiceImpl} from "../shell/shell.service";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {ai_agent_Item} from "../../../common/req/setting.req";

let API_KEY = process.env.AI_API_KEY;
let BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
let MODEL = "doubao-seed-1-6";
let config:ai_agent_Item

/**
 * 边输出部分结果，边进行工具调用，这是怎么做到的
 */
export class Ai_agentService {

    public load_key() {
        const r = settingService.ai_agent_setting()
        for (const it of r.models) {
            if(it.open) {
                MODEL = it.model
                BASE_URL = it.url
                API_KEY = it.token
                config = it
                return
            }
        }
        config = undefined
        API_KEY = undefined
        BASE_URL = undefined
        MODEL = undefined
    }

    private trimMessages(
        messages: ai_agent_messages,
        maxChars = 12000
    )  {
                let total = 0;
                const result: ai_agent_messages = [];

                for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                const size = JSON.stringify(msg).length;
                if (total + size > maxChars) break;
                total += size;
                result.unshift(msg);
             }
             return result;
        };

    private async permission_test(token,env,user:UserData,toolName,args:any) {
        switch (toolName) {
            case "exec_cmd": {
                const cmd = args.cmd?.trim();
                if (!cmd) throw new Error("cmd 不能为空");

                const argv = cmd.split(" ");
                const code = await shellServiceImpl.check_exe_cmd({
                    user_id: user.id,
                    cwd: process.cwd()
                })(argv, argv.slice(1));

                if (code === exec_type.not) {
                    throw new Error(`没有权限执行命令：${cmd}`);
                }
                break;
            }

            case "list_files":
            case "read_file":
                userService.check_user_path(token, args.path);
                break;

            case "edit_file":
                if (env.fileEdited) {
                    throw new Error("一次请求中只允许修改文件一次");
                }
                userService.check_user_path(token, args.path);
                userService.check_user_auth(
                    token,
                    UserAuth.filecat_file_delete_cut_rename
                );
                env.fileEdited = true;
                break;
        }

    }

    /**
     * 对话每一次都需要把之前全部的message填充过去，所以对话越长，每一次对话的时候消耗的token越多
     * todo 添加记忆能力，每一次对话都不断的让ai总结之前的聊天内容，节省token，现在可以通过让AI返回的时候内容尽量简洁一点，从而节省一点token
     * @param originMessages
     * @param res
     * @param token
     */
    public async chat(
        originMessages: ai_agent_messages,
        res: Response,
        token: string
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
                1. 你是一个服务器机器人，当前操作系统是 ${os.platform()}，当前目录是 ${rootPath}，当前系统登陆用户是${user.username}，用户的id为${user.user_id}，${user.note}。
                2. 请直接提供答案，无需解释思考过程。
                3. 使用markdown的格式，在保证可以给全用户所需要的信息前提下，对用户进行简洁的回答。
                
                ${config.sys_prompt??''}
                `
            },
            ...this.trimMessages(originMessages)
        ];
        const env = {
            toolLoop: 5,
            fileEdited:false
        }
        while (env.toolLoop-- > 0) {
            const callData = await this.callLLSync(workMessages);
            const msg = callData.choices[0].message;
            // ✅ 必须先 push assistant
            workMessages.push(msg);
            if (!msg.tool_calls || msg.tool_calls.length === 0) {
                this.write_to_res(res, msg.content);
                this.end_to_res(res)
                return res;
            } else {
                const send_text =  msg.content || msg.reasoning_content || ""
                if(send_text)
                    this.write_to_res(res, msg.content || msg.reasoning_content || "");
            }
            const fun_tasks = []
            for (const call of msg.tool_calls) {
                fun_tasks.push((async ()=>{
                    const args = JSON.parse(call.function.arguments || "{}");
                    const toolName = call.function.name as Ai_agentTools_type;
                    // 权限校验
                    await this.permission_test(token,env,user,toolName,args);
                    let result = await Ai_agentTools[toolName](args);
                    let resultStr = String(result);
                    if (resultStr.length > 5000) {
                        resultStr =
                            resultStr.slice(0, 4000) + "\n...（内容过长已截断）";
                    }
                    // ✅ tool 必须紧跟 assistant(tool_calls)
                    workMessages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: resultStr
                    });
                })())
            }
            await Promise.all(fun_tasks);
        }
        this.write_to_res(res, "超出最大理解语义次数");
        this.end_to_res(res)
        return res;

    }

    public write_to_res(res:Response,text:string) {
        res.write(
            `event: message\ndata: ${JSON.stringify(text)}\n\n`
        );
    }

    public end_to_res(res:Response) {
        res.write(`data: [DONE]\n\n`);
        res.end();
    }

    // 暂时不用
    private async flow_call(res:Response,work_messages:ai_agent_messages ) {
        const finalMessages: ai_agent_messages = this.trimMessages(work_messages);
        finalMessages.push({
            role:'system',
            content:'现在基于以上结果对用户进行简洁的回答，并使用markdown的格式。'
        })
        let json_body :any = {
            model: MODEL,
            messages: finalMessages,
            stream: true,
            temperature: 0.7
        }
        try {
            if(config.json_params) {
                const obj = JSON.parse(config.json_params);
                for (const key of Object.keys(obj)) {
                    json_body[key] = obj[key];
                }
            }
        }catch(err) {
            console.log(err)
        }
        // const l_time = Date.now();
        const aiResponse = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify(json_body)
        });
        // console.log(`最终回答耗时: ${((Date.now() - l_time)/1000)} s`)
        if (!aiResponse.ok || !aiResponse.body) {
            res.write(
                `event: error\ndata: ${aiResponse.status === 413
                    ? "请求内容过大（413）"
                    : "AI 请求失败"
                }\n\n`
            );
            res.end();
            return res;
        }
        if(!json_body.stream) {
            const r = await aiResponse.json()
            const msg = r.choices[0].message;
            this.write_to_res(res, msg.content);
            res.end();
            return res;
        }
        const nodeStream = Readable.fromWeb(aiResponse.body as any);
        res.on("close", () => {
            nodeStream.destroy();
        });
        nodeStream.pipe(res);
        return nodeStream;
    }

    private async callLLSync(messages: ai_agent_messages) {
        // const l_time = Date.now();
        const json_body :any = {
            model: MODEL,
            messages,
            tools: ai_tools,
            temperature: 0.2,
            // thinking : { // 豆包深度思考
            //     "type":"disabled"
            // }
        }
        try {
            if(config.json_params) {
                const obj = JSON.parse(config.json_params);
                for (const key of Object.keys(obj)) {
                    if(key === "messages" || key === "tools" || key === "stream") {
                        continue
                    }
                    json_body[key] = obj[key];
                }
            }
        } catch(err) {
            console.log(err)
        }
        const res = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify(json_body)
        });
        // console.log(`一次请求耗时 ${(Date.now() - l_time)/1000} s`)
        if (!res.ok) {
            const text = await res.text();
            try {
                const json = JSON.parse(text);
                throw new Error(json.message || json.error?.message || text);
            } catch {
                throw new Error(text);
            }
        }

        return res.json();
    }

}

export const ai_agentService = new Ai_agentService();