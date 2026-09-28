import {OutlineItem} from "./MdOutline";

/**
 * 从 Markdown 原文里解析标题，供源码模式的编辑器大纲使用。
 *
 * 为什么需要它：所见即所得模式下大纲直接问 ProseMirror 要（节点位置天然存在），
 * 而源码模式只有一个 textarea，没有文档模型，只能从文本本身扫。
 *
 * 这里刻意支持与 ProseMirror 一致的标题形态：
 *   - ATX 标题：# ~ ######（行首，最多 3 个前导空格）
 *   - 标题末尾的闭合 #（如 "## 标题 ##"）会去掉
 *   - 跳过围栏代码块（``` 或 ~~~）里的内容，避免把代码注释里的 # 当成标题
 *
 * pos 的语义：这里放的是「该标题所在行的起始字符偏移（0 基）」，
 * 与所见即所得模式的 ProseMirror 文档位置不是一回事，
 * 但两者都只是当 key / 折叠标识 / 跳转目标用，互不影响。
 */
export function parse_markdown_headings(text: string): OutlineItem[] {
    const items: OutlineItem[] = [];
    if (!text) {
        return items;
    }
    // 用带捕获组的 split 保留每行结尾的换行符，这样逐行累加 line.length
    // 得到的偏移与实际字符位置严格一致（能正确处理 CRLF 的 \r\n 两个字符）。
    // 若改成 split(/\r?\n/) 再固定 +1，CRLF 文件会每行累积偏差 1，跳转会越跑越偏。
    const lines = text.split(/(\n)/);
    // 当前所处的围栏代码块标记（null 表示不在代码块里）
    let fence: string | null = null;
    let offset = 0;

    // lines 形如 [行内容, 分隔符, 行内容, 分隔符, ...]，按 2 步前进
    for (let i = 0; i < lines.length; i += 2) {
        // 去掉行尾的 \r（CRLF 文件），标题匹配不受影响，但 length 要按原始算
        const raw_line = lines[i];
        const line_start = offset;
        offset += raw_line.length + (lines[i + 1]?.length ?? 0);

        // 匹配时去掉行尾 \r，保持与 split(/\r?\n/) 一致的行为
        const line = raw_line.endsWith("\r") ? raw_line.slice(0, -1) : raw_line;
        const trimmed = line.trimStart();
        // 围栏代码块的开合：``` 或 ~~~（三个及以上）
        const fence_match = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fence_match) {
            const marker = fence_match[1][0];
            if (fence === null) {
                fence = marker;
            } else if (fence === marker) {
                fence = null;
            }
            continue;
        }
        // 代码块内部的内容不当作标题
        if (fence !== null) {
            continue;
        }

        // ATX 标题：允许最多 3 个前导空格（Markdown 规范）
        const m = /^ {0,3}(#{1,6})\s+(.*)$/.exec(line);
        if (!m) {
            continue;
        }
        const level = m[1].length;
        // 去掉结尾的闭合 #（如 "## 标题 ##"）
        const title = m[2].replace(/\s+#+\s*$/, "").trim();
        items.push({level, text: title, pos: line_start});
    }
    return items;
}

/**
 * 在 Markdown 原文里，找出光标（字符偏移）当前所在的标题。
 * 规则与所见即所得模式一致：取位置在光标之前、且最近的那个标题的 pos。
 * 找不到时返回 -1。
 */
export function find_active_heading(items: OutlineItem[], cursor: number): number {
    let current = -1;
    for (const item of items) {
        if (item.pos <= cursor) {
            current = item.pos;
        } else {
            break;
        }
    }
    return current;
}
