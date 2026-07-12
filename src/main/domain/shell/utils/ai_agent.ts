
import {chat_core} from "../../ai_agent/chat.core";
import {aiAgentMemoryService} from "../../ai_agent/ai_agent.memory";
import {userService} from "../../user/user.service";
import {PtyShell} from "pty-shell";
import {MarkdownToAnsiConverter, ShellUtil} from "./shell.util";
import fs from 'fs'
import path from "path";
import {ai_agent_chat_session_item, ai_agent_message_item, ai_agent_message_list, getContentAsString} from "../../../../common/req/filecat.ai.pojo";
import {ai_agentService} from "../../ai_agent/ai_agent.service";
import {wss_interface} from "../../../../common/frame/type";

export class ai_agent_class {

    exit: () => void;
    print: (str: string) => void;
    pty: PtyShell;

    messages: ai_agent_message_list;
    pendingMessages: ai_agent_message_list = [];
    session: ai_agent_chat_session_item;
    token: string;
    userId: string;
    sessionId: string;
    isTemporarySession: boolean = false;
    is_once = false;
    wss:wss_interface

    controller = new AbortController();

    system_line = "";

    /** Markdown → ANSI 流式转换器 */
    private md2ansi = new MarkdownToAnsiConverter();

    killed: boolean = false;
    kill() {
        if(this.killed) {
            return;
        }
        this.killed = true;
        this.controller.abort();
        this.messages = [];
        this.system_line = "";
        // 回到 shell 输入模式前清掉转换器
        this.md2ansi.reset();
        this.exit()
        this.pty.on_child_kill(0)
    }

    init() {
        this.chat().catch(e => {
            this.print(`${e?.message ?? e}`);
            this.chat_done()
        });
    }

    isFile(path) {
        try {
            return fs.statSync(path).isFile();
        } catch {
            return false;
        }
    }

    constructor(
        pty: PtyShell,
        exit: () => void,
        print: (str: string) => void,
        params: any[]
    ) {
        this.pty = pty;
        this.exit = exit
        this.print = print;
        
        // 检查是否有 --temp 参数
        const filteredParams: string[] = [];
        for (const param of params) {
            if (param === '--temp' || param === '-t') {
                this.isTemporarySession = true;
            } else if( param === '--once') {
                this.is_once = true;
            }else {
                if(typeof param === 'object') {
                    this.wss = param;
                    continue
                }
                filteredParams.push(param);
            }
        }

        this.userId = filteredParams[filteredParams.length - 3];
        this.token = filteredParams[filteredParams.length - 2];

        const messages: string[] = [];
        
        for (let i = 0; i < filteredParams.length - 2; i++) {
            try {
                const str1 = filteredParams[i]
                if (str1 === '-f' || str1 === '--file') {
                    let p = filteredParams[i + 1]
                    if (!path.isAbsolute(p)) {
                        p = path.join(pty.cwd, p)
                        if (!this.isFile(p)) {
                            continue
                        }
                    }
                    const content = fs.readFileSync(p).toString();
                    messages.push(content)
                    i++; // 跳过下一个
                } else {
                    messages.push(str1);
                }
            } catch (e) {
                console.log(e)
            }
        }
        
        // this.userId = userService.get_user_info_by_token(this.token).id;
        
        // 如果有 --new 参数，创建临时会话（不持久化）
        if (this.isTemporarySession) {
            this.sessionId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this.session = {
                id: this.sessionId,
                title: "命令行会话",
                messages: [],
                summary: "",
                long_term_memory: "",
                source: "cli",
                created_at: Date.now(),
                updated_at: Date.now(),
            };
            this.messages = [];
            this.pendingMessages = [
                ...messages.map(v => ({
                    content: v,
                    role: "user" as const
                })) as ai_agent_message_item[]
            ];
            // 设置标志表示这是临时会话
        } else {
            // 正常会话，持久化存储
            this.session = aiAgentMemoryService.ensure_single_session(this.userId, "cli", "命令行会话");
            this.sessionId = this.session.id;
            this.messages = [
                ...(this.session.messages ?? []),
            ];
            this.pendingMessages = [
                ...messages.map(v => ({
                    content: v,
                    role: "user" as const
                })) as ai_agent_message_item[]
            ];
        }
    }

    chat_done() {
        // 刷新 Markdown 转换器缓冲区
        const flushOut = this.md2ansi.flush();
        if (flushOut) {
            this.pty.on_call(flushOut);
        }
        this.md2ansi.reset();
        this.pty.not_write = false
        this.print("User:");
    }

    async chat() {

        this.print(ShellUtil.color("Ai:",'ai'));
        this.pty.not_write = true

        const sysPrompt = `
                当前 xterm的 行长度为${this.pty.rows} 列长度为${this.pty.cols}
                用户当前使用 xterm.js 终端。
                输出格式要求：你输出的内容是 Markdown 格式，服务端会自动转换为 ANSI 终端样式渲染。
                支持的 Markdown 语法：**粗体**、*斜体*、# 标题、- 列表、\`行内代码\`、\`\`\`代码块\`\`\`、> 引用、[链接](url)、--- 分割线。
                请尽量使用这些格式让终端输出更美观。
                用户打开命令行终端时候的目录是：${this.pty.cwd}
                
                当用户没有任何问题的时候，你只需要向用户表达你可以帮助用户就可以了，不要做多余的事情。
                                `;

        try {
            // 合并 model tool（注册为 tool 的其他 AI 模型）
            const tools =ai_agentService.getModelToolSchemas();
            const workMessages = aiAgentMemoryService.build_context_by_session(this.session, this.pendingMessages);
            await chat_core.chat({
                wss:this.wss,
                session_id: this.sessionId,
                tools,
                originMessages: workMessages,
                token: this.token,
                user_id:this.userId,
                controller: this.controller,

                // stream output：将 Markdown 转为 ANSI 后写入终端
                on_msg: (payload) => {
                    const msg = payload.text;
                    const ansi = this.md2ansi.push(msg);
                    if (ansi) {
                        this.pty.on_call(ansi);
                    }
                    this.system_line += msg;
                },

                // end callback
                on_end: (stats) => {
                    // 刷新 Markdown 转换器缓冲区
                    const flushOut = this.md2ansi.flush();
                    if (flushOut) {
                        this.pty.on_call(flushOut);
                    }
                    this.md2ansi.reset();

                    if (this.system_line.trim() && this.pendingMessages.length > 0) {
                        const latestUserMessage = [...this.pendingMessages].reverse().find(it => it.role === "user");
                        if (latestUserMessage) {
                            const assistantText = (stats?.once_messages_list ?? [])
                                .map(it => getContentAsString(it.content))
                                .filter(Boolean)
                                .join("\n\n");
                            const assistantMessage = {
                                content: assistantText,
                                content_list: stats?.once_messages_list ?? [],
                                role: "assistant" as const
                            };
                            this.session.messages = [
                                ...(this.session.messages ?? []),
                                ...this.pendingMessages,
                                assistantMessage
                            ];
                            this.messages = this.session.messages;
                            this.pendingMessages = [];
                            
                            // 只有非临时会话才保存到持久化存储
                            if (!this.isTemporarySession) {
                                // 不传 turnStats，让 appendTurn 内部自动计算 token（异步，不阻塞前端）
                                aiAgentMemoryService.appendTurn(this.userId, this.sessionId, latestUserMessage, assistantMessage).catch(console.error);
                            }
                        }
                    }
                    this.system_line = "";
                    if(this.is_once) {
                        this.kill()
                    }
                },
                sys_prompt: sysPrompt,
                cwd: this.pty.cwd,
            });

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
        this.pendingMessages.push({
            content: line,
            role: "user"
        });
        this.chat().catch(e => {
            this.print(`${e?.message ?? e}`);
            this.chat_done();
        });
    }
}
