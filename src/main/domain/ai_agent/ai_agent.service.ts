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
import {UserAuth} from "../../../common/req/user.req";

let API_KEY = process.env.AI_API_KEY;
let BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
let MODEL = "doubao-seed-1-6-251015";

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
                return
            }
        }
    }

    // 至少两次请求，先判断到不会需要tools，在输出，
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

        const trimMessages = (
            messages: ai_agent_messages,
            maxChars = 12000
        ) => {
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

        const workMessages: ai_agent_messages = [
            ...trimMessages(originMessages),
            {
                role: "system",
                content: `你是一个服务器机器人，当前操作系统是 ${os.platform()}，当前目录是 ${rootPath}。`
            },
            {
                role: "system",
                content: `如果需要调用工具，只返回工具调用，不要输出任何文本。`
            }
        ];

        let toolLoop = 5;
        let fileEdited = false;

        while (toolLoop-- > 0) {
            const callData = await this.callLLSync(workMessages);
            const msg = callData.choices[0].message;

            // ✅ 必须先 push assistant
            workMessages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
                break;
            }

            for (const call of msg.tool_calls) {
                const args = JSON.parse(call.function.arguments || "{}");
                const toolName = call.function.name as Ai_agentTools_type;

                // 权限校验
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
                        if (fileEdited) {
                            throw new Error("一次请求中只允许修改文件一次");
                        }
                        userService.check_user_path(token, args.path);
                        userService.check_user_auth(
                            token,
                            UserAuth.filecat_file_delete_cut_rename
                        );
                        fileEdited = true;
                        break;
                }

                let result = await Ai_agentTools[toolName](args);
                let resultStr = String(result);

                // todo 检查
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
            }
        }


        const finalMessages: ai_agent_messages = trimMessages(workMessages);
        finalMessages.push({
            role:'assistant',
            content:'现在基于以上结果对用户进行简洁的回答，并使用markdown的格式。'
        })

        const aiResponse = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: finalMessages,
                stream: true,
                temperature: 0.7
            })
        });

        if (!aiResponse.ok || !aiResponse.body) {
            res.write(
                `event: error\ndata: ${aiResponse.status === 413
                    ? "请求内容过大（413）"
                    : "AI 请求失败"
                }\n\n`
            );
            res.end();
            return;
        }

        const nodeStream = Readable.fromWeb(aiResponse.body as any);
        res.on("close", () => {
            nodeStream.destroy();
        });
        nodeStream.pipe(res);
    }



    private async callLLSync(messages: ai_agent_messages) {
        const res = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                tools: ai_tools,
                temperature: 0.2
            })
        });

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