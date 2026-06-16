import React from 'react';
import {ai_agentHttp} from "../../../util/config";
import {Icon} from "../../../../meta/component/Button";
import Md from "../../file/component/markdown/Md";

/**
 * 根据请求类型渲染不同的消息展示
 */
export function renderMessageByType(
    msg: { id: number; sender: 'user' | 'bot'; text: string; attachments?: any[] },
    requestType: string,
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

    // completions 类型使用标准 Markdown 渲染
    if (requestType === 'completions') {
        return <>{attachmentsEl}<Md context={msg.text}/></>;
    }

    // images 类型：如果是 bot 回复，尝试解析图片 JSON
    if (requestType === 'images' && msg.sender === 'bot') {
        return <>{attachmentsEl}<ImageResultRenderer text={msg.text}/></>;
    }

    // audio_speech 类型：如果是 bot 回复且包含音频 URL
    if (requestType === 'audio_speech' && msg.sender === 'bot') {
        return <>{attachmentsEl}<AudioResultRenderer text={msg.text}/></>;
    }

    // embeddings 类型：展示向量数据概要
    if (requestType === 'embeddings' && msg.sender === 'bot') {
        return <>{attachmentsEl}<EmbeddingsResultRenderer text={msg.text}/></>;
    }

    // 默认 fallback
    return <>{attachmentsEl}<Md context={msg.text}/></>;
}

/**
 * 图片生成结果渲染
 */
function ImageResultRenderer({text}: { text: string }) {
    let imageData: any = null;
    let parseError = false;
    try {
        imageData = JSON.parse(text);
    } catch {
        parseError = true;
    }

    if (parseError || !imageData) {
        return <Md context={text}/>;
    }

    // OpenAI 图片生成返回格式: { data: [{ url, b64_json, revised_prompt }] }
    const images = imageData.data || [];
    if (!images.length) {
        return <Md context={text}/>;
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
                                style={{maxWidth: "100%", borderRadius: "8px"}}
                                loading="lazy"
                            />
                        </div>
                    )}
                    {img.b64_json && (
                        <div className="image-generation-image-wrapper">
                            <img
                                src={`data:image/png;base64,${img.b64_json}`}
                                alt={`生成的图片 ${idx + 1}`}
                                style={{maxWidth: "100%", borderRadius: "8px"}}
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
        </div>
    );
}

/**
 * 音频结果渲染
 */
function AudioResultRenderer({text}: { text: string }) {
    // 检查是否为音频 URL
    const isUrl = text.startsWith("http://") || text.startsWith("https://");
    if (isUrl) {
        return (
            <div className="audio-result">
                <audio controls style={{width: "100%"}} src={text}>
                    您的浏览器不支持音频播放
                </audio>
            </div>
        );
    }

    // 尝试解析为 base64 音频数据
    try {
        const parsed = JSON.parse(text);
        if (parsed?.data || parsed?.audio_data) {
            const audioData = parsed.data || parsed.audio_data;
            return (
                <div className="audio-result">
                    <audio controls style={{width: "100%"}}
                           src={`data:audio/mpeg;base64,${audioData}`}>
                        您的浏览器不支持音频播放
                    </audio>
                </div>
            );
        }
    } catch {
        // not JSON
    }

    return <Md context={text}/>;
}

/**
 * Embeddings 结果渲染
 */
function EmbeddingsResultRenderer({text}: { text: string }) {
    let data: any = null;
    try {
        data = JSON.parse(text);
    } catch {
        return <Md context={text}/>;
    }

    const embeddings = data?.data || [];
    const usage = data?.usage;

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
            {embeddings.length > 0 && (
                <details>
                    <summary>查看详细数据</summary>
                    <pre className="embeddings-raw" style={{
                        maxHeight: "300px",
                        overflow: "auto",
                        fontSize: "12px",
                        background: "var(--surfaceSecondary)",
                        padding: "8px",
                        borderRadius: "4px"
                    }}>
                        {JSON.stringify(embeddings, null, 2)}
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
 * 发送图片生成请求
 */
export async function sendImagesRequest(
    prompt: string,
    sessionId: string,
    onResult: (text: string) => void,
    onError: (err: any) => void,
) {
    try {
        // 从 localStorage 读取用户自定义的额外参数（如 size, n, quality, style 等）
        const extraParams = getImagesExtraParams();
        const body: Record<string, any> = {
            prompt,
            n: extraParams.n ?? 1,
            size: extraParams.size ?? "1024x1024",
        };
        if (extraParams.quality) body.quality = extraParams.quality;
        if (extraParams.style) body.style = extraParams.style;
        // 如果用户填了额外 JSON，尝试解析合并到 body
        if (extraParams.extra_json) {
            try {
                const parsed = JSON.parse(extraParams.extra_json);
                Object.assign(body, parsed);
            } catch (e) {
                console.warn("图片额外参数 JSON 解析失败:", e);
            }
        }

        const result = await ai_agentHttp.post("images/generations", body);
        if (result.data) {
            onResult(JSON.stringify(result.data, null, 2));
        } else {
            onError(result.message || "图片生成失败");
        }
    } catch (err) {
        onError(err);
    }
}

/**
 * 发送文本转语音请求
 */
export async function sendAudioSpeechRequest(
    text: string,
    sessionId: string,
    onResult: (text: string) => void,
    onError: (err: any) => void,
) {
    try {
        const result = await ai_agentHttp.post("audio/speech", {
            input: text,
        });
        // 如果返回的是二进制，会直接下载；这里如果有 URL 则展示
        onResult(JSON.stringify(result, null, 2));
    } catch (err) {
        onError(err);
    }
}

/**
 * 发送 Embeddings 请求
 */
export async function sendEmbeddingsRequest(
    text: string,
    sessionId: string,
    onResult: (text: string) => void,
    onError: (err: any) => void,
) {
    try {
        const result = await ai_agentHttp.post("embeddings", {
            input: text,
        });
        if (result.data) {
            onResult(JSON.stringify(result.data, null, 2));
        } else {
            onResult(JSON.stringify(result, null, 2));
        }
    } catch (err) {
        onError(err);
    }
}

/**
 * 根据请求类型发送对应的非流式请求
 * 返回 true 表示已由专用处理器处理，false 表示需要走 completions 的 SSE 流
 */
export async function handleNonCompletionsRequest(
    requestType: string,
    text: string,
    sessionId: string,
    onResult: (text: string) => void,
): Promise<boolean> {
    switch (requestType) {
        case 'images': {
            await sendImagesRequest(text, sessionId, onResult, (err) => {
                onResult(`图片生成失败: ${err?.message || JSON.stringify(err)}`);
            });
            return true;
        }
        case 'audio_speech': {
            await sendAudioSpeechRequest(text, sessionId, onResult, (err) => {
                onResult(`语音合成失败: ${err?.message || JSON.stringify(err)}`);
            });
            return true;
        }
        case 'embeddings': {
            await sendEmbeddingsRequest(text, sessionId, onResult, (err) => {
                onResult(`Embeddings 请求失败: ${err?.message || JSON.stringify(err)}`);
            });
            return true;
        }
        default:
            return false; // completions 走原有 SSE 流
    }
}
