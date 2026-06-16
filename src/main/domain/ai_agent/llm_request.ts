import axios, {AxiosResponse} from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import {ai_config, ai_config_env} from "./ai_agent.service";
import {LLMRequestType} from "../../../common/req/filecat.ai.pojo";

/**
 * 处理 token，如果已经带有 Bearer 前缀则不再添加
 */
function getAuthHeader(token: string): string {
    const trimmedToken = token.trim();
    if (trimmedToken.toLowerCase().startsWith('bearer ')) {
        return trimmedToken;
    }
    return `Bearer ${trimmedToken}`;
}

/**
 * 获取代理配置
 */
function getProxyConfig(): Record<string, any> {
    if (ai_config_env?.proxy_url) {
        const agent = new HttpsProxyAgent(ai_config_env.proxy_url);
        return {
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false as const, // 防止 axios 走系统代理导致冲突
        };
    }
    return {};
}

/**
 * 将 axios 响应包装成 fetch 风格的 Response 对象
 */
function toFetchResponse(axiosRes: AxiosResponse): Response {
    const body = typeof axiosRes.data === 'string'
        ? axiosRes.data
        : JSON.stringify(axiosRes.data);

    return new Response(body, {
        status: axiosRes.status,
        statusText: axiosRes.statusText,
        headers: new Headers(axiosRes.headers as Record<string, string>)
    });
}

// ============================================================
//  请求类型映射：根据 request_type 获取对应的 API 路径后缀
// ============================================================
const REQUEST_TYPE_PATH_MAP: Record<LLMRequestType, string> = {
    completions:              '/chat/completions',
    images:                   '/images/generations',
    audio_speech:             '/audio/speech',
    audio_transcription:      '/audio/transcriptions',
    audio_translation:        '/audio/translations',
    embeddings:               '/embeddings',
};

/**
 * 根据 request_type 和用户填写的 url，计算出最终的请求 url。
 *
 * 规则：
 * 1. 如果 request_type 是 'completions'（默认），直接使用 ai_config.url（兼容旧配置）
 * 2. 否则，尝试从 ai_config.url 中提取 base URL（去掉末尾的 /chat/completions 等），
 *    再拼接上 request_type 对应的路径。
 *    如果提取失败（即 url 不包含已知路径），则直接在 url 后加路径。
 */
function resolveRequestUrl(requestType?: LLMRequestType): string {
    const rawUrl = ai_config.url;
    if (!requestType || requestType === 'completions') {
        // completions 直接使用原 url
        return rawUrl;
    }

    const suffix = REQUEST_TYPE_PATH_MAP[requestType] || '/chat/completions';

    // 尝试从 url 中剥离已知的路径后缀
    const knownPaths = Object.values(REQUEST_TYPE_PATH_MAP);
    let baseUrl = rawUrl;
    for (const knownPath of knownPaths) {
        if (rawUrl.endsWith(knownPath)) {
            baseUrl = rawUrl.slice(0, -knownPath.length);
            break;
        }
    }

    // 去掉末尾的 /
    if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }

    return `${baseUrl}${suffix}`;
}

// ============================================================
//  Body 构建器：根据 request_type 构建不同的请求体
// ============================================================


/**
 * images/generations 请求体
 */
function buildImagesBody(params: {
    prompt: string;
    model: string;
    n?: number;
    size?: string;
    quality?: string;
    style?: string;
    response_format?: string;
    extraParams?: Record<string, any>;
}): any {
    const body: any = {
        model: params.model,
        prompt: params.prompt,
    };
    if (params.n != null) body.n = params.n;
    if (params.size) body.size = params.size;
    if (params.quality) body.quality = params.quality;
    if (params.style) body.style = params.style;
    if (params.response_format) body.response_format = params.response_format;
    if (params.extraParams) Object.assign(body, params.extraParams);
    return body;
}

/**
 * audio/speech 请求体
 */
function buildAudioSpeechBody(params: {
    input: string;
    model: string;
    voice?: string;
    speed?: number;
    response_format?: string;
    extraParams?: Record<string, any>;
}): any {
    const body: any = {
        model: params.model,
        input: params.input,
    };
    if (params.voice) body.voice = params.voice;
    if (params.speed != null) body.speed = params.speed;
    if (params.response_format) body.response_format = params.response_format;
    if (params.extraParams) Object.assign(body, params.extraParams);
    return body;
}


/**
 * embeddings 请求体
 */
function buildEmbeddingsBody(params: {
    input: string | string[];
    model: string;
    encoding_format?: string;
    dimensions?: number;
    user?: string;
    extraParams?: Record<string, any>;
}): any {
    const body: any = {
        model: params.model,
        input: params.input,
    };
    if (params.encoding_format) body.encoding_format = params.encoding_format;
    if (params.dimensions != null) body.dimensions = params.dimensions;
    if (params.user) body.user = params.user;
    if (params.extraParams) Object.assign(body, params.extraParams);
    return body;
}

// ============================================================
//  请求头构建
// ============================================================

function buildHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Authorization": getAuthHeader(ai_config.token)
    };
    if (contentType) {
        headers["Content-Type"] = contentType;
    }
    return headers;
}

// ============================================================
//  统一发送函数（内部）
// ============================================================

async function sendPost(
    url: string,
    headers: Record<string, string>,
    body: any,
    signal?: AbortSignal,
    streamMode: boolean = false
): Promise<Response> {
    if (ai_config_env?.proxy_url) {
        const proxyConfig = getProxyConfig();
        const res = await axios({
            url,
            method: "POST",
            headers,
            data: typeof body === 'string' ? body : JSON.stringify(body),
            responseType: streamMode ? 'stream' : 'text',
            signal,
            ...proxyConfig
        });

        if (streamMode) {
            const nodeStream = res.data;
            const webStream = new ReadableStream({
                start(controller) {
                    nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                    nodeStream.on('end', () => controller.close());
                    nodeStream.on('error', (err: Error) => controller.error(err));
                }
            });
            return new Response(webStream, {
                status: res.status,
                statusText: res.statusText,
                headers: new Headers(res.headers as Record<string, string>)
            });
        }

        return toFetchResponse(res);
    }

    return fetch(url, {
        method: "POST",
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal
    });
}

// ============================================================
//  公开 API
// ============================================================

/**
 * 发送非流式请求到大模型（用于记忆压缩等场景）
 * 返回 fetch 风格的 Response
 * 根据 ai_config.request_type 自动构建不同的请求体和 URL
 */
export async function llmPost(
    body: any,
    signal?: AbortSignal
): Promise<Response> {
    const url = resolveRequestUrl(ai_config.request_type);
    const headers = buildHeaders("application/json");
    return sendPost(url, headers, body, signal, false);
}

/**
 * 发送流式大模型请求（支持代理）
 * 返回 fetch 风格的 Response，兼容现有 SSE 处理逻辑
 * 根据 ai_config.request_type 自动构建不同的请求体和 URL
 */
export async function llmPostStream(
    body: any,
    signal?: AbortSignal
): Promise<Response> {
    const url = resolveRequestUrl(ai_config.request_type);
    const headers = buildHeaders("application/json");
    return sendPost(url, headers, body, signal, true);
}

// ============================================================
//  专用请求函数：可直接用于非 chat/completions 场景
// ============================================================

/**
 * 调用图片生成 API
 */
export async function llmImagesGenerate(
    params: {
        prompt: string;
        n?: number;
        size?: string;
        quality?: string;
        style?: string;
    },
    signal?: AbortSignal
): Promise<Response> {
    const body = buildImagesBody({
        ...params,
        model: ai_config.model,
        extraParams: parseExtraParams(),
    });
    const url = resolveRequestUrl('images');
    const headers = buildHeaders("application/json");
    return sendPost(url, headers, body, signal, false);
}

/**
 * 调用文本转语音 API
 */
export async function llmAudioSpeech(
    params: {
        input: string;
        voice?: string;
        speed?: number;
        response_format?: string;
    },
    signal?: AbortSignal
): Promise<Response> {
    const body = buildAudioSpeechBody({
        ...params,
        model: ai_config.model,
        extraParams: parseExtraParams(),
    });
    const url = resolveRequestUrl('audio_speech');
    const headers = buildHeaders("application/json");
    return sendPost(url, headers, body, signal, false);
}

/**
 * 调用 Embeddings API
 */
export async function llmEmbeddings(
    params: {
        input: string | string[];
        encoding_format?: string;
        dimensions?: number;
    },
    signal?: AbortSignal
): Promise<Response> {
    const body = buildEmbeddingsBody({
        ...params,
        model: ai_config.model,
        extraParams: parseExtraParams(),
    });
    const url = resolveRequestUrl('embeddings');
    const headers = buildHeaders("application/json");
    return sendPost(url, headers, body, signal, false);
}

/**
 * 解析 extraParams（来自 json_params 配置）
 */
function parseExtraParams(): Record<string, any> | undefined {
    try {
        if (ai_config.json_params) {
            const obj = JSON.parse(ai_config.json_params);
            // 对于非 completions 类型，stream 等参数不适用
            return obj;
        }
    } catch {
        // ignore
    }
    return undefined;
}
