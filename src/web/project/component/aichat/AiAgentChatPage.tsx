import React, {useState, useRef, useEffect, useLayoutEffect} from 'react';
import {ai_agentHttp, settingHttp} from "../../util/config";
import Md from "../file/component/markdown/Md";
import {throttle, debounce} from "../../../../common/fun.util";
import {ai_agent_chat_session_item, ai_agent_chat_session_meta, ai_agent_message_item} from "../../../../common/req/common.pojo";
import Header from "../../../meta/component/Header";
import {ActionButton} from "../../../meta/component/Button";
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

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
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

function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it, index) => ({
            id: Date.now() + index,
            sender: it.role === "assistant" ? "bot" : "user",
            text: it.content
        }));
}

function toSessionTitle(title:string) {
    return title || "新会话";
}

function toAiMessages(messages: Message[]): ai_agent_message_item[] {
    return messages.map(it => ({
        role: it.sender === "bot" ? "assistant" : "user",
        content: it.text
    }));
}

export default function AiAgentChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessions, setSessions] = useState<ai_agent_chat_session_meta[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [ai_session_collapsed,set_ai_session_collapsed] = useRecoilState($stroe.ai_session_collapsed);

    const { t } = useTranslation();

    const toggleSessionPanel = () => {
        if (window.innerWidth <= 736) {
            set_ai_session_collapsed(true);
            return;
        }
        set_ai_session_collapsed(prev => !prev);
    }

    const set_messages = useRef(
        debounce((mes) => {
            let next = mes;
            if (mes.length > env_config.current.messages_show_max) {
                next = mes.slice(-env_config.current.messages_show_max);
            }
            setMessages(next);
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

    const loadSession = async (sessionId: string, closeMenu = false) => {
        const result = await ai_agentHttp.post("session/get", {session_id: sessionId});
        if (result.code !== RCode.Success || !result.data) return;
        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);
        setMessages(toUiMessages(session.messages));
        if (closeMenu) {
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
            role: message.sender === 'bot' ? 'assistant' : 'user'
        }];
    };

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text || sending) return;
        let sessionId = activeSessionId;
        if (!sessionId) {
            const result = await ai_agentHttp.post("session", {title: text.slice(0, 28)});
            if (result.code !== RCode.Success) return;

            const session = result.data as ai_agent_chat_session_item;
            sessionId = session.id;
            setActiveSessionId(sessionId);
            await loadSessions(sessionId);
        }

        const user_message: Message = { id: Date.now(), sender: 'user', text }
        const new_messages = [...messages, user_message]
        setMessages(new_messages);
        setInputValue('');

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
                       <button
                           key={session.id}
                           className={`chat-session-item ${activeSessionId === session.id ? "active" : ""}`}
                           onClick={() => loadSession(session.id, true)}
                           title={session.summary || session.long_term_memory || session.title}
                       >
                           <span>{toSessionTitle(session.title)}</span>
                           <small>{session.message_count}
                               {/*{t("条")}*/}
                           </small>
                           {session.source === "cli" && <em className="chat-session-source">CLI</em>}
                           <i onClick={(e)=>{
                               e.stopPropagation();
                               deleteSession(session.id);
                           }}>×</i>
                       </button>
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
                               <MessageActions
                                   onDelete={() => handleDelete(msg.id)}
                                   onCopy={() => handleCopy(msg.text)}
                               />
                           </div>
                       ))}
                       <div ref={messagesEndRef} />
                   </div>

                   <div className="chat-input-area">
                    <textarea
                        value={inputValue}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={t("输入消息")}
                        className="chat-input"
                    />
                       {sending === false &&
                           <button  onClick={handleSend}>{t("发送")}</button>
                       }
                   </div>
               </section>
           </div>
       </React.Fragment>
    );
}
