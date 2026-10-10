import React, {useMemo} from 'react';
import {useTranslation} from "react-i18next";
import * as Diff from "diff";

interface Props {
    /** unified diff 原文（git diff 的输出），空串表示无差异 */
    diff_text: string;
    /** 展示模式：单栏内联 / 左右并排 */
    mode?: "unified" | "split";
}

/** diff 渲染出的一行 */
interface DiffLine {
    /** 行类型：上下文/新增/删除 */
    type: "context" | "add" | "del";
    /** 行号（旧文件），新增行为 null */
    old_num: number | null;
    /** 行号（新文件），删除行为 null */
    new_num: number | null;
    /** 行内容（不含前导 +/-/空格） */
    text: string;
}

/** 一个 hunk 的头信息与行列表 */
interface DiffHunk {
    header: string;
    lines: DiffLine[];
}

/**
 * 把 git diff 原文解析为可渲染的 hunk 列表。
 * 优先用 diff 包的 parsePatch 得到结构化数据（能自动计算行号）；
 * 若解析失败（行数与 @@ 头声明不符等）则降级为手动扫描，保证 diff 始终能显示。
 */
function parse_to_hunks(diff_text: string): DiffHunk[] {
    if (!diff_text.trim()) return [];
    try {
        return parse_by_package(diff_text);
    } catch {
        return parse_manually(diff_text);
    }
}

/** 用 diff 包的 parsePatch 解析 */
function parse_by_package(diff_text: string): DiffHunk[] {
    const patches = Diff.parsePatch(diff_text);
    const hunks: DiffHunk[] = [];
    for (const patch of patches) {
        for (const hunk of patch.hunks) {
            // 行号从 hunk 头声明的起始位置开始，按行类型分别推进
            let old_num = hunk.oldStart;
            let new_num = hunk.newStart;
            const lines: DiffLine[] = [];
            for (const raw of hunk.lines) {
                // 空字符串是行尾标记，跳过
                if (raw === "") continue;
                const marker = raw[0];
                const text = raw.substring(1);
                if (marker === "+") {
                    lines.push({type: "add", old_num: null, new_num: new_num++, text});
                } else if (marker === "-") {
                    lines.push({type: "del", old_num: old_num++, new_num: null, text});
                } else if (marker === " ") {
                    lines.push({type: "context", old_num: old_num++, new_num: new_num++, text});
                }
                // \ No newline at end of file 之类以 \ 开头的直接忽略
            }
            hunks.push({
                header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
                lines,
            });
        }
    }
    return hunks;
}

/**
 * 降级解析：逐行扫描 diff 原文，自己读取 @@ 头推进行号。
 * 与上面产出同构的结果，供 parsePatch 抛错时兜底。
 */
function parse_manually(diff_text: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let current: DiffHunk | null = null;
    let old_num = 0;
    let new_num = 0;
    for (const raw of diff_text.split("\n")) {
        // hunk 头：@@ -旧起始,旧行数 +新起始,新行数 @@
        const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
        if (m) {
            old_num = parseInt(m[1], 10);
            new_num = parseInt(m[2], 10);
            current = {header: raw, lines: []};
            hunks.push(current);
            continue;
        }
        if (!current) continue;
        // --- / +++ 文件头在 hunk 之前，diff --git 之类的元信息直接忽略
        const marker = raw[0];
        const text = raw.substring(1);
        if (marker === "+") {
            current.lines.push({type: "add", old_num: null, new_num: new_num++, text});
        } else if (marker === "-") {
            current.lines.push({type: "del", old_num: old_num++, new_num: null, text});
        } else if (marker === " ") {
            current.lines.push({type: "context", old_num: old_num++, new_num: new_num++, text});
        }
    }
    return hunks;
}

/** 把 hunk 行拆成左右两栏：左侧为旧内容，右侧为新内容 */
function split_rows(lines: DiffLine[]): {left: DiffLine | null, right: DiffLine | null}[] {
    const rows: {left: DiffLine | null, right: DiffLine | null}[] = [];
    // 连续的一段删除/新增配对显示，上下文行左右同行
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.type === "context") {
            rows.push({left: line, right: line});
            i++;
            continue;
        }
        // 收集连续的删除段与新增段
        const dels: DiffLine[] = [];
        while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
        const adds: DiffLine[] = [];
        while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
        const max = Math.max(dels.length, adds.length);
        for (let k = 0; k < max; k++) {
            rows.push({left: dels[k] ?? null, right: adds[k] ?? null});
        }
    }
    return rows;
}

/** 单栏内联视图 */
function UnifiedView({hunks}: { hunks: DiffHunk[] }) {
    return (
        <div className="git-diff">
            {hunks.map((hunk, hi) => (
                <div className="git-diff__hunk" key={hi}>
                    <div className="git-diff__hunk-header">{hunk.header}</div>
                    {hunk.lines.map((line, li) => (
                        <div className={`git-diff__line git-diff__line--${line.type}`} key={li}>
                            <span className="git-diff__num">{line.old_num ?? ""}</span>
                            <span className="git-diff__num">{line.new_num ?? ""}</span>
                            <span className="git-diff__sign">
                                {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                            </span>
                            <span className="git-diff__code">{line.text || " "}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/** 左右并排视图 */
function SplitView({hunks}: { hunks: DiffHunk[] }) {
    return (
        <div className="git-diff git-diff--split">
            {hunks.map((hunk, hi) => {
                const rows = split_rows(hunk.lines);
                return (
                    <div className="git-diff__hunk" key={hi}>
                        <div className="git-diff__hunk-header">{hunk.header}</div>
                        {rows.map((row, ri) => (
                            <div className="git-diff__row" key={ri}>
                                <div className={`git-diff__cell git-diff__cell--${row.left ? row.left.type : "empty"}`}>
                                    <span className="git-diff__num">{row.left?.old_num ?? ""}</span>
                                    <span className="git-diff__code">{row.left?.text ?? ""}</span>
                                </div>
                                <div className={`git-diff__cell git-diff__cell--${row.right ? row.right.type : "empty"}`}>
                                    <span className="git-diff__num">{row.right?.new_num ?? ""}</span>
                                    <span className="git-diff__code">{row.right?.text ?? ""}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Git diff 查看器。
 * 输入是 git diff 的 unified 原文，负责渲染为带行级着色的差异视图。
 */
export default function GitDiffView({diff_text, mode = "unified"}: Props) {
    const {t} = useTranslation();
    const hunks = useMemo(() => parse_to_hunks(diff_text), [diff_text]);

    if (!diff_text.trim()) {
        return (
            <div className="git-diff-empty">
                <span>{t('无差异')}</span>
            </div>
        );
    }
    if (hunks.length === 0) {
        // 二进制文件等无法解析为文本 diff 的情况
        return (
            <div className="git-diff-empty">
                <span>{t('二进制文件')}</span>
            </div>
        );
    }
    return mode === "split" ? <SplitView hunks={hunks}/> : <UnifiedView hunks={hunks}/>;
}
