import React, { useState, useRef, useEffect } from 'react';
import {ai_agentHttp} from "../../util/config";
import Md from "../file/component/markdown/Md";
import {throttle} from "../../../../common/fun.util";
// import './ChatPage.css';

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id:1,
            sender:'bot',
            text:"hello filecat"
        }
    ]);
    const set_messages = throttle(setMessages,50)
    const [sending, set_sending] = useState(false);

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
            text:""
        }
        new_messages.push(call_pojo);
        setMessages(new_messages);
        const messages_p = [
            { role: "system", content: `
        你是一个可以使用工具的 Agent。
        ` }   ]
        messages_p.push({ role: "user", content: text });
        ai_agentHttp.sse_post("chat", {messages:messages_p},{
            onMessage: (res) => {
                const json = JSON.parse(res);
                call_pojo.text+=json?.choices[0]?.delta.content;
                console.log(json);
                set_messages([...new_messages]);
            },
            onDone:()=>{
                set_sending(false)
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
        <div className="chat-page">
            {/*<div className="chat-header">询问服务器的一切</div>*/}
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
    );
}
