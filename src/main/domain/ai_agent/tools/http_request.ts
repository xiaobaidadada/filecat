import needle from "needle";
import {ai_agent_params_type} from "./ai_agent.constant";


export const http_request_schema:ai_agent_params_type = {
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
                    description: "最大返回字符数，超出将被截断，默认 8000,-1s是不截断"
                }
            },
            required: ["url"]
        }
    }
}


export const http_request_tool = async ({
                                            url,
                                            method = "GET",
                                            headers = {},
                                            query,
                                            body,
                                            timeout = 10000,
                                            max_length = 8000
                                        }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean>;
    body?: any;
    timeout?: number;
    max_length?: number;
}) => {

    // ---------- URL ----------
    const u = new URL(url);

    if (query) {
        for (const [k, v] of Object.entries(query)) {
            u.searchParams.set(k, String(v));
        }
    }

    const finalUrl = u.toString();

    // ---------- request options ----------
    const options: any = {
        headers: {
            "User-Agent": "ai-agent/1.0",
            ...headers
        },
        timeout: timeout,
        follow_max: 5,
        parse: false // 我们自己处理 body
    };

    try {
        const res = await needle(
            method.toUpperCase() as any,
            finalUrl,
            body ?? undefined,
            options
        );

        let text = "";

        if (Buffer.isBuffer(res.body)) {
            text = res.body.toString("utf8");
        } else if (typeof res.body === "string") {
            text = res.body;
        } else {
            text = JSON.stringify(res.body);
        }

        if (max_length >= 0 && text.length > max_length) {
            text =
                text.slice(0, max_length) +
                "\n\n...（响应内容过长，已截断）";
        }

        const headersObj: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers || {})) {
            headersObj[k] = String(v);
        }

        return JSON.stringify(
            {
                status: res.statusCode,
                statusText: res.statusMessage,
                headers: headersObj,
                body: text
            },
            null,
            2
        );

    } catch (e: any) {
        // needle 错误统一处理
        return JSON.stringify({
            error: e?.message ?? String(e),
            code: e?.code
        });
    }
}