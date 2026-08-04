import {RG_PATH} from "../../bin/download-ripgrep";
import fg from "fast-glob";
import {readFile} from "fs/promises";
import {spawnSync} from "child_process";
import {FileUtil} from "../../file/FileUtil";

export const search_in_files_tool = async ({
                                               pattern,
                                               path: searchPath,
                                               max_files = 50,
                                               max_matches_per_file = 20,
                                               ignore_case = true,
                                               ignore_paths = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"]
                                           }: {
    pattern: string;
    path: string;
    max_files?: number;
    max_matches_per_file?: number;
    ignore_case?: boolean;
    ignore_paths?: string[];
}) => {
    // 1. 获取路径信息，判断是文件还是目录
    const stats = await FileUtil.statSync(searchPath);
    const isFile = stats.isFile();

    // 2. 忽略路径统一转为 ripgrep 的 glob 通配（fast-glob 与 rg 格式通用）
    const ignore = isFile ? [] : ignore_paths.map(p => p.replace(/^!/, ""));


    // ======================================================
    // ✅ CASE 1: 使用 ripgrep
    // ======================================================
    if (await FileUtil.access(RG_PATH)) {
        try {
            const args = ["--json"];
            if (!isFile) {
                ignore.forEach(p => args.push("--glob", `!${p}`));
            }
            if (ignore_case) args.push("-i");
            args.push(pattern, searchPath);

            const result = spawnSync(RG_PATH, args, {encoding: "utf8", maxBuffer: 50 * 1024 * 1024});
            const output = result.stdout || "";
            const fileMap = new Map<string, { line: number; text: string }[]>();

            for (const line of output.split("\n")) {
                if (!line) continue;
                let msg: any;
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.type !== "match") continue;

                const file = msg.data.path.text;
                const lineNum = msg.data.line_number;
                const text = (msg.data.lines.text || "").replace(/\r?\n$/, "").slice(0, 300);

                if (!fileMap.has(file)) fileMap.set(file, []);
                const arr = fileMap.get(file)!;
                if (arr.length < max_matches_per_file) {
                    arr.push({line: lineNum, text});
                }
            }

            const results = Array.from(fileMap.entries())
                .slice(0, max_files)
                .map(([file, matches]) => ({file, matches}));

            return JSON.stringify({
                mode: "ripgrep",
                pattern,
                scanned_files: results.length,
                matched_files: results.length,
                results
            }, null, 2);
        } catch (err) {
            console.warn("[search] ripgrep failed, fallback to JS:", err);
        }
    }

    // ======================================================
    // ❌ CASE 2: JS fallback
    // ======================================================
    // fallback 中的 pattern 作为正则使用，需防止非法正则抛错
    let regex: RegExp;
    try {
        regex = new RegExp(pattern, ignore_case ? "i" : "");
    } catch (e) {
        // 非法正则时退化为字面量匹配（转义所有元字符）
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignore_case ? "i" : "");
    }

    let files: string[] = [];
    if (isFile) {
        files = [searchPath];
    } else {
        // fast-glob 不支持 Windows 反斜杠，统一转为正斜杠
        const globPath = searchPath.replace(/\\/g, "/");
        files = await fg([`${globPath}/**/*`], {
            onlyFiles: true,
            ignore,
            dot: true
        });
    }

    const results: any[] = [];

    // 单文件读取大小上限，避免大文件内存溢出
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const pending = files.slice(0, max_files);

    await Promise.all(pending.map(async (file) => {
        try {
            const stat = await FileUtil.statSync(file);
            if (stat.size > MAX_FILE_SIZE) return;

            const content = await readFile(file, "utf-8");
            // 含空字节视为二进制文件，跳过
            if (content.indexOf("\u0000") >= 0) return;

            const lines = content.split("\n");
            const matches: any[] = [];

            for (let i = 0; i < lines.length; i++) {
                if (matches.length >= max_matches_per_file) break;
                if (regex.test(lines[i])) {
                    matches.push({
                        line: i + 1,
                        text: lines[i].slice(0, 300)
                    });
                }
            }

            if (matches.length > 0) {
                results.push({file, matches});
            }
        } catch (e) {
            // 跳过二进制文件或权限错误
        }
    }));

    // 按扫描到的顺序返回（保持文件目录顺序稳定）
    results.sort((a, b) => pending.indexOf(a.file) - pending.indexOf(b.file));

    return JSON.stringify({
        mode: "js-fallback",
        pattern,
        scanned_files: files.length,
        matched_files: results.length,
        results
    }, null, 2);
};

export const search_in_files_schema = {
    type: "function",
    function: {
        name: "search_in_files",
        description: "在本地项目中跨文件搜索文本内容，支持自定义忽略路径",
        parameters: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "要搜索的正则或关键词" },
                path: { type: "string", description: "搜索路径,是绝对路径" },
                max_files: { type: "number", description: "最多扫描多少个文件" },
                max_matches_per_file: { type: "number", description: "每个文件最多匹配多少条结果" },
                ignore_case: { type: "boolean", description: "是否忽略大小写" },
                ignore_paths: {
                    type: "array",
                    items: { type: "string" },
                    description: "要忽略的路径模式数组，例如 ['**/node_modules/**', '**/dist/**']"
                }
            },
            required: ["pattern", "path"]
        }
    }
};
