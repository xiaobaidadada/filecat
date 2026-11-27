import {
    LaidOutPage,
    blocks,
    pageGeometry,
    paginate,
    resolveSectionLayout,
} from "@office-kit/docx-editor";
import type {Docx} from "@office-kit/docx";

/**
 * docx 真分页。
 *
 * 分页必须在浏览器里做，原因只有一个：块高只能实测量。
 * 同样是段落，标题 100px、空行 21px、正文两行 42px，靠估算会把分页算得
 * 面目全非（一行行累积误差，越往后偏得越离谱）。
 *
 * 流程：
 *   1. 文档先整篇渲染到 DOM（不能隐藏，隐藏了量不到高）；
 *   2. 逐块量 getBoundingClientRect().height；
 *   3. 把实测高喂给库的 paginate，拿到每页放哪些块、块的哪几行；
 *   4. 按分页结果把块搬进各页容器。
 *
 * 页高、页边距全部来自 docx 自带的 sectPr（pageGeometry），单位是 twip，
 * 这里统一换算成 px（96dpi），和浏览器 DOM 用同一套单位。
 */

/** 1 twip = 1/1440 英寸；96dpi 下 1px = 1/96 英寸 */
const TWIP_PER_PX = 1440 / 96;

export interface PageGeometryPx {
    width: number;
    height: number;
    /** 上下左右页边距 */
    top: number;
    right: number;
    bottom: number;
    left: number;
    /** 正文可用高度 = 页高 - 上下边距 */
    body_height: number;
}

/** 从 docx 的 sectPr 读出页面尺寸与页边距（twip → px） */
export function read_page_geometry(doc: Docx): PageGeometryPx {
    const geo = pageGeometry(doc);
    return {
        width: geo.width / TWIP_PER_PX,
        height: geo.height / TWIP_PER_PX,
        top: geo.top / TWIP_PER_PX,
        right: geo.right / TWIP_PER_PX,
        bottom: geo.bottom / TWIP_PER_PX,
        left: geo.left / TWIP_PER_PX,
        body_height: (geo.height - geo.top - geo.bottom) / TWIP_PER_PX,
    };
}

/**
 * 采集一个块内每行文本的底部坐标（相对于块顶部）。
 *
 * paginate 只在必须拆分块时才会调用 lines()，用它决定「拆到第几行」。
 * 之前所有块都返回 [整块高]（等于声明「每块只有一行」），库就没法把段落
 * 拆到下一页，只能整块硬塞，结果页面被撑破。
 *
 * 做法：用 Range 逐字符探测行的顶坐标，遇到变化就记一条行底。
 * 只对文本节点采样，块里的图片/表格按整体一行处理。
 */
export function collect_line_bottoms(el: HTMLElement): number[] {
    const base_top = el.getBoundingClientRect().top;
    const bottoms: number[] = [];

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let prev_line_top: number | null = null;

    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.textContent ?? "";
        if (!text.trim()) {
            continue;
        }
        const range = document.createRange();
        for (let i = 0; i < text.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            if (rect.height === 0) {
                continue;
            }
            // 按 top 判断换行（同一行的字符 top 相同）
            if (prev_line_top === null || Math.abs(rect.top - prev_line_top) > 1) {
                if (prev_line_top !== null) {
                    // 上一行结束 —— 行底就是本行 top 相对块顶的位置
                    bottoms.push(rect.top - base_top);
                }
                prev_line_top = rect.top;
            }
        }
    }

    // 最后一行：用块的内容底边
    if (prev_line_top !== null) {
        bottoms.push(el.offsetHeight);
    }
    // 没测到行（图片块等）就当整块一行
    if (bottoms.length === 0) {
        bottoms.push(el.offsetHeight);
    }
    return bottoms;
}

export interface PageSlice {
    /** 本页要放的块：[块下标, 起始像素, 结束像素] */
    fragments: Array<{block: number; from: number; to: number}>;
    /** 该页对应的页码 */
    number: number;
}

/**
 * 按实测块高分页。
 *
 * @param doc        文档
 * @param block_heights 每块实测高度（px），下标 = data-wk-block
 * @param geometry   页面几何
 */
export function paginate_by_heights(
    doc: Docx,
    block_heights: number[],
    block_lines: number[][],
    geometry: PageGeometryPx,
): PageSlice[] {
    const doc_blocks = blocks(doc);
    const sections = resolveSectionLayout(doc);

    // 库要的 LayoutBlock：高度 + 所属节 + 懒加载的行底坐标（要拆行时才读）
    const layout_blocks = doc_blocks.map((_, i) => {
        const h = block_heights[i] ?? 0;
        return {
            height: h,
            section: 0,
            // 库只在需要拆分时才读这里，给实测的行底坐标
            lines: () => block_lines[i] ?? [h],
        };
    });

    const paginator_sections = sections.map(() => ({
        start: "continuous" as const,
        columns: 1,
        titlePage: false,
        vAlign: "top" as const,
        bodyHeight: () => geometry.body_height,
    }));

    const pages: LaidOutPage[] = paginate(layout_blocks, paginator_sections, {
        evenAndOddHeaders: false,
        noteSeparatorHeight: 0,
    });

    return pages.map((page) => {
        const fragments: PageSlice["fragments"] = [];
        for (const region of page.regions) {
            for (const col of region.columns) {
                for (const frag of col.fragments) {
                    if (frag.kind === "block") {
                        fragments.push({
                            block: frag.block,
                            from: 0,
                            to: block_heights[frag.block] ?? frag.height,
                        });
                    } else if (frag.kind === "slice") {
                        // 段落被拆到两页：from/to 是块内像素偏移
                        fragments.push({block: frag.block, from: frag.from, to: frag.to});
                    }
                    // rows（表格跨页）暂按整块处理，不做行级拆分
                }
            }
        }
        return {fragments, number: page.number};
    });
}
