import {readFile, writeFile, readdir} from 'fs/promises';
import {shellServiceImpl} from "../shell/shell.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {SystemUtil} from "../sys/sys.utl";
import {ai_agentService} from "./ai_agent.service";

export const Ai_agentTools = {
    // 读取文件
    read_file: async ({path}) => {
        const content = await readFile(path, 'utf-8');
        return content;
    },
    // 读取目录
    list_files: async ({path = '.'}) => {
        const files = await readdir(path, {withFileTypes: true});
        return files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n');
    },
    // 修改文件
    edit_file: async ({path, new_content}) => {
        await writeFile(path, new_content, 'utf-8');
        return 'OK';
    },
    // 执行命令
    exec_cmd: async ({cmd}: { cmd: string }) => {
        return SystemUtil.execAsync(cmd)
    },
    // 搜索本地知识库
    search_docs: async ({keywords}: { keywords: string[] }) => {
        return ai_agentService.search_docs({keywords})
    },
    // 访问某个网页
    http_request: async ({
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
        // ---------- 安全校验 ----------
        const u = new URL(url);
        // if (!["http:", "https:"].includes(u.protocol)) {
        //     throw new Error("仅允许 http/https 协议");
        // }
        // if (
        //     u.hostname === "localhost" ||
        //     u.hostname.startsWith("127.") ||
        //     u.hostname.startsWith("192.168.") ||
        //     u.hostname.startsWith("10.") ||
        //     u.hostname.endsWith(".local")
        // ) {
        //     throw new Error("禁止访问本地或内网地址");
        // }

        // ---------- query ----------
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                u.searchParams.set(k, String(v));
            }
        }

        // ---------- timeout ----------
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchOptions: any = {
                method: method.toUpperCase(),
                headers: {
                    "User-Agent": "ai-agent/1.0",
                    ...headers
                },
                signal: controller.signal
            };

            // ---------- body ----------
            if (body !== undefined && fetchOptions.method !== "GET") {
                if (
                    typeof body === "object" &&
                    !Buffer.isBuffer(body)
                ) {
                    fetchOptions.body = JSON.stringify(body);
                    fetchOptions.headers["Content-Type"] =
                        fetchOptions.headers["Content-Type"] ||
                        "application/json";
                } else {
                    fetchOptions.body = String(body);
                }
            }

            const res = await fetch(u.toString(), fetchOptions);

            let text = await res.text();

            if (text.length > max_length) {
                text =
                    text.slice(0, max_length) +
                    "\n\n...（响应内容过长，已截断）";
            }

            const headersObj: Record<string, string> = {};
            res.headers.forEach((value, key) => {
                headersObj[key] = value;
            });

            return JSON.stringify(
                {
                    status: res.status,
                    statusText: res.statusText,
                    headers: headersObj,
                    body: text
                },
                null,
                2
            );

        } finally {
            clearTimeout(timer);
        }
    }
}

export type Ai_agentTools_type = keyof typeof Ai_agentTools;
