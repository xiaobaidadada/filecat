import {readFile, writeFile, readdir, appendFile, mkdir} from 'fs/promises';
// import {shellServiceImpl} from "../shell/shell.service";
// import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {SystemUtil} from "../sys/sys.utl";
import {ai_agentService} from "./ai_agent.service";
import fg from "fast-glob";
import needle from "needle";
import {BinFileUtil} from "../bin/bin.file.util";
import {RG_PATH} from "../bin/download-ripgrep";
import {FileUtil} from "../file/FileUtil";

type PatchLineType = "context" | "add" | "delete";

interface UnifiedPatchHunkLine {
    type: PatchLineType;
    text: string;
}

interface UnifiedPatchHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: UnifiedPatchHunkLine[];
}

function normalizeText(text: string) {
    return text.replace(/\r\n/g, "\n");
}

function parseUnifiedPatch(patchText: string): UnifiedPatchHunk[] {
    const lines = normalizeText(patchText).split("\n");
    const hunks: UnifiedPatchHunk[] = [];
    let currentHunk: UnifiedPatchHunk | null = null;

    for (const line of lines) {
        if (
            line.startsWith("diff --git ") ||
            line.startsWith("index ") ||
            line.startsWith("--- ") ||
            line.startsWith("+++ ")
        ) {
            continue;
        }

        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s.*)?$/);
        if (hunkMatch) {
            currentHunk = {
                oldStart: Number(hunkMatch[1]),
                oldCount: hunkMatch[2] ? Number(hunkMatch[2]) : 1,
                newStart: Number(hunkMatch[3]),
                newCount: hunkMatch[4] ? Number(hunkMatch[4]) : 1,
                lines: []
            };
            hunks.push(currentHunk);
            continue;
        }

        if (!currentHunk) {
            if (!line.trim()) {
                continue;
            }
            throw new Error(`patch 缺少 hunk 头: ${line}`);
        }

        if (line === "\\ No newline at end of file") {
            continue;
        }

        const prefix = line[0];
        const text = line.slice(1);
        if (prefix === " ") {
            currentHunk.lines.push({type: "context", text});
            continue;
        }
        if (prefix === "+") {
            currentHunk.lines.push({type: "add", text});
            continue;
        }
        if (prefix === "-") {
            currentHunk.lines.push({type: "delete", text});
            continue;
        }

        throw new Error(`patch 行必须以空格/+/- 开头: ${line}`);
    }

    if (hunks.length === 0) {
        throw new Error("未检测到有效的 unified diff hunk");
    }

    return hunks;
}

function applyUnifiedPatch(originalContent: string, patchText: string) {
    const normalized = normalizeText(originalContent);
    const originalLines = normalized === "" ? [] : normalized.split("\n");
    const hunks = parseUnifiedPatch(patchText);
    const result: string[] = [];
    let sourceIndex = 0;

    for (const hunk of hunks) {
        const targetIndex = Math.max(hunk.oldStart - 1, 0);
        if (targetIndex < sourceIndex) {
            throw new Error("patch hunk 顺序非法或发生重叠");
        }

        while (sourceIndex < targetIndex) {
            result.push(originalLines[sourceIndex]);
            sourceIndex++;
        }

        for (const line of hunk.lines) {
            if (line.type === "context") {
                if (originalLines[sourceIndex] !== line.text) {
                    throw new Error(`patch context 不匹配，期望第 ${sourceIndex + 1} 行是: ${line.text}`);
                }
                result.push(originalLines[sourceIndex]);
                sourceIndex++;
                continue;
            }

            if (line.type === "delete") {
                if (originalLines[sourceIndex] !== line.text) {
                    throw new Error(`patch delete 不匹配，期望第 ${sourceIndex + 1} 行是: ${line.text}`);
                }
                sourceIndex++;
                continue;
            }

            result.push(line.text);
        }
    }

    while (sourceIndex < originalLines.length) {
        result.push(originalLines[sourceIndex]);
        sourceIndex++;
    }

    return result.join("\n");
}

export const Ai_agentTools = {
    // 读取文件
    read_file: async ({path}) => {
        const content = await readFile(path, 'utf-8');
        return `文件内容是: ${content}`;
    },
    // 读取目录
    list_files: async ({path = '.'}) => {
        const files = await readdir(path, {withFileTypes: true});
        return `${path}下的文件列表为: ${files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n')}`;
    },
    // 修改文件
    edit_file: async ({path, action, content}: any) => {

        const exists = await FileUtil.access(path);
        if (!exists) {
            await writeFile(path, "", "utf-8");
        }

        switch (action) {

            // ===================================================
            // overwrite: 整个文件替换，适合小文件或全量重写
            // ===================================================
            case "overwrite": {
                if (typeof content !== "string") {
                    throw new Error("overwrite requires string content");
                }
                await writeFile(path, content, "utf-8");
                return {ok: true, action, path};
            }

            // ===================================================
            // replace: 核心操作，Claude Code / Cursor 同款
            // 用 old_string 精确定位，替换为 new_string
            // old_string 必须在文件中唯一，否则报错让 AI 加更多上下文
            // ===================================================
            case "replace": {
                let fileContent = await readFile(path, "utf-8");
                const ops = Array.isArray(content) ? content : [content];
                const report: { find: string; found: boolean; unique: boolean }[] = [];

                for (const op of ops) {
                    if (!op || typeof op.find !== "string") {
                        throw new Error("replace requires { find: string, replace?: string }");
                    }
                    const replaceValue = typeof op.replace === "string" ? op.replace : "";

                    // 统计出现次数，不唯一就拒绝（Claude Code 的做法）
                    const occurrences = fileContent.split(op.find).length - 1;

                    if (occurrences === 0) {
                        // 尝试 trim 后模糊匹配给出提示（Cursor 的做法）
                        const trimmedFind = op.find.trim();
                        const fuzzyFound = fileContent.includes(trimmedFind);
                        report.push({find: op.find, found: false, unique: false});
                        throw new Error(
                            `replace failed: find 内容在文件中不存在。\n` +
                            (fuzzyFound
                                ? `提示：去掉首尾空白后可以找到，请检查缩进或空格是否与文件完全一致。\n`
                                : `提示：请用 read_file 确认文件内容后再重试。\n`) +
                            `find 内容: "${op.find.slice(0, 200)}"`
                        );
                    }

                    if (occurrences > 1) {
                        // 不唯一，要求 AI 提供更多上下文（Claude Code 的做法）
                        throw new Error(
                            `replace failed: find 内容在文件中出现了 ${occurrences} 次，无法唯一定位。\n` +
                            `请在 find 中加入更多上下文行使其唯一，例如包含前后各1-2行代码。\n` +
                            `find 内容: "${op.find.slice(0, 200)}"`
                        );
                    }

                    fileContent = fileContent.replace(op.find, replaceValue);
                    report.push({find: op.find, found: true, unique: true});
                }

                await writeFile(path, fileContent, "utf-8");
                return {ok: true, action, path, ops: ops.length, report};
            }

            // ===================================================
            // append: 追加到文件末尾
            // ===================================================
            case "append": {
                if (typeof content !== "string") {
                    throw new Error("append requires string content");
                }
                const existing = await readFile(path, "utf-8");
                // 自动处理末尾换行，避免两段内容粘连
                const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
                await appendFile(path, `${separator}${content}`, "utf-8");
                return {ok: true, action, path};
            }

            // ===================================================
            // patch: unified diff，保留给复杂多处修改场景
            // 用 trim 模糊匹配 context，容忍尾随空格
            // ===================================================
            case "patch": {
                if (typeof content !== "string") {
                    throw new Error("patch requires unified diff string");
                }
                const fileContent = await readFile(path, "utf-8");
                const normalized = normalizeText(fileContent);
                const originalLines = normalized === "" ? [] : normalized.split("\n");
                const hunks = parseUnifiedPatch(content);
                const result: string[] = [];
                let sourceIndex = 0;

                for (const hunk of hunks) {
                    const targetIndex = Math.max(hunk.oldStart - 1, 0);
                    if (targetIndex < sourceIndex) {
                        throw new Error("patch hunk 顺序非法或发生重叠");
                    }
                    while (sourceIndex < targetIndex) {
                        result.push(originalLines[sourceIndex]);
                        sourceIndex++;
                    }
                    for (const line of hunk.lines) {
                        if (line.type === "context" || line.type === "delete") {
                            const actual = (originalLines[sourceIndex] ?? "").trim();
                            const expected = line.text.trim();
                            if (actual !== expected) {
                                throw new Error(
                                    `patch ${line.type} 不匹配，第 ${sourceIndex + 1} 行\n` +
                                    `  文件实际: "${originalLines[sourceIndex]}"\n` +
                                    `  patch期望: "${line.text}"\n` +
                                    `提示：请用 read_file 重新读取文件后再生成 patch`
                                );
                            }
                            if (line.type === "context") result.push(originalLines[sourceIndex]);
                            sourceIndex++;
                            continue;
                        }
                        result.push(line.text); // add
                    }
                }
                while (sourceIndex < originalLines.length) {
                    result.push(originalLines[sourceIndex++]);
                }

                await writeFile(path, result.join("\n"), "utf-8");
                return {ok: true, action, path};
            }

            // ===================================================
            // insert: 在某段内容之后插入（内容定位，不用行号）
            // after: 定位锚点字符串（找到它之后插入）
            // content: 要插入的内容
            // ===================================================
            case "insert": {
                const insertOp = content as {
                    after?: string;   // 在这段内容之后插入
                    before?: string;  // 或在这段内容之前插入
                    content: string;
                };

                if (!insertOp?.content) {
                    throw new Error("insert requires { after?: string, before?: string, content: string }");
                }

                let fileContent = await readFile(path, "utf-8");

                if (insertOp.after) {
                    const idx = fileContent.indexOf(insertOp.after);
                    if (idx === -1) {
                        throw new Error(
                            `insert failed: after 内容未找到，请用 read_file 确认文件内容。\nafter: "${insertOp.after.slice(0, 200)}"`
                        );
                    }
                    const insertAt = idx + insertOp.after.length;
                    const sep = fileContent[insertAt - 1] === "\n" ? "" : "\n";
                    fileContent = fileContent.slice(0, insertAt) + sep + insertOp.content + fileContent.slice(insertAt);
                } else if (insertOp.before) {
                    const idx = fileContent.indexOf(insertOp.before);
                    if (idx === -1) {
                        throw new Error(
                            `insert failed: before 内容未找到，请用 read_file 确认文件内容。\nbefore: "${insertOp.before.slice(0, 200)}"`
                        );
                    }
                    const sep = insertOp.content.endsWith("\n") ? "" : "\n";
                    fileContent = fileContent.slice(0, idx) + insertOp.content + sep + fileContent.slice(idx);
                } else {
                    // 没有锚点就追加到末尾
                    fileContent += (fileContent.endsWith("\n") ? "" : "\n") + insertOp.content;
                }

                await writeFile(path, fileContent, "utf-8");
                return {ok: true, action, path};
            }

            // ===================================================
            // delete: 删除某段内容（内容定位，不用行号）
            // ===================================================
            case "delete": {
                const deleteOp = content as { target: string };

                if (!deleteOp?.target) {
                    throw new Error("delete requires { target: string }，target 是要删除的完整代码片段");
                }

                let fileContent = await readFile(path, "utf-8");
                const occurrences = fileContent.split(deleteOp.target).length - 1;

                if (occurrences === 0) {
                    throw new Error(
                        `delete failed: target 内容在文件中不存在。\n` +
                        `请用 read_file 确认后重试。\ntarget: "${deleteOp.target.slice(0, 200)}"`
                    );
                }
                if (occurrences > 1) {
                    throw new Error(
                        `delete failed: target 内容出现了 ${occurrences} 次，无法唯一定位。\n` +
                        `请在 target 中加入更多上下文使其唯一。`
                    );
                }

                fileContent = fileContent.replace(deleteOp.target, "");
                await writeFile(path, fileContent, "utf-8");
                return {ok: true, action, path};
            }

            default:
                throw new Error(`unknown action: ${action}，支持: overwrite / replace / append / patch / insert / delete`);
        }
    },
    // 执行命令 todo 更多执行参数
    exec_cmd: async ({cmd, cwd}: { cmd: string, cwd: string }) => {
        return SystemUtil.execAsync(cmd, cwd)
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
    }) => {

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
                    .map(([file, matches]) => ({file, matches}))

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
                    results.push({file, matches})
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
    create_fs_entry: async ({
                                path,
                                type = "file",
                                content = "",
                                recursive = true
                            }: {
        path: string;
        type?: "file" | "dir";
        content?: string;
        recursive?: boolean;
    }) => {

        // =========================
        // 📁 创建目录
        // =========================
        if (type === "dir") {
            await mkdir(path, {recursive});
            return {
                ok: true,
                type,
                path,
                created: true
            };
        }

        // =========================
        // 📄 创建文件
        // =========================
        if (type === "file") {

            // 自动创建父目录（避免 writeFile 报错）
            const dir = path.substring(0, path.lastIndexOf("/"));
            if (dir) {
                await mkdir(dir, {recursive: true});
            }

            await writeFile(path, content ?? "", "utf-8");

            return {
                ok: true,
                type,
                path,
                created: true,
                hasContent: !!content
            };
        }

        throw new Error("invalid type: must be file or dir");
    },
}

export type Ai_agentTools_type = keyof typeof Ai_agentTools;

export const tools_des_map: Record<Ai_agentTools_type, {
    get_name: () => string,
    get_params: (args: any) => string,
}> = {
    edit_file: {
        get_name: () => "edit file",
        get_params: (args) => {
            return ` ${args.path} ${args.action} content：${typeof args.content === "string" ? args.content : JSON.stringify(args.content)}`
        }
    },
    exec_cmd: {
        get_name: () => "exe cmd",
        get_params: (args) => {
            return ` ${args.cmd} at ${args.cwd}`
        }
    },
    http_request: {
        get_name: () => "request http",
        get_params: (args) => {
            return `url is ${args.url}`
        }
    },
    list_files: {
        get_name: () => "query file dir",
        get_params: (args) => {
            return ` ${args.path}`
        }
    },
    read_file: {
        get_name: () => "read file",
        get_params: (args) => {
            return ` ${args.path}`
        }
    },
    search_docs: {
        get_name: () => "search docs",
        get_params: (args) => {
            return `keys： ${args.keywords?.join(" ")}`
        }
    },
    search_in_files: {
        get_name: () => "search in file",
        get_params: (args) => {
            return `path： ${args.path}`
        }
    },
    create_fs_entry: {
        get_name: () => "create file",
        get_params: (args) => {
            return `path： ${args.path}`
        }
    }
};
