import React, { useState, useRef, useEffect } from 'react';
import {ai_agentHttp} from "../../util/config";
import Md from "../file/component/markdown/Md";
import {throttle,debounce} from "../../../../common/fun.util";
import {ai_agent_message_item} from "../../../../common/req/common.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {AIAgentChatSetting} from "./AIAgentChatSetting";
import Header from "../../../meta/component/Header";
import {ActionButton} from "../../../meta/component/Button";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {copyToClipboard} from "../../util/FunUtil";
import {NotySucess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {using_confirm} from "../prompts/prompt.util";
// import './ChatPage.css';

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
}

const MESSAGE_KEY = "chat_messages";
const MAX_MESSAGES = 200;

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


export function getMessagesFromLocal(): any[] {
    try {
        const data = localStorage.getItem(MESSAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("读取 messages 失败", e);
        return [];
    }
}

export function setMessagesToLocal(messages: any[]) {
    try {
        const truncated = messages.slice(-MAX_MESSAGES);
        localStorage.setItem(MESSAGE_KEY, JSON.stringify(truncated));
    } catch (e) {
        console.error("保存 messages 到 localStorage 失败", e);
    }
}

export function pushMessageToLocal(message: any) {
    const messages = getMessagesFromLocal();
    if(messages?.length > 0 && messages[messages.length - 1].id === message.id) {
        return;
    }
    messages.push(message);
    setMessagesToLocal(messages);
}

export function learAllMessages(): void {
    setMessagesToLocal([]);
}


export default function AiAgentChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        // {
        //     id:1,
        //     sender:'bot',
        //     text:"hello filecat"
        // }
    ]);
    const set_messages = debounce(setMessages,50)
    const [sending, set_sending] = useState(false);
    const {check_user_auth} = use_auth_check();

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [ai_agent_chat_setting, set_ai_agent_chat_setting] = useRecoilState($stroe.ai_agent_chat_setting);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const isUserScrollingRef = useRef(false);
    const confirm_dell_all = using_confirm()

    // 自动滚动到底部
    const scrollToBottom = (call?:any) => {
        setTimeout(()=>{
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth',block: 'end' });
            if(call) {
                call()
            }
            setTimeout(()=>{
                isUserScrollingRef.current =false;
            },100)
        },500)
    };
    const init = ()=>{
        setMessages(getMessagesFromLocal())
    }
    useEffect(() => {
        const el = chatContainerRef.current;
        init()
        scrollToBottom(()=>{
            setTimeout(()=>{
                el?.addEventListener('scroll', onScroll);
            },1000)
        })
        const onScroll = (el) => {
            isUserScrollingRef.current = true
        };
        return () => el?.removeEventListener('scroll', onScroll);
    }, []);

    const handleSend = () => {
        const text = inputValue.trim();
        if (!text) return;
        // 打印用户的
        const user_message = { id: Date.now(), sender: 'user', text }
        let new_messages = [
                ...messages,
            user_message
        ]
        pushMessageToLocal(user_message)
        setMessages(new_messages);
        setInputValue('');

        set_sending(true)
        // 打印系统的
        const call_pojo =  {
            id:user_message.id +1,
            sender:'bot',
            text:"AI思考中..."
        }
        new_messages.push(call_pojo);
        setMessages(new_messages);
        const messages_p = messages.map((message) => {
            return {
                content: message.text,
                role: message.sender === 'bot'? 'system': 'user'
            } as ai_agent_message_item
        })
        messages_p.push({ role: "user", content: text });
        let thinking_start = true
        scrollToBottom();
        ai_agentHttp.sse_post("chat", {messages:messages_p},{
            onMessage: (res) => {
                if(thinking_start) {
                    call_pojo.text = ""
                    thinking_start = false
                }
                try {
                    const json = JSON.parse(res);
                    const call_text_r = json?.choices[0]?.delta.content
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
                if(!isUserScrollingRef.current) {
                    scrollToBottom();
                }
            },
            onDone:throttle(()=>{
                set_sending(false)
                scrollToBottom();
                pushMessageToLocal(call_pojo)
            },600)
        });

        // 模拟 bot 回复
        // setTimeout(() => {
        //     const botMessage: Message = {
        //         id: Date.now() + 1,
        //         sender: 'bot',
        //         text: `你说的是: "${text}"`,
        //     };
        //     setMessages(prev => [...prev, botMessage]);
        // }, 600);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // 防止换行
            handleSend();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px'; // 最大高度 200px
        setInputValue(el.value);
    };

    const handleDelete = (id: number) => {
        const newMessages = messages.filter(m => m.id !== id);
        setMessages(newMessages);
        setMessagesToLocal(newMessages);
    };

    const handleCopy = async (text: string) => {
        copyToClipboard(text);
        NotySucess('复制成功')
    };

    return (
       <React.Fragment>
           <Header>
               <ActionButton icon={"delete_sweep"} title={"清空聊天历史"} onClick={()=>{
                   confirm_dell_all({
                       sub_title:"确认删除全部聊天内容吗",
                       confirm_fun:()=>{
                           learAllMessages()
                           init()
                       }
                   })
               }}/>
               {check_user_auth(UserAuth.ai_agent_setting) &&
                   <ActionButton icon={"settings"} title={"ai setting"} onClick={()=>{
                       set_ai_agent_chat_setting(true);
                   }}/>
               }
           </Header>
           <div className="chat-page">
               {
                   messages?.length === 0 && <div className="chat-header">询问服务器的一切</div>
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
                    placeholder="输入消息，Shift+Enter换行"
                    className="chat-input"
                />
                   {sending === false &&
                       <button  onClick={handleSend}>发送</button>
                   }
               </div>

           </div>
           { ai_agent_chat_setting && <AIAgentChatSetting />}
       </React.Fragment>
    );
}
