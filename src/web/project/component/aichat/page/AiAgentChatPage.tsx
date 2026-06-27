import React, {useState, useRef, useEffect, useLayoutEffect} from 'react';
import {ai_agentHttp, settingHttp} from "../../../util/config";
import {throttle, debounce} from "../../../../../common/fun.util";
import Header from "../../../../meta/component/Header";
import {ActionButton, Icon} from "../../../../meta/component/Button";
import {use_auth_check} from "../../../util/store.util";
import {UserAuth} from "../../../../../common/req/user.req";
import {copyToClipboard} from "../../../util/FunUtil";
import {NotySuccess} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {using_confirm} from "../../prompts/prompt.util";
import {RCode} from "../../../../../common/Result.pojo";
import {routerConfig} from "../../../../../common/RouterConfig";
import {useNavigate} from "react-router-dom";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../util/store";
import {MenuSelect} from "../../prompts/Prompt";
import {InputText, Select} from "../../../../meta/component/Input";
import {useCmdConfirm} from "../useCmdConfirm";
import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta,
    ai_agent_content, ai_agent_content_part,
    ai_agent_item_dotenv, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_usage_stats,
    ai_system_prompt_item,
    getContentAsString
} from "../../../../../common/req/filecat.ai.pojo";

// ===== 导入拆分的子组件 =====
import SessionList from "./SessionList";
import ChatInput from "./ChatInput";
import RequestTypeSelector from "./RequestTypeSelector";
import {renderMessageByType, handleNonCompletionsRequest} from "./RequestTypeRenderers";
import {use_llm_request_type} from "../type";

interface Message {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    attachments?: ai_agent_message_attachment_item[];
    // 多模态结果属性（由后端返回，前端自判断渲染，有哪个就渲染哪个）
    images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    audio?: { data?: string; url?: string; mime_type?: string };
    embeddings?: any;
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

/** 将图片文件转为 base64 字符串 */
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function toUiMessages(messages: ai_agent_message_item[] = []): Message[] {
    return messages
        .filter(it => it.role === "user" || it.role === "assistant")
        .map((it, index) => ({
            id: Date.now() + index,
            sender: it.role === "assistant" ? "bot" : "user",
            text: getContentAsString(it.content),
            attachments: it.attachments ?? [],
            images: it.images,
            audio: it.audio,
            embeddings: it.embeddings,
        }));
}

function toAiMessages(messages: Message[]): ai_agent_message_item[] {
    return messages.map(it => ({
        role: it.sender === "bot" ? "assistant" : "user",
        content: it.text,
        attachments: it.attachments ?? [],
        images: it.images,
        audio: it.audio,
        embeddings: it.embeddings,
    }));
}

export default function AiAgentChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessions, setSessions] = useState<ai_agent_chat_session_meta[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [ai_session_collapsed,set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [requestType, setRequestType] = useAtom($stroe.ai_request_type);
    useCmdConfirm();
    const REQUEST_TYPE_OPTIONS = use_llm_request_type()

    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);

    // ===== 批量勾选相关状态 =====
    const [batchMode, setBatchMode] = useState(false); // 是否批量选择模式
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

    const toggleBatchMode = () => {
        if (batchMode) {
            setSelectedMsgIds(new Set());
            setSelectedSessionIds(new Set());
        }
        setBatchMode(prev => !prev);
    };

    const toggleMsgSelect = (id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSessionSelect = (id: string) => {
        setSelectedSessionIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const batchDeleteMessages = () => {
        if (selectedMsgIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("确认删除选中的聊天消息吗?"),
            confirm_fun: () => {
                const newMessages = messages.filter(m => !selectedMsgIds.has(m.id));
                setMessages(newMessages);
                setSelectedMsgIds(new Set());
                setBatchMode(false);
                if (activeSessionId && newMessages.length !== messages.length) {
                    ai_agentHttp.post("session/messages", {
                        session_id: activeSessionId,
                        messages: toAiMessages(newMessages)
                    }).catch(console.error);
                }
            }
        });
    };

    const batchDeleteSessions = () => {
        if (selectedSessionIds.size === 0) return;
        confirm_dell_all({
            sub_title: t("确认删除选中的会话吗?"),
            confirm_fun: async () => {
                for (const sid of selectedSessionIds) {
                    await ai_agentHttp.post("session/delete", { session_id: sid });
                }
                setSelectedSessionIds(new Set());
                setBatchMode(false);
                if (selectedSessionIds.has(activeSessionId)) {
                    setActiveSessionId("");
                    await loadSessions(null);
                } else {
                    await loadSessions(activeSessionId);
                }
            }
        });
    };

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
    const env_config = useRef(new ai_agent_item_dotenv());
    const [sysPromptList, setSysPromptList] = useState<ai_system_prompt_item[]>([]);
    const [currentModelName, setCurrentModelName] = useState('');

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
                // 将图片转为 base64 数据，用于多模态请求
                try {
                    content = await fileToBase64(file);
                } catch {
                    content = `[图片文件: ${file.name}]`;
                }
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

    const createSession = async (sysPrompt?: string) => {
        const result = await ai_agentHttp.post("session", {title: "新会话"});
        if (result.code !== RCode.Success) return;

        const session = result.data as ai_agent_chat_session_item;
        setActiveSessionId(session.id);

        if (sysPrompt) {
            // 修改点 1：不直接塞入 messages，而是设置到 inputValue
            setInputValue(sysPrompt);
            setMessages([]);
        } else {
            setMessages([]);
        }

        set_ai_session_collapsed(false);
        await loadSessions(session.id);

        requestAnimationFrame(() => {
            const el = document.querySelector('.chat-input') as HTMLTextAreaElement;
            if (el) {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }
        });
    };

    // handleCmdConfirmResponse 来自 useCmdConfirm hook

    const init = async ()=>{
        // 注：cmdConfirm 的 WS 监听已由 useCmdConfirm hook 处理

        const result = await settingHttp.get("ai_agent_setting/env");
        if (result.code === RCode.Success) {
            env_config.current = result.data
            // 从后端获取当前激活的模型
            const note = result.data.current_model_note || '';
            const found = (result.data.options_agent_model_list ?? []).find(m => m.label === note);
            setCurrentModelName(found ? found.value : note);
        }
        await loadSessions();
        // 加载系统会话提示词列表
        const sysPromptResult = await ai_agentHttp.get("system_prompts");
        if (sysPromptResult.code === RCode.Success) {
            setSysPromptList(sysPromptResult.data ?? []);
        }
    }

    useEffect(() => {
        init();
        requestAnimationFrame(() => {
            scrollToBottom(false);
        });

        // 清理（cmdConfirm 的 WS 清理在 useCmdConfirm 中自动处理）
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
        // 如果有图片附件，构建多模态 content 数组
        const imageAttachments = (message.attachments ?? []).filter(a => a.kind === "image");
        if (imageAttachments.length > 0) {
            // 构建 OpenAI 多模态格式的 content 数组
            const content: ai_agent_content_part[] = [];
            if (message.text) {
                content.push({ type: "text", text: message.text });
            }
            for (const img of imageAttachments) {
                // img.content 是 base64 DataURL
                content.push({
                    type: "image_url",
                    image_url: { url: img.content }
                });
            }
            return [{
                content,
                role: 'user',
                attachments: message.attachments ?? []
            }];
        }
        return [{
            content: message.text,
            role: message.sender === 'bot' ? 'assistant' : 'user',
            attachments: message.attachments ?? []
        }];
    };

    /** 保存当前会话的所有消息到后端 */
    // const saveMessagesToSession = async (sessionId: string, msgs: Message[]) => {
    //     if (!sessionId) return;
    //     try {
    //         await ai_agentHttp.post("session/messages", {
    //             session_id: sessionId,
    //             messages: toAiMessages(msgs)
    //         });
    //     } catch (e) {
    //         console.error("保存会话消息失败", e);
    //     }
    // };

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

        set_sending(true);

        // 非 completions 类型：使用专用请求处理器
        if (requestType !== 'completions') {
            const bot_message: Message = {
                id: user_message.id + 1,
                sender: 'bot',
                text: "处理中..."
            };
            new_messages.push(bot_message);
            setMessages([...new_messages]);

            const handled = await handleNonCompletionsRequest(
                requestType,
                text,
                sessionId,
                async (resultText, extra) => {
                    bot_message.text = resultText;
                    // 如果后端返回了结构化多模态数据，赋值给消息对象
                    if (extra?.images) bot_message.images = extra.images;
                    if (extra?.audio) bot_message.audio = extra.audio;
                    if (extra?.embeddings) bot_message.embeddings = extra.embeddings;
                    setMessages([...new_messages]);
                    set_sending(false);

                    refreshSessions();
                    scrollToBottom(true);
                }
            );

            if (!handled) {
                // 如果没被处理（如新增类型），回退到默认提示
                bot_message.text = `请求类型 "${requestType}" 的专用处理器尚未实现，请使用 completions 类型。`;
                
                setMessages([...new_messages]);
                set_sending(false);
           }
            return;
        }

        // completions 类型：走原有的 SSE 流式请求
        const call_pojo: Message =  {
            id:user_message.id +1,
            sender:'bot',
            text:"AI思考中..."
        }
        new_messages.push(call_pojo);
        setMessages([...new_messages]);
        let thinking_start = true
        ai_agentHttp.sse_post("chat", {
            messages: get_message(user_message),
            session_id: sessionId,
        },{
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
        // 1. 检查输入法合成状态 (isComposing 是标准属性)
        // 2. 检查是否按下了 Shift (Shift + Enter 通常用于换行)
        // 3. 检查是否按下了 Ctrl (Ctrl + Enter 通常也用于换行或特殊操作)
        if (e.key === 'Process' || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey) {
            return;
        }

        // 如果只有 Enter 被按下，触发发送
        if (e.key === 'Enter') {
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
        confirm_dell_all({
            sub_title: t("确认删除这条消息吗?"),
            confirm_fun: () => {
                const newMessages = messages.filter(m => m.id !== id);
                setMessages(newMessages);
                if (activeSessionId) {
                    ai_agentHttp.post("session/messages", {
                        session_id: activeSessionId,
                        messages: toAiMessages(newMessages)
                    }).catch(console.error);
                }
            }
        });
    };

    const handleCopy = async (text: string) => {
        copyToClipboard(text);
        NotySuccess('复制成功')
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
               <ActionButton icon={"add"} title={t("新会话")} onClick={() => createSession()}/>
               {sysPromptList.length > 0 && (
                   <MenuSelect
                       list={sysPromptList.map((item, idx) => ({
                           name: item.note || `${t("提示词")} ${idx + 1}`,
                           click: () => {
                               if (item.prompt) {
                                   createSession(item.prompt);
                               }
                           }
                       }))}
                   >
                       <ActionButton icon={"add_comment"} title={t("提示词模板创建会话")} />
                   </MenuSelect>
               )}
               {/* 请求类型选择器 */}
               <RequestTypeSelector />
               {/* 当前模型下拉选择器：仅在有模型配置时显示 */}
               {(env_config.current?.options_agent_model_list?.length ?? 0) > 0 && (
                   <Select
                       value={currentModelName}
                       options={env_config.current.options_agent_model_list?.map(m => ({title: m.label, value: m.value})) ?? []}
                       onChange={(value) => {
                           // 调用后端接口，真正切换模型（修改 ai_config 中的 open 状态）
                           setCurrentModelName(value);
                           ai_agentHttp.post("set_active_model", { model_name: value }).then(() => {
                               // 切换成功后重新获取 env_config，更新 current_model_note
                               NotySuccess('success')
                               settingHttp.get("ai_agent_setting/env").then(res => {
                                   if (res.code === RCode.Success) {
                                       env_config.current = res.data;
                                   }
                               });
                           }).catch(console.error);
                       }}
                       no_border={true}
                       maxWidth={"10rem"}
                   />
               )}
               {/* 批量选择模式切换 */}
               <ActionButton
                   icon={batchMode ? "check_circle" : "checklist"}
                   title={batchMode ? t("取消批量选择") : t("批量选择")}
                   onClick={toggleBatchMode}
               />
               {batchMode && selectedMsgIds.size > 0 && (
                   <ActionButton icon={"delete"} title={t("删除选中消息")} onClick={batchDeleteMessages} />
               )}
               {batchMode && selectedSessionIds.size > 0 && (
                   <ActionButton icon={"delete"} title={t("删除选中会话")} onClick={batchDeleteSessions} />
               )}
               <ActionButton icon={"delete_sweep"} title={t("清空全部会话")} onClick={()=>{
                   confirm_dell_all({
                       sub_title:t("确认删除全部聊天会话吗?"),
                       confirm_fun:async ()=>{
                           await ai_agentHttp.post("sessions/clear", {})
                           setActiveSessionId("");
                           setMessages([]);
                           await loadSessions(null);
                       }
                   })
               }}/>
               {check_user_auth(UserAuth.ai_agent_setting) &&
                   <ActionButton icon={"smart_toy"} title={"机器人配置"} onClick={()=>{
                       navigate(`/${routerConfig.ai_rebot_setting_page}`);
                   }}/>
               }
               {check_user_auth(UserAuth.ai_agent_setting) &&
                   <ActionButton icon={"settings"} title={"ai setting"} onClick={()=>{
                       navigate(`/${routerConfig.ai_agent_setting_page}`);
                   }}/>
               }

           </Header>
           <div className="chat-page chat-page-with-sessions">
               {ai_session_collapsed && <div className="chat-session-overlay" onClick={() => set_ai_session_collapsed(false)}></div>}
               <SessionList
                   sessions={sessions}
                   activeSessionId={activeSessionId}
                   onSelectSession={(id) => loadSession(id, false)}
                   onRenameSession={renameSession}
                   onDeleteSession={deleteSession}
                   onShowUsageStats={showUsageStatsPopup}
                   batchMode={batchMode}
                   selectedSessionIds={selectedSessionIds}
                   onToggleSessionSelect={toggleSessionSelect}
               />
               <section className="chat-main">
                   {
                       messages?.length === 0 &&
                       <div className="chat-header">
                           <div>{requestType === 'completions'
                               ? t('询问服务器的一切')
                               : REQUEST_TYPE_OPTIONS.find(o => o.value === requestType)?.label ?? requestType}</div>
                       </div>
                   }
                   <div className="chat-messages" ref={chatContainerRef}>
                       {messages.map(msg => (
                           <div
                               key={msg.id}
                               className={`chat-message ${msg.sender} ${batchMode ? 'batch-mode' : ''}`}
                           >
                               {batchMode && (
                                   <input
                                       type="checkbox"
                                       className="chat-message-checkbox"
                                       checked={selectedMsgIds.has(msg.id)}
                                       onChange={() => toggleMsgSelect(msg.id)}
                                   />
                               )}
                               {/* 消息自判断渲染：消息对象携带 images/audio/embeddings 等属性时自动选择对应渲染器 */}
                               {renderMessageByType(msg)}
                               {!batchMode && (
                                   <div className="message-actions">
                                       <button onClick={() => handleDelete(msg.id)}>{t("删除")}</button>
                                       <button onClick={() => handleCopy(msg.text)}>{t("复制")}</button>
                                   </div>
                               )}
                           </div>
                       ))}
                       <div ref={messagesEndRef} />
                   </div>

                   <ChatInput
                       inputValue={inputValue}
                       onInputChange={handleChange}
                       onKeyDown={handleKeyDown}
                       onPaste={handlePaste}
                       onSend={handleSend}
                       sending={sending}
                       pendingAttachments={pendingAttachments}
                       onRemoveAttachment={removePendingAttachment}
                       onOpenFilePicker={openFilePicker}
                       onAddFiles={addAttachments}
                       onDrop={handleDrop}
                       onDragOver={handleDragOver}
                       fileInputRef={fileInputRef}
                   />
               </section>
           </div>
       </React.Fragment>
    );
}
