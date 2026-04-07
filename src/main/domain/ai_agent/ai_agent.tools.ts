import {readFile, writeFile, readdir, appendFile} from 'fs/promises';
import {shellServiceImpl} from "../shell/shell.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {SystemUtil} from "../sys/sys.utl";
import {ai_agentService} from "./ai_agent.service";
import fg from "fast-glob";
import needle from "needle";
import { parsePatch, applyPatch } from "diff";import {BinFileUtil} from "../bin/bin.file.util";
import {RG_PATH} from "../bin/download-ripgrep";

export const Ai_agentTools = {
    // 读取文件
    read_file: async ({path}) => {
        const content = await readFile(path, 'utf-8');
        return `文件内容是: ${content}`;
    },
    // 读取目录
    list_files: async ({path = '.'}) => {
        const files = await readdir(path, {withFileTypes: true});
        return  `${path}下的文件列表为: ${files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n')}`;
    },
    // 修改文件
    edit_file: async ({
                          path,
                          action,
                          content,
                      }: any) => {

        let newContent: string | null = null;

        switch (action) {

            // =========================
            // 1️⃣ diff 模式（需要读文件）
            // =========================
            case "diff": {
                if (!content) throw new Error("diff content required");

                const fileContent = await readFile(path, "utf-8");

                // const result = applyPatch(fileContent, content);
                //
                const patches = parsePatch(content);

                const result = applyPatch(fileContent, patches[0]);

                if (result === false) {
                    throw new Error("Failed to apply diff (patch rejected)");
                }

                newContent = result;
                await writeFile(path, newContent, "utf-8");
                break;
            }

            // =========================
            // 2️⃣ overwrite（需要读文件逻辑可选，这里直接写）
            // =========================
            case "overwrite": {
                if (typeof content !== "string") {
                    throw new Error("content required");
                }

                await writeFile(path, content, "utf-8");
                break;
            }

            // =========================
            // 3️⃣ append（🔥不读文件）
            // =========================
            case "append": {
                if (typeof content !== "string") {
                    throw new Error("content required");
                }

                await appendFile(path, "\n" + content, "utf-8");
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        // =========================
        // 🚀 统一返回（不返回文件内容）
        // =========================
        return JSON.stringify({
            ok: true,
            action,
            path,
            updated: true
        });
    },
    // 执行命令 todo 更多执行参数
    exec_cmd: async ({cmd,cwd}: { cmd: string,cwd:string }) => {
        return SystemUtil.execAsync(cmd,cwd)
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

            if (max_length >=0 && text.length > max_length) {
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
    },
    search_in_files: async ({
                        pattern,
                        path: searchPath,
                        max_files = 50,
                        max_matches_per_file = 20,
                        ignore_case = true
                    }: {
        pattern: string;
        path: string;
        max_files?: number;
        max_matches_per_file?: number;
        ignore_case?: boolean;
    })=> {

        const rg_path = BinFileUtil.get_bin_path(RG_PATH)
        // ======================================================
        // ✅ CASE 1: 使用 ripgrep（优先路径）
        // ======================================================
        if (rg_path) {
            try {
                console.log("[search] using ripgrep")

                const args = [
                    rg_path,
                    "--vimgrep",
                    "--no-heading",
                    "--with-filename",
                    "--line-number",
                    "--column",
                    pattern,
                    searchPath
                ]

                if (ignore_case) args.splice(1, 0, "-i")

                const output = await SystemUtil.execAsync(args.join(" "))

                const lines = output.split("\n").filter(Boolean)

                const fileMap = new Map()

                for (const line of lines) {
                    // format: file:line:col:text
                    const [file, lineNum, col, ...textArr] = line.split(":")
                    const text = textArr.join(":")

                    if (!fileMap.has(file)) fileMap.set(file, [])
                    const arr = fileMap.get(file)

                    if (arr.length < max_matches_per_file) {
                        arr.push({
                            line: Number(lineNum),
                            text: text.slice(0, 300)
                        })
                    }
                }

                const results = Array.from(fileMap.entries())
                    .slice(0, max_files)
                    .map(([file, matches]) => ({ file, matches }))

                return JSON.stringify({
                    mode: "ripgrep",
                    pattern,
                    scanned_files: results.length,
                    matched_files: results.length,
                    results
                }, null, 2)
            } catch (err) {
                console.warn("[search] ripgrep failed, fallback to JS:", err)
            }
        }

        // ======================================================
        // ❌ CASE 2: fallback（你原来的逻辑）
        // ======================================================
        console.log("[search] using JS fallback")

        const files = await fg([`${searchPath}/**/*.*`], {
            onlyFiles: true,
            // ignore: [
            //     "**/node_modules/**",
            //     "**/.git/**",
            //     "**/dist/**",
            //     "**/build/**"
            // ]
        })

        const regex = new RegExp(pattern, ignore_case ? "i" : "")
        const results: any[] = []

        let fileCount = 0

        for (const file of files) {
            if (fileCount >= max_files) break

            try {
                const content = await readFile(file, "utf-8")
                const lines = content.split("\n")

                const matches: any[] = []

                for (let i = 0; i < lines.length; i++) {
                    if (matches.length >= max_matches_per_file) break

                    if (regex.test(lines[i])) {
                        matches.push({
                            line: i + 1,
                            text: lines[i].slice(0, 300)
                        })
                    }
                }

                if (matches.length > 0) {
                    results.push({ file, matches })
                    fileCount++
                }

            } catch (e) {
                // skip binary / permission error
            }
        }

        return JSON.stringify({
            pattern,
            scanned_files: files.length,
            matched_files: results.length,
            results
        }, null, 2)
    },
}

export type Ai_agentTools_type = keyof typeof Ai_agentTools;

export const tools_des_map: Record<Ai_agentTools_type, {
    get_name:()=>string,
    get_params:(args:any)=>string,
}> = {
    edit_file: {
        get_name:()=> "编辑文件",
        get_params:(args)=>{
            return ` ${args.path} ${args.action} 内容：${args.content}`
        }
    },
    exec_cmd: {
        get_name:()=>"执行命令",
        get_params:(args)=>{
            return ` ${args.cmd} 在 ${args.cwd}`
        }
    },
    http_request: {
        get_name:()=>"请求http",
        get_params:(args)=>{
            return `url为 ${args.url}`
        }
    },
    list_files: {
        get_name:()=>"查询目录",
        get_params:(args)=>{
            return ` ${args.path}`
        }
    },
    read_file: {
        get_name:()=>"读取文件",
        get_params:(args)=>{
            return ` ${args.path}`
        }
    },
    search_docs: {
        get_name:()=>"搜索本地知识库",
        get_params:(args)=>{
            return `关键词： ${args.keywords?.join(" ")}`
        }
    },
    search_in_files: {
        get_name:()=>"搜索文件内容",
        get_params:(args)=>{
            return `路径： ${args.path}`
        }
    }
};
