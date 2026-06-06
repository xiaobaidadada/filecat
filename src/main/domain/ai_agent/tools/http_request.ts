import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ai_agent_params_type } from "./ai_agent.constant";

export const http_request_schema: ai_agent_params_type = {
    type: "function",
    function: {
        name: "http_request",
        description:
            "发送 HTTP 请求以访问外部网络资源。支持 GET/POST/PUT/DELETE/PATCH 等方法，可设置请求头、查询参数和请求体。",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "请求的完整 URL（仅支持 http 或 https）"
                },
                method: {
                    type: "string",
                    description: "HTTP 方法，如 GET、POST、PUT、DELETE、PATCH，默认 GET"
                },
                headers: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "请求头（键值对）"
                },
                query: {
                    type: "object",
                    additionalProperties: {
                        oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
                    },
                    description: "URL 查询参数"
                },
                body: {
                    description: "请求体内容（对象将自动转为 JSON）"
                },
                timeout: {
                    type: "number",
                    description: "请求超时时间（毫秒），默认 10000"
                },
                max_length: {
                    type: "number",
                    description: "最大返回字符数，超出将被截断，默认 8000, -1 是不截断"
                },
                proxy: {
                    type: "string",
                    description: "HTTP 代理地址，例如 http://127.0.0.1:7890"
                }
            },
            required: ["url"]
        }
    }
};

export const http_request_tool = async ({
                                            url,
                                            method = "GET",
                                            headers = {},
                                            query,
                                            body,
                                            timeout = 10000,
                                            max_length = 8000,
                                            proxy
                                        }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean>;
    body?: any;
    timeout?: number;
    max_length?: number;
    proxy?: string;
}) => {
    // ---------- URL 处理 ----------
    const u = new URL(url);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            u.searchParams.set(k, String(v));
        }
    }

    // ---------- Axios 配置 ----------
    const config: any = {
        url: u.toString(),
        method: method.toUpperCase(),
        headers: {
            "User-Agent": "ai-agent/1.0",
            ...headers
        },
        timeout: timeout, // axios 的 timeout 覆盖整个请求流程
        data: body,
        responseType: 'text', // 强制获取文本，方便后续截断处理
        validateStatus: () => true // 允许所有状态码通过，方便由我们自己处理错误
    };

    // 配置代理
    if (proxy) {
        const agent = new HttpsProxyAgent(proxy);
        config.httpAgent = agent;
        config.httpsAgent = agent;
    }

    try {
        const res = await axios(config);

        // ---------- 响应处理 ----------
        let text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

        if (max_length >= 0 && text.length > max_length) {
            text = text.slice(0, max_length) + "\n\n...（响应内容过长，已截断）";
        }

        return JSON.stringify({
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
            body: text
        }, null, 2);

    } catch (e: any) {
        // Axios 错误处理 (如网络连接失败、超时等)
        return JSON.stringify({
            error: e.message,
            code: e.code,
            status: e.response?.status
        });
    }
};

// async function runTests() {
//     console.log("--- 开始测试 (Axios版) ---");
//     try {
//         const res = await http_request_tool({
//             url: "https://www.google.com",
//             proxy: "http://127.0.0.1:3067",
//             timeout: 5000
//         });
//         const parsed = JSON.parse(res);
//         console.log("状态码:", parsed.status);
//     } catch (err) {
//         console.error("测试运行出错:", err);
//     }
// }
// runTests();
//
