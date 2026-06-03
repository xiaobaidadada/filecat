import {BinFileUtil} from "../../bin/bin.file.util";
import {RG_PATH} from "../../bin/download-ripgrep";
import {SystemUtil} from "../../sys/sys.utl";
import fg from "fast-glob";
import {readFile} from "fs/promises";


export const search_in_files_tool = async ({
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
    // ❌ CASE 2: fallback
    // ======================================================
    // console.log("[search] using JS fallback")

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
}

export const search_in_files_schema = {
    type: "function",
    function: {
        name: "search_in_files",
        description: "在本地项目中跨文件搜索文本内容（类似 grep），返回匹配的文件、行号和内容",
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "要搜索的正则或关键词"
                },
                path: {
                    type: "string",
                    description: "搜索路径"
                },
                max_files: {
                    type: "number",
                    description: "最多扫描多少个文件，默认50"
                },
                max_matches_per_file: {
                    type: "number",
                    description: "每个文件最多匹配多少条结果，默认20"
                },
                ignore_case: {
                    type: "boolean",
                    description: "是否忽略大小写，默认true"
                }
            },
            required: ["pattern"]
        }
    }
}