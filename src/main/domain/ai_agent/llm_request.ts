import axios, {AxiosResponse} from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import {ai_config, ai_config_env} from "./ai_agent.service";

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

/**
 * 发送非流式请求到大模型（用于记忆压缩等场景）
 * 返回 fetch 风格的 Response
 */
export async function llmPost(
    body: any,
    signal?: AbortSignal
): Promise<Response> {
    if (ai_config_env?.proxy_url) {
        const proxyConfig = getProxyConfig();
        const res = await axios({
            url: ai_config.url,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeader(ai_config.token)
            },
            data: JSON.stringify(body),
            responseType: 'text',
            signal,
            ...proxyConfig
        });
        return toFetchResponse(res);
    }

    return fetch(ai_config.url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": getAuthHeader(ai_config.token)
        },
        body: JSON.stringify(body),
        signal
    });
}

/**
 * 发送流式大模型请求（支持代理）
 * 返回 fetch 风格的 Response，兼容现有 SSE 处理逻辑
 */
export async function llmPostStream(
    body: any,
    signal?: AbortSignal
): Promise<Response> {
    if (ai_config_env?.proxy_url) {
        const proxyConfig = getProxyConfig();
        const res = await axios({
            url: ai_config.url,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeader(ai_config.token)
            },
            data: JSON.stringify(body),
            responseType: 'stream',
            signal,
            ...proxyConfig
        });

        // 将 Node.js stream 包装为 Web ReadableStream 用于 fetch Response
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

    return fetch(ai_config.url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": getAuthHeader(ai_config.token)
        },
        body: JSON.stringify(body),
        signal
    });
}
