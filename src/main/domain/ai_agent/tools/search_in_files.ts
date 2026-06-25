import {BinFileUtil} from "../../bin/bin.file.util";
import {RG_PATH} from "../../bin/download-ripgrep";
import {SystemUtil} from "../../sys/sys.utl";
import fg from "fast-glob";
import {readFile} from "fs/promises";
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

    const rg_path = BinFileUtil.get_bin_path(RG_PATH);

    // ======================================================
    // ✅ CASE 1: 使用 ripgrep
    // ======================================================
    if (rg_path) {
        try {
            const args = [rg_path, "--vimgrep", "--no-heading", "--with-filename", "--line-number", "--column"];

            // 只有当是目录时，才添加忽略路径的 glob 参数
            if (!isFile) {
                ignore_paths.forEach(p => args.push("--glob", `!${p}`));
            }

            if (ignore_case) args.push("-i");

            // 将 searchPath 直接传给 rg
            args.push(pattern, searchPath);

            const output = await SystemUtil.execAsync(args.join(" "));
            const lines = output.split("\n").filter(Boolean);
            const fileMap = new Map();

            for (const line of lines) {
                const [file, lineNum, col, ...textArr] = line.split(":");
                const text = textArr.join(":");

                if (!fileMap.has(file)) fileMap.set(file, []);
                const arr = fileMap.get(file);

                if (arr.length < max_matches_per_file) {
                    arr.push({
                        line: Number(lineNum),
                        text: text.slice(0, 300)
                    });
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
    let files: string[] = [];
    if (isFile) {
        files = [searchPath];
    } else {
        files = await fg([`${searchPath}/**/*.*`], {
            onlyFiles: true,
            ignore: ignore_paths
        });
    }

    const regex = new RegExp(pattern, ignore_case ? "i" : "");
    const results: any[] = [];
    let fileCount = 0;

    for (const file of files) {
        if (fileCount >= max_files) break;

        try {
            const content = await readFile(file, "utf-8");
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
                fileCount++;
            }
        } catch (e) {
            // 跳过二进制文件或权限错误
        }
    }

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