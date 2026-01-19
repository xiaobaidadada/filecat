import React, { useState, useRef, useEffect } from 'react';
import {ai_agentHttp} from "../../util/config";
import Md from "../file/component/markdown/Md";
import {throttle} from "../../../../common/fun.util";
import {ai_agent_message_item} from "../../../../common/req/common.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {AIAgentChatSetting} from "./AIAgentChatSetting";
import Header from "../../../meta/component/Header";
import {ActionButton} from "../../../meta/component/Button";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
// import './ChatPage.css';

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
}

export default function AiAgentChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        // {
        //     id:1,
        //     sender:'bot',
        //     text:"hello filecat"
        // }
    ]);
    const set_messages = throttle(setMessages,50)
    const [sending, set_sending] = useState(false);
    const {check_user_auth} = use_auth_check();

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [ai_agent_chat_setting, set_ai_agent_chat_setting] = useRecoilState($stroe.ai_agent_chat_setting);

    // 自动滚动到底部
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth',block: 'end' });
    };

    useEffect(() => {
        scrollToBottom();
    }, []);

    const handleSend = () => {
        const text = inputValue.trim();
        if (!text) return;
        // 打印用户的
        let new_messages = [
                ...messages,
            { id: Date.now(), sender: 'user', text }
        ]
        setMessages(new_messages);
        setInputValue('');

        set_sending(true)
        // 打印系统的
        const call_pojo =  {
            id:Date.now()+1,
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
                    call_pojo.text+=json?.choices[0]?.delta.content;
                } catch (e) {
                    call_pojo.text+=res;
                }
                set_messages([...new_messages]);
            },
            onDone:()=>{
                set_sending(false)
                scrollToBottom();
            }
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

    return (
       <React.Fragment>
           <Header>
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
               <div className="chat-messages">
                   {messages.map(msg => (
                       <div
                           key={msg.id}
                           className={`chat-message ${msg.sender}`}
                       >
                           <Md context={msg.text}/>
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
