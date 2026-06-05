import React, {useState, useRef, useEffect, useLayoutEffect} from 'react';
import {ai_agentHttp, settingHttp} from "../../util/config";
import Md from "../file/component/markdown/Md";
import {throttle, debounce} from "../../../../common/fun.util";
import {ai_agent_chat_session_item, ai_agent_chat_session_meta, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_usage_stats} from "../../../../common/req/common.pojo";
import Header from "../../../meta/component/Header";
import {ActionButton, ButtonLittle, Icon} from "../../../meta/component/Button";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {copyToClipboard} from "../../util/FunUtil";
import {NotySucess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {using_confirm} from "../prompts/prompt.util";
import {RCode} from "../../../../common/Result.pojo";
import {ai_agent_item_dotenv} from "../../../../common/req/setting.req";
import {routerConfig} from "../../../../common/RouterConfig";
import {useNavigate} from "react-router-dom";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {MenuSelect} from "../prompts/Prompt";
import {InputText} from "../../../meta/component/Input";

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    attachments?: ai_agent_message_attachment_item[];
}

function MessageActions({
                            onDelete,
                            onCopy
                        }: {
    onDelete: () => void;
    onCopy: () => void;
}) {
    const {t} = useTranslation();
    return (
        <div className="message-actions">
            <button onClick={onDelete}>{t("删除")}</button>
            <button onClick={onCopy}>{t("复制")}</button>
        </div>
    );
}

function AttachmentList({attachments = []}: { attachments?: ai_agent_message_attachment_item[] }) {
    if (!attachments.length) {
        return null;
    }
    return (
        <div className="chat-message-attachments">
            {attachments.map((attachment, index) => (
                <div key={`${attachment.name}_${index}`} className="chat-message-attachment">
                    <i className="material-icons">attach_file</i>
                    <span>{attachment.name}</span>
                    <small>{attachment.size} B</small>
                </div>
            ))}
        </div>
    );
}

function guessAttachmentKind(file: File): "text" | "image" | "binary" {
    const textLikeExt = /\.(md|txt|json|js|jsx|ts|tsx|css|html?|xml|ya?ml|py|java|go|rs|c|cpp|h|hpp|sh|bat|cmd|ini|toml|csv|log|sql|env|gitignore|dockerfile)$/i;
    if (file.type?.startsWith("image/")) {
        return "image";
    }
    if (file.type?.startsWith("text/") || textLikeExt.test(file.name)) {
        return "text";
    }
    return "binary";
}

function readFileAsText(file: File) {
    return file.text();
}

function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it, index) => ({
            id: Date.now() + index,
            sender: it.role === "assistant" ? "bot" : "user",
            text: it.content,
            attachments: it.attachments ?? []
        }));
}

function toSessionTitle(title:string) {
    return title || "新会话";
}

function toAiMessages(messages: Message[]): ai_agent_message_item[] {
    return messages.map(it => ({
        role: it.sender === "bot" ? "assistant" : "user",
        content: it.text,
        attachments: it.attachments ?? []
    }));
}

export default function AiAgentChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessions, setSessions] = useState<ai_agent_chat_session_meta[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [ai_session_collapsed,set_ai_session_collapsed] = useRecoilState($stroe.ai_session_collapsed);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const toggleSessionPanel = () => {
        if (window.innerWidth <= 736) {
            set_ai_session_collapsed(true);
            return;
        }
        set_ai_session_collapsed(prev => !prev);
    }

    const set_messages = useRef(
        debounce((mes) => {
            setMessages(mes);
            if (autoScrollRef.current) {
                scrollToBottom(false);
            }
        }, 50)
    ).current;

    const [sending, set_sending] = useState(false);
    const {check_user_auth} = use_auth_check();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const confirm_dell_all = using_confirm()
    const navigate = useNavigate();
    const autoScrollRef = useRef(true);
    const env_config = useRef(new ai_agent_item_dotenv())

    const isNearBottom = (el: HTMLElement, threshold = 120) => {
        const { scrollTop, scrollHeight, clientHeight } = el;
        return scrollHeight - (scrollTop + clientHeight) < threshold;
    };

    const scrollToBottom = (smooth = false) => {
        const el = chatContainerRef.current;
        if (!el) return;
        el.scrollTo({
            top: el.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });
    };

    const addAttachments = (files: FileList | File[]) => {
        const list = Array.from(files ?? []).filter(Boolean);
        if (!list.length) return;
        setPendingAttachments(prev => [...prev, ...list]);
    };

    const buildAttachments = async (files: File[]) => {
        const attachments: ai_agent_message_attachment_item[] = [];
        for (const file of files) {
            const kind = guessAttachmentKind(file);
            let content = "";
            if (kind === "text") {
                try {
                    const text = await readFileAsText(file);
                    const maxLen = 120000;
                    content = text.length > maxLen ? `${text.slice(0, maxLen)}\n\n[内容已截断，原始长度 ${text.length} 字符]` : text;
                } catch {
                    content = "[文本读取失败]";
                }
            } else if (kind === "image") {
                content = `[图片文件: ${file.name}]`;
            } else {
                content = `[二进制文件: ${file.name}]`;
            }
            attachments.push({
                name: file.name,
                mime_type: file.type,
                size: file.size,
                kind,
                content
            });
        }
        return attachments;
    };

    const openFilePicker = () => {
        fileInputRef.current?.click();
    };

    const loadSessions = async (selectId?: string | null) => {
        const result = await ai_agentHttp.get("sessions");
        if (result.code !== RCode.Success) return;
        const list = result.data ?? [];
        setSessions(list);
        const nextId = selectId === null ? (list[0]?.id ?? "") : (selectId || activeSessionId || list[0]?.id || "");
        if (nextId) {
            await loadSession(nextId);
        } else {
            setMessages([]);
            setActiveSessionId("");
        }
    }

    const refreshSessions = async () => {
        const result = await ai_agentHttp.get("sessions");
        if (result.code === RCode.Success) {
            setSessions(result.data ?? []);
        }
    }

    const loadSession = async (sessionId: string, switch_menu = false) => {
        const result = await ai_agentHttp.post("session/get", {session_id: sessionId});
        if (result.code !== RCode.Success || !result.data) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages(toUiMessages(session.messages));
        if (switch_menu) {
            set_ai_session_collapsed(false);
        }
        requestAnimationFrame(() => scrollToBottom(false));
    }

    const createSession = async () => {
        const result = await ai_agentHttp.post("session", {title: "新会话"});
        if (result.code !== RCode.Success) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages([]);
        set_ai_session_collapsed(false);
        await loadSessions(session.id);
    }

    const init = async ()=>{
        const result = await settingHttp.get("ai_agent_setting/env");
        if (result.code === RCode.Success) {
            env_config.current = result.data
        }
        await loadSessions();
    }

    useEffect(() => {
        init();
        requestAnimationFrame(() => {
            scrollToBottom(false);
        });
    }, []);

    useEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;

        const onScroll = () => {
            autoScrollRef.current = isNearBottom(el);
        };

        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    useLayoutEffect(() => {
        if (autoScrollRef.current) {
            scrollToBottom(false);
        }
    }, [messages]);

    const get_message = (message: Message): ai_agent_message_item[] => {
        return [{
            content: message.text,
            role: message.sender === 'bot' ? 'assistant' : 'user',
            attachments: message.attachments ?? []
        }];
    };

    const handleSend = async () => {
        const text = inputValue.trim();
        if (sending || (!text && pendingAttachments.length === 0)) return;
        let sessionId = activeSessionId;
        if (!sessionId) {
            const result = await ai_agentHttp.post("session", {title: (text || pendingAttachments[0]?.name || "新会话").slice(0, 28)});
            if (result.code !== RCode.Success) return;

            const session = result.data as ai_agent_chat_session_item;
            sessionId = session.id;
            setActiveSessionId(sessionId);
            await loadSessions(sessionId);
        }

        const attachments = await buildAttachments(pendingAttachments);
        const user_message: Message = { id: Date.now(), sender: 'user', text, attachments }
        const new_messages = [...messages, user_message]
        setMessages(new_messages);
        setInputValue('');
        setPendingAttachments([]);

        set_sending(true)
        const call_pojo: Message =  {
            id:user_message.id +1,
            sender:'bot',
            text:"AI思考中..."
        }
        new_messages.push(call_pojo);
        setMessages([...new_messages]);
        let thinking_start = true
        ai_agentHttp.sse_post("chat", {messages:get_message(user_message), session_id: sessionId},{
            onMessage: (res) => {
                if(thinking_start) {
                    call_pojo.text = ""
                    thinking_start = false
                }
                try {
                    const json = JSON.parse(res);
                    const call_text_r = typeof json === "string"
                        ? json
                        : json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
                    if(call_text_r) {
                        call_pojo.text+=call_text_r;
                    }
                } catch (e) {
                    try {
                        call_pojo.text+=JSON.parse(res);
                    } catch (e) {
                        call_pojo.text+=res;
                    }
                }
                set_messages([...new_messages]);
            },
            onDone:throttle(async ()=>{
                set_sending(false)
                await refreshSessions();
                scrollToBottom(true);
            },100)
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // 检查是否是输入法回车键（macOS下输入法按回车选中文字）
        if (e.key === 'Process' || e.nativeEvent.isComposing) {
            return; // 忽略输入法回车键
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
        setInputValue(el.value);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const files = e.clipboardData?.files;
        if (files && files.length > 0) {
            e.preventDefault();
            addAttachments(files);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            e.preventDefault();
            addAttachments(files);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
        }
    };

    const removePendingAttachment = (index: number) => {
        setPendingAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleDelete = (id: number) => {
        const newMessages = messages.filter(m => m.id !== id);
        setMessages(newMessages);
        if (activeSessionId) {
            ai_agentHttp.post("session/messages", {
                session_id: activeSessionId,
                messages: toAiMessages(newMessages)
            }).catch(console.error);
        }
    };

    const handleCopy = async (text: string) => {
        copyToClipboard(text);
        NotySucess('复制成功')
    };

    const deleteSession = (sessionId: string) => {
        confirm_dell_all({
            sub_title:"确认删除这个会话吗?",
            confirm_fun:async ()=>{
                await ai_agentHttp.post("session/delete", {session_id: sessionId})
                if (activeSessionId === sessionId) {
                    setActiveSessionId("");
                    await loadSessions(null);
                } else {
                    await loadSessions(activeSessionId);
                }
            }
        })
    }

    const renameSession = (sessionId: string,title:string) => {
        let new_name = title
        confirm_dell_all({
            // sub_title:"确认删除这个会话吗?",
            confirm_fun:async ()=>{
                await ai_agentHttp.post("sessions/update/meta", {id: sessionId,title:new_name})
                await loadSessions(activeSessionId);
            },
            context_div: <div className="card-content">
                <InputText  value={new_name}
                           handleInputChange={(value) => new_name = value}/>
            </div>
        })
    }

    const showUsageStatsPopup = async (sessionId: string) => {
        set_prompt_card({
            open: true,
            title: t('字符消耗统计'),
            context_div: <div className="usage-stats-loading">{t('加载中...')}</div>,
            cancel: () => set_prompt_card({open: false}),
        });
        try {
            const result = await ai_agentHttp.post("session/usage_stats", {session_id: sessionId});
            if (result.code === RCode.Success && result.data) {
                const stats: ai_agent_usage_stats = result.data;
                set_prompt_card({
                    open: true,
                    title: t('字符消耗统计'),
                    context_div: (
                        <div className="usage-stats-panel">
                            {[
                                {l: t('对话轮次'), v: (stats.turns ?? 0).toString()},
                                {l: t('AI输入字符'), v: formatChars(stats.input_chars)},
                                {l: t('AI输出字符'), v: formatChars(stats.output_chars)},
                                {l: t('AI输入字符(最近一轮)'), v: formatChars(stats.recent_input_chars)},
                                {l: t('AI输出字符(最近一轮)'), v: formatChars(stats.recent_output_chars)},
                            ].map((row, i) => (
                                <div key={i} className="usage-stats-row">
                                    <span className="usage-stats-label">{row.l}</span>
                                    <span className="usage-stats-value">{row.v}</span>
                                </div>
                            ))}
                            <div className="usage-stats-row usage-stats-total">
                                <span className="usage-stats-label">{t('AI字符总计消耗')}</span>
                                <span className="usage-stats-value">{formatChars((stats.input_chars || 0) + (stats.output_chars || 0))}</span>
                            </div>
                        </div>
                    ),
                    cancel: () => set_prompt_card({open: false}),
                });
            } else {
                set_prompt_card({
                    open: true,
                    title: t('字符消耗统计'),
                    context_div: <div className="usage-stats-empty">{t('暂无统计数据')}</div>,
                    cancel: () => set_prompt_card({open: false}),
                });
            }
        } catch {
            set_prompt_card({
                open: true,
                title: t('字符消耗统计'),
                context_div: <div className="usage-stats-empty">{t('暂无统计数据')}</div>,
                cancel: () => set_prompt_card({open: false}),
            });
        }
    }

    const formatChars = (chars: number | undefined): string => {
        // 如果是 undefined, null 或小于 0，统一返回 "0"
        if (chars === undefined || chars === null || chars < 0) return "0";

        // 使用 toLocaleString，它会自动添加千位分隔符
        return chars.toLocaleString();
    }

    return (
       <React.Fragment>
           <Header>
               <ActionButton
                   icon={ "menu"}
                   title={t( "会话")}
                   onClick={toggleSessionPanel}
               />
               <ActionButton icon={"add"} title={t("新会话")} onClick={createSession}/>
               <ActionButton icon={"delete_sweep"} title={t("清空全部会话")} onClick={()=>{
                   confirm_dell_all({
                       sub_title:t("确认删除全部聊天会话吗?"),
                       confirm_fun:async ()=>{
                           await ai_agentHttp.post("sessions/clear", {})
                           await init()
                       }
                   })
               }}/>
               {check_user_auth(UserAuth.ai_agent_setting) &&
                   <ActionButton icon={"settings"} title={"ai setting"} onClick={()=>{
                       navigate(`/${routerConfig.ai_agent_setting_page}`);
                   }}/>
               }
           </Header>
           <div className="chat-page chat-page-with-sessions">
               {ai_session_collapsed && <div className="chat-session-overlay" onClick={() => set_ai_session_collapsed(false)}></div>}
               <aside className={`chat-session-list ${ai_session_collapsed ? "active" : ""} ${ai_session_collapsed ? "collapsed" : ""}`}>
                   {sessions.map(session => (
                       <React.Fragment key={session.id}>
                           <button

                               className={`chat-session-item ${activeSessionId === session.id ? "active" : ""}`}
                               onClick={() => loadSession(session.id, false)}
                               title={session.summary || session.long_term_memory || session.title}
                           >


                               <span>{toSessionTitle(session.title)}</span>
                               <small>{session.message_count}
                                   {/*{t("条")}*/}
                               </small>
                               {session.source === "cli" && <em className="chat-session-source">CLI</em>}
                               <MenuSelect
                                   list={[
                                       {
                                           name: t('重命名'),
                                           click: () => {
                                               renameSession(session.id,session.title)
                                           }
                                       },
                                       {
                                           name: t('字符消耗统计'),
                                           click: () => showUsageStatsPopup(session.id)
                                       },
                                       {
                                           name: t('删除'),
                                           click: () => deleteSession(session.id)
                                       }
                                   ]}  >
                                    <Icon icon={'more_horiz'}/>
                               </MenuSelect>

                           </button>

                       </React.Fragment>
                   ))}
               </aside>
               <section className="chat-main">
                   {
                       messages?.length === 0 && <div className="chat-header">{t('询问服务器的一切')}</div>
                   }
                   <div className="chat-messages" ref={chatContainerRef}>
                       {messages.map(msg => (
                           <div
                               key={msg.id}
                               className={`chat-message ${msg.sender}`}
                           >
                               <Md context={msg.text}/>
                               <AttachmentList attachments={msg.attachments}/>
                               <MessageActions
                                   onDelete={() => handleDelete(msg.id)}
                                   onCopy={() => handleCopy(msg.text)}
                               />
                           </div>
                       ))}
                       <div ref={messagesEndRef} />
                   </div>

                   <div className="chat-input-area" onDrop={handleDrop} onDragOver={handleDragOver}>
                       <input
                           ref={fileInputRef}
                           type="file"
                           multiple
                           style={{display: "none"}}
                           onChange={(e) => {
                               if (e.target.files?.length) {
                                   addAttachments(e.target.files);
                                   e.currentTarget.value = "";
                               }
                           }}
                       />
                       <div className="chat-input-shell">
                           {pendingAttachments.length > 0 && (
                               <div className="chat-attachment-strip">
                                   {pendingAttachments.map((file, index) => (
                                       <div key={`${file.name}_${index}`} className="chat-attachment-chip">
                                           <i className="material-icons">attach_file</i>
                                           <span title={file.name}>{file.name}</span>
                                           <button type="button" onClick={() => removePendingAttachment(index)}>
                                               <i className="material-icons">close</i>
                                           </button>
                                       </div>
                                   ))}
                               </div>
                           )}
                           <textarea
                               value={inputValue}
                               onChange={handleChange}
                               onPaste={handlePaste}
                               onKeyDown={handleKeyDown}
                               placeholder={t("输入消息")}
                               className="chat-input"
                           />
                       </div>
                       <ActionButton title={"添加文件"} icon={"attach_file"} onClick={openFilePicker}/>
                       {sending === false &&
                           <ButtonLittle text={t("发送")} clickFun={handleSend}/>
                       }
                   </div>
               </section>
           </div>
       </React.Fragment>
    );
}
