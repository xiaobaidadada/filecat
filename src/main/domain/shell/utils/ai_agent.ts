import { ai_agent_messages } from "../../../../common/req/common.pojo";
import { chat_core } from "../../ai_agent/chat.core";
import {CharUtil, PtyShell} from "pty-shell";
import {ShellUtil} from "./shell.util";

export class ai_agent_class {

    exit: () => void;
    print: (str: string) => void;
    pty: PtyShell;

    messages: ai_agent_messages;
    token: string;

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
        this.messages = params.slice(0, params.length - 1).map(v => ({
            content: v,
            role: "user"
        }));

        this.token = params[params.length - 1];
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

    // todo 记忆功能 pty输出优化 skills记忆持久化
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

                    // this.print_buffer += msg;

                    // let lines = this.print_buffer.split("\n");
                    // this.print_buffer = lines.pop() || "";
                    //
                    // for (const line of lines) {
                    //     this.print(line.replace(/\s+$/, "") + "\r\n");
                    // }
                },

                // end callback
                () => {
                    if (this.system_line.trim()) {
                        this.messages.push({
                            content: this.system_line,
                            role: "system"
                        });
                    }
                    this.system_line = "";
                },
                `
                当前 xterm的 行长度为${this.pty.rows} 列长度为${this.pty.cols}
                用户当前使用 xterm.js 终端。输出格式按照VT 系列终端协议输出.
                当前目录：${this.pty.cwd}
                
                `,
                this.pty.cwd
            );

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