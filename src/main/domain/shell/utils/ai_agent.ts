import { ai_agent_message_item, ai_agent_messages } from "../../../../common/req/common.pojo";
import { chat_core } from "../../ai_agent/chat.core";
import { aiAgentMemoryService } from "../../ai_agent/ai_agent.memory";
import { userService } from "../../user/user.service";
import {CharUtil, PtyShell} from "pty-shell";
import {ShellUtil} from "./shell.util";

export class ai_agent_class {

    exit: () => void;
    print: (str: string) => void;
    pty: PtyShell;

    messages: ai_agent_messages;
    token: string;
    userId: string;
    sessionId: string;

    controller = new AbortController();

    system_line = "";

    // private print_buffer = "";

    killed: boolean = false;
    kill() {
        if(this.killed) {
            return;
        }
        this.killed = true;
        this.controller.abort();
        this.messages = [];
        this.system_line = "";
        // this.print_buffer = "";
        this.exit()
    }

    init() {
        this.chat().catch(e => {
            this.print(`${e?.message ?? e}`);
            this.chat_done()
        });
    }

    constructor(
        pty: PtyShell,
        exit: () => void,
        print: (str: string) => void,
        params: string[]
    ) {
        this.pty = pty;
        this.exit = exit
        this.print = print;
        this.token = params[params.length - 1];
        this.userId = userService.get_user_info_by_token(this.token).id;
        const session = aiAgentMemoryService.ensure_single_session(this.userId, "cli", "命令行会话");
        this.sessionId = session.id;
        this.messages = [
            ...(session.messages ?? []),
            ...params.slice(0, params.length - 1).map(v => ({
                content: v,
                role: "user" as const
            })) as ai_agent_message_item[]
        ];
    }

    chat_done() {
        this.pty.not_write = false
        // flush 残留输出
        // if (this.print_buffer.trim()) {
        //     this.print(this.print_buffer);
        //     this.print_buffer = "";
        // }
        // const str =ShellUtil.color("User:",'user')
        this.print("User:");
    }

    async chat() {

        this.print(ShellUtil.color("Ai:",'ai'));
        this.pty.not_write = true

        try {
            await chat_core.chat(
                this.messages,
                this.token,
                this.controller,

                // stream output
                (msg: string) => {
                    // if(msg.includes('')) {
                    //     // 豆包这样的弱模型不会处理换行
                    //     msg = '\n\r'
                    // }
                    this.pty.on_call(msg)
                    this.system_line += msg;
                },

                // end callback
                () => {
                    if (this.system_line.trim() && this.messages.length > 0) {
                        const latestUserMessage = [...this.messages].reverse().find(it => it.role === "user");
                        if (latestUserMessage) {
                            const assistantMessage = {
                                content: this.system_line,
                                role: "assistant" as const
                            };
                            aiAgentMemoryService.appendTurn(this.userId, this.sessionId, latestUserMessage, assistantMessage).catch(console.error);
                            this.messages.push(assistantMessage);
                        }
                    }
                    this.system_line = "";
                },
                `
                当前 xterm的 行长度为${this.pty.rows} 列长度为${this.pty.cols}
                用户当前使用 xterm.js 终端。输出格式按照VT 系列终端协议输出.
                用户所在的当前最新目录是：${this.pty.cwd}
                
                `,
                this.pty.cwd
            );

        } catch (e) {
            this.pty.on_call(e?.message ?? JSON.stringify(e));
        } finally {
            this.chat_done();
        }
    }

    write(line: string): void {
        line = line.trim();
        if(line === "exit") {
            this.kill()
            return;
        }
        this.messages.push({
            content: line,
            role: "user"
        });
        this.chat().catch(e => {
            this.print(`${e?.message ?? e}`);
            this.chat_done();
        });
    }
}
