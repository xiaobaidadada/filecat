import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {EditorView} from "prosemirror-view";
import {toggle_mark, toggle_bullet_list, toggle_ordered_list, toggle_blockquote, set_block_type} from "./keymap";

// 编辑器工具栏。
//
// 只在「选中了文字」时出现，跟随选区浮在选区上方（Typora 手感）：
// 格式化按钮就在手边，平时完全不占屏幕、也不会盖住正文。
// 没有选区时整条工具栏不渲染 —— 插入表格等块级操作走右键菜单。

interface Props {
    get_view: () => EditorView | null;
    /** 光标/选区变化时由编辑器通知，用于刷新按钮的选中态与浮动位置 */
    refresh_key?: number;
}

// 需要高亮的按钮状态
interface ActiveState {
    marks: string[];
    block: {name: string, level?: number};
}

// 浮动条与选区之间的间距
const GAP = 8;

export default function MdToolbar(props: Props) {
    const {t} = useTranslation();
    const bar_ref = useRef<HTMLDivElement>(null);
    const [active, set_active] = useState<ActiveState>({marks: [], block: {name: "paragraph"}});
    // 浮动位置：null 表示没有选区（整条工具栏不渲染）。
    // top/bottom/left 均为视口坐标 —— 工具栏是 position: fixed。
    const [pos, set_pos] = useState<{top: number, bottom: number, left: number} | null>(null);

    const refresh = useCallback(() => {
        const view = props.get_view();
        if (!view) {
            return;
        }
        // ---- 1. 按钮高亮状态 ----
        const sel = view.state.selection;
        const marks = view.state.storedMarks ?? sel.$from.marks();
        set_active({
            marks: marks.map(m => m.type.name),
            block: block_of(sel.$from),
        });

        // ---- 2. 浮动位置 ----
        if (sel.empty) {
            set_pos(null);
            return;
        }
        // 工具栏是 position: fixed（参照视口），所以这里算的就是视口坐标。
        // 不能用纸张做基准 —— 纸张会随内容滚走，长文档里工具栏会飘出屏幕。
        const start = view.coordsAtPos(sel.from);
        const end = view.coordsAtPos(sel.to);
        // 选区可以是多行：取覆盖范围的水平中心，纵向取首行 top 与末行 bottom
        const left_edge = Math.min(start.left, end.left);
        const right_edge = Math.max(start.right, end.right);
        const center_x = (left_edge + right_edge) / 2;
        // 多行选区时首行 top 较小、末行 bottom 较大
        const top_y = Math.min(start.top, end.top);
        const bottom_y = Math.max(start.bottom, end.bottom);

        set_pos({top: top_y, bottom: bottom_y, left: center_x});
    }, [props.get_view]);

    useEffect(() => {
        refresh();
        const view = props.get_view();
        if (!view) {
            return;
        }
        const on_update = () => refresh();
        // 选区变化：键鼠操作、以及滚动（滚动会让浮动条与选区脱节）
        view.dom.addEventListener("keyup", on_update);
        view.dom.addEventListener("mouseup", on_update);
        document.addEventListener("selectionchange", on_update);
        // 滚动时重新计算浮动条位置（fixed 定位不会自动跟着内容走）
        const scroller = view.dom.closest(".md-editor-context");
        scroller?.addEventListener("scroll", on_update, {passive: true});
        // 窗口尺寸变化时纸张右边界会变，常驻位置需要重算
        window.addEventListener("resize", on_update);
        return () => {
            view.dom.removeEventListener("keyup", on_update);
            view.dom.removeEventListener("mouseup", on_update);
            document.removeEventListener("selectionchange", on_update);
            scroller?.removeEventListener("scroll", on_update);
            window.removeEventListener("resize", on_update);
        };
    }, [refresh, props.get_view, props.refresh_key]);

    /** 执行命令并保持编辑器焦点 */
    const run = (cmd: (state: any, dispatch?: any) => boolean) => {
        const view = props.get_view();
        if (!view) {
            return;
        }
        cmd(view.state, view.dispatch);
        view.focus();
        refresh();
    };

    const is_mark = (name: string) => active.marks.includes(name);
    const is_heading = (level: number) => active.block.name === "heading" && active.block.level === level;

    // 浮动条的尺寸：渲染后由浏览器测量，用于把选区中心点换算成不越界的 left
    const [bar_size, set_bar_size] = useState({w: 0, h: 36});
    useLayoutEffect(() => {
        if (!pos || !bar_ref.current) {
            return;
        }
        const w = bar_ref.current.offsetWidth;
        const h = bar_ref.current.offsetHeight;
        set_bar_size(prev => (prev.w === w && prev.h === h ? prev : {w, h}));
    }, [pos, props.refresh_key]);

    // 没有选区就不渲染整条工具栏：不占空间、不遮挡正文。
    // 必须放在所有 hook 之后，否则违反 hooks 调用顺序。
    if (!pos) {
        return null;
    }

    const btn = (
        key: string,
        label: string,
        title: string,
        onclick: () => void,
        on = false,
    ) => (
        <button key={key}
                className={"mdtb__btn" + (on ? " mdtb__btn--on" : "")}
                title={t(title)}
                onMouseDown={e => e.preventDefault()}   /* 防止点击时编辑器失焦 */
                onClick={onclick}>
            {label}
        </button>
    );

    // 工具栏样式：贴选区上方居中；上方被顶部导航栏挡住时改放到选区下方。
    // CSS 用 translateX(-50%) 做居中，所以这里传的是选区中心点；
    // 边界夹取按中心点范围算，越界时把中心点往内推（保持工具栏完整可见）。
    const half = bar_size.w / 2;
    const min_center = half + 4;
    const max_center = Math.max(min_center, window.innerWidth - half - 4);
    // 顶部导航栏是固定定位（.header，高约 4em），工具栏不能压到它上面
    const header_bottom = document.querySelector(".header")?.getBoundingClientRect().bottom ?? 0;
    const above_top = pos.top - bar_size.h - GAP;
    // 上方空间不够就翻到选区下方
    const place_below = above_top < header_bottom + 4;
    const style: React.CSSProperties = {
        top: place_below
            ? Math.min(pos.bottom + GAP, window.innerHeight - bar_size.h - 4)
            : above_top,
        left: Math.min(max_center, Math.max(min_center, pos.left)),
    };

    return (
        <div className={"mdtb mdtb--floating" + (place_below ? " mdtb--below" : "")}
             ref={bar_ref}
             style={style}>
            {btn("h1", "H1", "一级标题", () => run(set_block_type("heading", {level: 1})), is_heading(1))}
            {btn("h2", "H2", "二级标题", () => run(set_block_type("heading", {level: 2})), is_heading(2))}
            {btn("h3", "H3", "三级标题", () => run(set_block_type("heading", {level: 3})), is_heading(3))}
            <span className={"mdtb__sep"}/>
            {btn("b", "B", "加粗", () => run(toggle_mark("strong")), is_mark("strong"))}
            {btn("i", "I", "斜体", () => run(toggle_mark("em")), is_mark("em"))}
            {btn("s", "S", "删除线", () => run(toggle_mark("strike")), is_mark("strike"))}
            {btn("code", "</>", "行内代码", () => run(toggle_mark("code")), is_mark("code"))}
            <span className={"mdtb__sep"}/>
            {btn("ul", "≔", "无序列表", () => run(toggle_bullet_list))}
            {btn("ol", "1.", "有序列表", () => run(toggle_ordered_list))}
            {btn("quote", "❝", "引用", () => run(toggle_blockquote))}
        </div>
    );
}

/** 取光标所在的块类型（标题需带级别） */
function block_of($from: any): ActiveState["block"] {
    for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (name === "heading") {
            return {name: "heading", level: $from.node(d).attrs.level};
        }
        if (name === "paragraph") {
            return {name: "paragraph"};
        }
    }
    return {name: "paragraph"};
}
