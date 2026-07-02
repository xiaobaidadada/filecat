import React from 'react';
import {ai_agentHttp} from "../../../util/config";
import {Icon} from "../../../../meta/component/Button";
import Md from "../../file/component/markdown/Md";
import {copyToClipboard} from "../../../util/FunUtil";
import {ai_agent_tool_call_item, getContentAsString} from "../../../../../common/req/filecat.ai.pojo";

/**
 * 根据消息自身携带的多模态属性渲染不同的消息展示
 * 消息对象中如果带有 images/audio/embeddings 等属性，自动选择对应渲染器
 * 不再依赖全局 requestType 状态
 */
export function renderMessageByType(
    msg: { id: number; sender: 'user' | 'bot'; text: string; attachments?: any[]; images?: any[]; audio?: any; embeddings?: any; content_list?: { tool_call_ends?: any[] }[] },
): React.ReactNode {
    // 先渲染附件信息
    const attachmentsEl = msg.attachments && msg.attachments.length > 0 ? (
        <div className="chat-message-attachments">
            {msg.attachments.map((attachment: any, index: number) => (
                <div key={`${attachment.name}_${index}`} className="chat-message-attachment">
                    <Icon icon={'attach_file'}/>
                    <span>{attachment.name}</span>
                    <small>{attachment.size} B</small>
                </div>
            ))}
        </div>
    ) : null;

    // ===== 消息自判断：根据消息自带的属性选择渲染器 =====
    // 现在支持同时渲染多个多模态属性（如果同时存在）

    const renderers: React.ReactNode[] = [];

    // 1. 有 images 属性 → 图片生成结果渲染
    if (msg.images && msg.sender === 'bot') {
        renderers.push(<React.Fragment key="images"><ImageResultRenderer  images={msg.images} text={msg.text}/></React.Fragment>);
    }

    // 2. 有 audio 属性 → 音频结果渲染
    if (msg.audio && msg.sender === 'bot') {
        renderers.push(<React.Fragment key="audio"><AudioResultRenderer  audio={msg.audio} text={msg.text}/></React.Fragment>);
    }

    // 3. 有 embeddings 属性 → 向量结果渲染
    if (msg.embeddings && msg.sender === 'bot') {
        renderers.push(<React.Fragment key="embeddings"><EmbeddingsResultRenderer  embeddings={msg.embeddings} text={msg.text}/></React.Fragment>);
    }

    const contentEl = renderOrderedContent(msg);

    // 5. 如果没有任何多模态属性，使用标准 Markdown 渲染（同时附带附件和工具调用）
    if (renderers.length === 0) {
        return <>{attachmentsEl}{contentEl}</>;
    }

    // 6. 多个多模态属性同时渲染，并在最后附加附件和内容序列
    return (
        <>
            {renderers}
            {attachmentsEl}
            {contentEl}
        </>
    );
}

export function renderOrderedContent(
    msg: { sender: 'user' | 'bot'; text: string; content_list?: { content?: any; tool_call_ends?: ai_agent_tool_call_item[] }[] }
): React.ReactNode {
    if (msg.sender !== 'bot' || !msg.content_list?.length) {
        return msg.text ? <Md context={msg.text}/> : null;
    }

    return (
        <>
            {msg.content_list.map((part, index) => {
                const nodes: React.ReactNode[] = [];
                const partText = getContentAsString(part.content);

                if (partText) {
                    nodes.push(<React.Fragment key={`content-${index}`}><Md  context={partText}/></React.Fragment>);
                }
                if (part.tool_call_ends?.length) {
                    nodes.push(<React.Fragment key={`tool-${index}`} ><CallListRenderer callList={part.tool_call_ends}/></React.Fragment>);
                }
                return <React.Fragment key={`part-${index}`}>{nodes}</React.Fragment>;
            })}
            {!msg.content_list.some(part => part.content) && msg.text ? <Md context={msg.text}/> : null}
        </>
    );
}


/**
 * 工具调用列表渲染组件（折叠面板形式）
 */
function CallListRenderer({callList}: { callList: ai_agent_tool_call_item[] }) {
    const [expanded, setExpanded] = React.useState(false);
    if (!callList?.length) return null;
    const successCount = callList.filter(c => c.success).length;
    const failCount = callList.filter(c => !c.success).length;
    return (
        <div className="chat-message-call-list">
            <div className="call-list-header" onClick={() => setExpanded(!expanded)}>
                <Icon icon={expanded ? 'expand_less' : 'expand_more'}/>
                <span className="call-list-summary">
                    工具调用 ({callList.length})
                    {failCount > 0 && <span className="call-list-fail"> 失败 </span>}
                </span>
            </div>
            {expanded && (
                <div className="call-list-body">
                    {callList.map((item, idx) => (
                        <div key={idx} className={`call-list-item ${item.success ? 'call-success' : 'call-fail'}`}>
                            <div className="call-list-item-header">
                                <Icon icon={item.success ? 'check_circle' : 'error'}/>
                                <span className="call-list-tool-name">{item.tool_display_name || item.tool_name}</span>
                                <span className="call-list-duration">{item.duration_ms}ms</span>
                            </div>
                            {item.tool_args && (
                                <details className="call-list-details">
                                    <summary>参数</summary>
                                    <pre className="call-list-pre">{JSON.stringify(item.tool_args, null, 2)}</pre>
                                </details>
                            )}
                            {!item.success && item.error && (
                                <details className="call-list-details">
                                    <summary>错误</summary>
                                    <pre className="call-list-pre call-list-error-text">{item.error}</pre>
                                </details>
                            )}
                            {item.success && item.tool_result && (
                                <details className="call-list-details">
                                    <summary>结果</summary>
                                    <pre className="call-list-pre">{item.tool_result.length > 500 ? item.tool_result.slice(0, 500) + '...' : item.tool_result}</pre>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * 图片生成结果渲染
 * 支持 props 直接传入 images 数据，也兼容旧版从 text JSON 解析
 */
function ImageResultRenderer({images: propImages, text}: { images?: any[]; text?: string }) {
    let images: any[] = propImages || [];

    // 如果 props 没有 images，尝试从 text JSON 解析（兼容旧数据）
    if (!images.length && text) {
        try {
            const parsed = JSON.parse(text);
            images = parsed.data || [];
        } catch {
            // not JSON
        }
    }

    if (!images.length) {
        return <Md context={text || ''}/>;
    }

    return (
        <div className="image-generation-result">
            {images.map((img: any, idx: number) => (
                <div key={idx} className="image-generation-item">
                    {img.url && (
                        <div className="image-generation-image-wrapper">
                            <img
                                src={img.url}
                                alt={img.revised_prompt || `生成的图片 ${idx + 1}`}
                                loading="lazy"
                            />
                        </div>
                    )}
                    {img.b64_json && (
                        <div className="image-generation-image-wrapper">
                            <img
                                src={`data:image/png;base64,${img.b64_json}`}
                                alt={`生成的图片 ${idx + 1}`}
                            />
                        </div>
                    )}
                    {img.revised_prompt && (
                        <p className="image-generation-prompt">
                            <small>{img.revised_prompt}</small>
                        </p>
                    )}
                </div>
            ))}
            {/* 有文本描述时也展示 */}
            {text && !propImages && <Md context={text}/>}
        </div>
    );
}

/**
 * 音频结果渲染
 * 支持 props 直接传入 audio 数据，也兼容旧版从 text 解析 URL
 */
function AudioResultRenderer({audio: propAudio, text}: { audio?: { data?: string; url?: string; mime_type?: string }; text?: string }) {
    // 优先使用 props 传入的结构化 audio 数据
    if (propAudio) {
        if (propAudio.url) {
            return (
                <div className="audio-result">
                    <audio controls src={propAudio.url}>
                        您的浏览器不支持音频播放
                    </audio>
                </div>
            );
        }
        if (propAudio.data) {
            const mimeType = propAudio.mime_type || "audio/mpeg";
            return (
                <div className="audio-result">
                    <audio controls src={`data:${mimeType};base64,${propAudio.data}`}>
                        您的浏览器不支持音频播放
                    </audio>
                </div>
            );
        }
    }

    // 兼容旧版：检查 text 是否为音频 URL
    const textStr = text || '';
    const isUrl = textStr.startsWith("http://") || textStr.startsWith("https://");
    if (isUrl) {
        return (
            <div className="audio-result">
                <audio controls src={textStr}>
                    您的浏览器不支持音频播放
                </audio>
            </div>
        );
    }

    // 兼容旧版：尝试从 text JSON 解析 base64
    try {
        const parsed = JSON.parse(textStr);
        if (parsed?.data || parsed?.audio_data) {
            const audioData = parsed.data || parsed.audio_data;
            return (
                <div className="audio-result">
                    <audio controls src={`data:audio/mpeg;base64,${audioData}`}>
                        您的浏览器不支持音频播放
                    </audio>
                </div>
            );
        }
    } catch {
        // not JSON
    }

    return <Md context={textStr}/>;
}


/**
 * 复制按钮组件
 */
function CopyButton({content, label}: { content: string; label?: string }) {
    const [copied, setCopied] = React.useState(false);
    return (
        <button
            className="embeddings-copy-btn"
            onClick={() => {
                copyToClipboard(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
        >
            <Icon icon={copied ? 'check' : 'content_copy'}/>
            {copied ? '已复制' : (label || '复制')}
        </button>
    );
}

/**
 * Embeddings 结果渲染
 * 支持 props 直接传入 embeddings 数据，也兼容旧版从 text JSON 解析
 */
function EmbeddingsResultRenderer({embeddings: propEmbeddings, text}: { embeddings?: any; text?: string }) {
    let data: any = propEmbeddings || null;
    if (!data && text) {
        try {
            data = JSON.parse(text);
        } catch {
            return <Md context={text}/>;
        }
    }
    if (!data) {
        return <Md context={text || ''}/>;
    }

    const embeddings = data?.data || [];
    const usage = data?.usage;
    const fullJson = JSON.stringify(data, null, 2);

    return (
        <div className="embeddings-result">
            <div className="embeddings-summary">
                <strong>向量嵌入结果</strong>
                <span>维度: {embeddings[0]?.embedding?.length ?? 'N/A'}</span>
                <span>数量: {embeddings.length}</span>
                {usage && (
                    <span>使用 tokens: {usage.total_tokens ?? 'N/A'}</span>
                )}
            </div>

            {/* 复制工具栏 */}
            <div className="embeddings-toolbar">
                <CopyButton content={fullJson} label="复制全部结果"/>
                {embeddings.length > 0 && embeddings[0]?.embedding && (
                    <CopyButton
                        content={JSON.stringify(embeddings[0].embedding, null, 2)}
                        label="复制第一条向量"
                    />
                )}
                {embeddings.length > 0 && (
                    <CopyButton
                        content={JSON.stringify(embeddings.map((e: any) => e.embedding), null, 2)}
                        label="复制所有向量数据"
                    />
                )}
            </div>

            {/* 向量预览 */}
            {embeddings.length > 0 && embeddings[0]?.embedding && (
                <div className="embeddings-preview">
                    <span>向量预览: [{embeddings[0].embedding.slice(0, 5).join(', ')}{embeddings[0].embedding.length > 5 ? ', ...' : ''}]</span>
                </div>
            )}

            {/* 详细数据 */}
            {embeddings.length > 0 && (
                <details>
                    <summary>查看详细数据</summary>
                    <pre className="embeddings-raw">
                        {fullJson}
                    </pre>
                </details>
            )}
        </div>
    );
}

// ============================================================
//  不同类型的请求发送逻辑
// ============================================================

/**
 * 从 localStorage 读取图片生成的自定义参数
 */
function getImagesExtraParams(): Record<string, any> {
    try {
        const saved = localStorage.getItem("ai_images_extra_params");
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {}
    return {};
}

/**
 * 发送图片生成请求（后端自动保存到会话）
 * 返回 { session_id, images, text } 结构化数据
 */
export async function sendImagesRequest(
    prompt: string,
    sessionId: string,
): Promise<{ session_id: string; images: any[]; text: string } | null> {
    const extraParams = getImagesExtraParams();
    const body: Record<string, any> = {
        prompt,
        n: extraParams.n ?? 1,
        size: extraParams.size ?? "1024x1024",
        session_id: sessionId,
    };
    if (extraParams.quality) body.quality = extraParams.quality;
    if (extraParams.style) body.style = extraParams.style;
    if (extraParams.extra_json) {
        try {
            const parsed = JSON.parse(extraParams.extra_json);
            Object.assign(body, parsed);
        } catch (e) {
            console.warn("图片额外参数 JSON 解析失败:", e);
        }
    }

    const result = await ai_agentHttp.post("images/generations", body);
    if (result.code !== 0) {
        throw new Error(result.message || "图片生成失败");
    }
    const data = result.data || {};
    const images = (data.data || []).map((img: any) => ({
        url: img.url,
        b64_json: img.b64_json,
        revised_prompt: img.revised_prompt,
    }));
    const imageTexts = images
        .map((img: any, i: number) => `![生成图片${i + 1}](${img.url || `data:image/png;base64,${img.b64_json}`})${img.revised_prompt ? `\n> ${img.revised_prompt}` : ''}`)
        .join('\n\n');
    return {
        session_id: data.session_id || sessionId,
        images,
        text: imageTexts || `生成了 ${images.length} 张图片`,
    };
}

/**
 * 发送文本转语音请求（后端自动保存到会话）
 */
export async function sendAudioSpeechRequest(
    text: string,
    sessionId: string,
): Promise<{ session_id: string; audio: any; text: string }> {
    // 目前 audio/speech 返回的是二进制，后端已自动保存会话
    // 这里发送请求拿到二进制后前端直接播放
    const body: Record<string, any> = {
        input: text,
        session_id: sessionId,
    };
    // 从 localStorage 读取语音参数
    try {
        const saved = localStorage.getItem("ai_audio_extra_params");
        if (saved) {
            const p = JSON.parse(saved);
            if (p.voice) body.voice = p.voice;
            if (p.speed) body.speed = parseFloat(p.speed);
        }
    } catch {}

    // 由于 audio/speech 返回二进制，需要用 fetch 获取
    const token = localStorage.getItem("token") || "";
    const resp = await fetch(`/api/ai_agent/audio/speech`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": token,
        },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        throw new Error(`语音合成失败: ${resp.statusText}`);
    }

    const sessionIdFromHeader = resp.headers.get("X-Session-Id") || sessionId;
    const arrayBuffer = await resp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(arrayBuffer))));

    return {
        session_id: sessionIdFromHeader,
        audio: { data: base64, mime_type: resp.headers.get("content-type") || "audio/mpeg" },
        text: `[音频文件: ${text.slice(0, 50)}...]`,
    };
}

/**
 * 发送 Embeddings 请求（后端自动保存到会话）
 */
export async function sendEmbeddingsRequest(
    text: string,
    sessionId: string,
): Promise<{ session_id: string; embeddings: any; text: string }> {
    const result = await ai_agentHttp.post("embeddings", {
        input: text,
        session_id: sessionId,
    });
    if (result.code !== 0) {
        throw new Error(result.message || "Embeddings 请求失败");
    }
    const data = result.data || {};
    const embeddingsData = data?.data ?? [];
    const firstDim = embeddingsData[0]?.embedding?.length ?? 0;
    const summary = `向量维度: ${firstDim}, 数量: ${embeddingsData.length}`;
    return {
        session_id: data.session_id || sessionId,
        embeddings: data,
        text: `✅ Embeddings 结果 - ${summary}\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 2000)}\n\`\`\``,
    };
}

/**
 * 根据请求类型发送对应的非流式请求
 * 返回 true 表示已由专用处理器处理，false 表示需要走 completions 的 SSE 流
 * 现在每个请求后端都会自动保存会话，返回值包含结构化多模态数据
 */
export async function handleNonCompletionsRequest(
    requestType: string,
    text: string,
    sessionId: string,
    onResult: (text: string, extra?: { images?: any[]; audio?: any; embeddings?: any }) => void,
): Promise<boolean> {
    try {
        switch (requestType) {
            case 'images': {
                const result = await sendImagesRequest(text, sessionId);
                if (result) {
                    onResult(result.text, { images: result.images });
                }
                return true;
            }
            case 'audio_speech': {
                const result = await sendAudioSpeechRequest(text, sessionId);
                if (result) {
                    onResult(result.text, { audio: result.audio });
                }
                return true;
            }
            case 'embeddings': {
                const result = await sendEmbeddingsRequest(text, sessionId);
                if (result) {
                    onResult(result.text, { embeddings: result.embeddings });
                }
                return true;
            }
            default:
                return false; // completions 走原有 SSE 流
        }
    } catch (err: any) {
        onResult(`请求失败: ${err?.message || JSON.stringify(err)}`);
        return true;
    }
}
