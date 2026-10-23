import {RefObject, useLayoutEffect, useState} from "react";

/**
 * 浮层定位：让挂在 body 上的浮层（下拉列表、编辑面板等）始终留在视口内。
 *
 * 参考 MenuSelect 的做法：浮层先以 visibility:hidden 渲染，量到真实尺寸后
 * 再做四边修正并显示，避免"先出现在错误位置再跳过去"的闪烁。
 *
 * 处理三种情况：
 *   1. 下方空间不够 → 翻到触发器上方，并在两侧中选空间更大的一侧；
 *   2. 高度超过可用空间 → 限制最大高度，交给内容自己滚动；
 *   3. 左右越界 → 平移回视口内。
 */

/** 视口边缘的安全间距（px，仅用于计算） */
const MARGIN = 8;
/** 浮层与触发器之间的间距（px，仅用于计算） */
const GAP = 4;
/**
 * 默认高度上限（rem）。
 * 必须与 CSS 里 max-height 的兜底值保持一致，否则 JS 算出的定位高度
 * 会和 CSS 实际渲染高度不符，浮层会偏离触发器。
 */
const DEFAULT_MAX_HEIGHT_REM = 24;

export interface floating_pos {
    left: number;
    top: number;
    /** 浮层渲染高度（px），仅用于内部换算与定位 */
    height: number;
    /** 尺寸量好之前保持隐藏，避免闪烁 */
    ready: boolean;
    /**
     * 直接摊到浮层 style 上的 CSS 变量：
     *   --floating-available：视口内可用高度（px），保证浮层不溢出屏幕
     *   --floating-max-height：调用方指定的高度上限（rem），未指定时为空
     * 高度统一由 CSS 用 rem 决定，JS 不写死 px。
     */
    css_vars: Record<string, string>;
}

interface use_floating_options {
    /** 浮层是否打开 */
    active: boolean;
    /** 触发器 ref，作为定位基准 */
    trigger_ref: RefObject<HTMLElement | null>;
    /** 浮层 ref，用于测量真实尺寸 */
    floating_ref: RefObject<HTMLElement | null>;
    /** 期望宽度；不传则由内容决定 */
    width?: number;
    /**
     * 高度上限（rem）。浮层超过这个高度时内部滚动，未超过时按内容高度显示。
     * 不传则不限制高度（只做视口兜底）。
     */
    max_height?: number;
}

/** 未测量时的空状态 */
const EMPTY_POS: floating_pos = {
    left: 0,
    top: 0,
    height: 0,
    ready: false,
    css_vars: {},
};

export function use_floating(
    {
        active,
        trigger_ref,
        floating_ref,
        width,
        max_height,
    }: use_floating_options,
): floating_pos {
    const [pos, set_pos] = useState<floating_pos>(EMPTY_POS);

    useLayoutEffect(() => {
        if (!active) {
            // 关闭后重置，下次打开重新测量定位
            set_pos(prev => (prev.ready ? EMPTY_POS : prev));
            return;
        }

        const place = () => {
            const trigger = trigger_ref.current;
            const floating = floating_ref.current;
            if (!trigger) return;

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const tr = trigger.getBoundingClientRect();

            // 量浮层真实尺寸。
            // 用 scrollHeight 取内容自然高度：它不受 max-height 裁剪影响，
            // 不必清空 max-height 再量（那样会触发重排且读到旧值）。
            let fw = width ?? 0;
            let fh = 0;
            if (floating) {
                fw = width ?? floating.offsetWidth;
                fh = floating.scrollHeight;
            }

            // 生效高度 = 调用方上限（rem）与内容高度取小。
            // 未显式指定时用 CSS 的默认上限，保证 JS 与 CSS 对「浮层多高」的判断一致；
            // 否则 JS 会按内容自然高度（可能上千 px）算位置，把浮层顶到视口边缘、与触发器脱开。
            const cap_rem = max_height != null ? max_height : DEFAULT_MAX_HEIGHT_REM;
            const content_height = Math.min(fh, rem_to_px(cap_rem));

            // ---- 垂直方向：判断能否放得下，放不下就翻到上方 ----
            const space_below = vh - tr.bottom - MARGIN - GAP;
            const space_above = tr.top - MARGIN - GAP;
            // 只有在下方确实放不下、且上方更宽裕时才翻到上方
            const show_above = content_height > space_below && space_above > space_below;
            const available = Math.max(show_above ? space_above : space_below, 0);

            // 实际渲染高度再受视口剩余空间兜底，保证浮层整体可见
            const height = Math.min(content_height, available);

            let top = show_above
                ? tr.top - height - GAP
                : tr.bottom + GAP;
            // 兜底：极端情况下仍要落在视口内
            top = Math.max(MARGIN, Math.min(top, vh - MARGIN - height));

            // ---- 水平方向：越界就平移回来 ----
            let left = tr.left;
            if (left + fw > vw - MARGIN) {
                left = Math.max(MARGIN, vw - MARGIN - fw);
            }
            left = Math.max(MARGIN, left);

            // 高度上限全部通过 CSS 变量交给样式表，JS 不写 px 高度。
            // 始终输出上限（未指定时用默认值），确保 CSS 渲染高度与上面的计算一致。
            const css_vars: Record<string, string> = {
                "--floating-available": `${available}px`,
                "--floating-max-height": `${cap_rem}rem`,
            };

            set_pos({left, top, height, ready: true, css_vars});
        };

        // 打开后的第一帧先量一次；此时浮层可能刚挂载，尺寸未必稳定，
        // 再补一帧确保拿到的是最终尺寸
        place();
        const raf = requestAnimationFrame(place);

        // 页面滚动 / 视口变化时跟随重算。
        // 关键：浮层内部滚动不算「页面滚动」。
        // 原实现用捕获模式监听 window scroll，浮层里滚动也会冒到这里，
        // 每滚一下就把位置重算一遍，表现就是「滚选项时整片内容跟着乱动」。
        const on_page_scroll = (e: Event) => {
            const floating = floating_ref.current;
            const target = e.target as Node | null;
            // 事件来自浮层自身（或浮层内部元素）时忽略
            if (floating && target && (target === floating || floating.contains(target))) return;
            place();
        };
        window.addEventListener("resize", place);
        window.addEventListener("scroll", on_page_scroll, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", on_page_scroll, true);
        };
    }, [active, width, max_height]);

    return pos;
}

/** rem 转 px，与页面根字号保持一致 */
function rem_to_px(rem: number): number {
    const root_font_size = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return rem * root_font_size;
}
