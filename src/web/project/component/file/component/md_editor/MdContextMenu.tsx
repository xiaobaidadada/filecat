import React, {useCallback, useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {EditorView} from "prosemirror-view";
import {FileMenuItem, OverlayTransparent} from "../../../../../meta/component/Dashboard";
import {toggle_mark, toggle_bullet_list, toggle_ordered_list, toggle_blockquote, set_block_type} from "./keymap";
import {
    addColumnAfter,
    addColumnBefore,
    addRowAfter,
    addRowBefore,
    deleteColumn,
    deleteRow,
    deleteTable,
    isInTable,
    mergeCells,
    splitCell,
    toggleHeaderRow,
} from "prosemirror-tables";

// 编辑器正文的右键菜单。
//
// 复用项目已有的 FileMenuItem（与文件列表右键菜单同一套外观与边界修正逻辑），
// 因此这里只负责：拦截 contextmenu、组织菜单项、把命令作用到编辑器。

interface Props {
    get_view: () => EditorView | null;
    /** 在光标处插入一张表格 */
    on_insert_table?: () => void;
}

// 菜单项标识
const MENU = {
    cut: "cut",
    copy: "copy",
    paste: "paste",
    strong: "strong",
    em: "em",
    strike: "strike",
    code: "code",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    paragraph: "paragraph",
    bullet: "bullet",
    ordered: "ordered",
    quote: "quote",
    code_block: "code_block",
    clean: "clean",
    row_before: "row_before",
    row_after: "row_after",
    row_delete: "row_delete",
    col_before: "col_before",
    col_after: "col_after",
    col_delete: "col_delete",
    header_toggle: "header_toggle",
    cell_merge: "cell_merge",
    cell_split: "cell_split",
    table_delete: "table_delete",
    table_insert: "table_insert",
    select_all: "select_all",
} as const;

export default function MdContextMenu(props: Props) {
    const {t} = useTranslation();
    const [menu, set_menu] = useState<{x: number, y: number, in_table: boolean} | null>(null);
    // get_view 常是内联箭头函数（每次渲染引用都变），用 ref 存住避免 effect 反复重建监听
    const get_view_ref = useRef(props.get_view);
    get_view_ref.current = props.get_view;

    // 拦截编辑区的右键。
    // 注意：不能依赖 props.get_view() 在挂载时就可用 —— 首次 effect 执行时编辑器可能尚未创建，
    // 那样监听就永远绑不上（曾导致表格子菜单不出现）。改为用事件委托挂在 document 上，
    // 通过编辑器内容的 class 判断事件是否发生在编辑区内；命令执行时再实时取 view。
    useEffect(() => {
        const on_context = (e: MouseEvent) => {
            const view = get_view_ref.current();
            if (!view) {
                return;
            }
            const target = e.target as HTMLElement | null;
            // 只处理编辑器正文内的右键，其它区域交给浏览器默认行为
            if (!target || !target.closest(".md-filecat-content")) {
                return;
            }
            e.preventDefault();
            // 右键位置若不在当前选区内，先把光标移过去，保证命令作用于用户所点的内容
            const pos = view.posAtCoords({left: e.clientX, top: e.clientY});
            if (pos) {
                const sel = view.state.selection;
                if (pos.pos < sel.from || pos.pos > sel.to) {
                    const {TextSelection} = view.state.selection.constructor;
                    try {
                        view.dispatch(view.state.tr.setSelection(
                            TextSelection.near(view.state.doc.resolve(pos.pos))
                        ));
                    } catch {
                        // 定位失败（如点到原子节点边界）时忽略，菜单照常弹出
                    }
                }
            }
            // 是否在表格内：优先看 DOM —— 事件目标是单元格就说明用户在表格里操作。
            // 不能只靠 isInTable(view.state)：posAtCoords 在某些布局下会算偏，
            // 导致光标没落到单元格而判断失败（曾出现子菜单不显示）。
            const in_cell_dom = !!target.closest("td, th");
            set_menu({
                x: e.clientX,
                y: e.clientY,
                in_table: in_cell_dom || isInTable(view.state),
            });
        };
        // 用捕获阶段，避免被编辑器内部的处理拦截
        document.addEventListener("contextmenu", on_context, true);
        return () => document.removeEventListener("contextmenu", on_context, true);
    }, []);

    const close = () => set_menu(null);

    /** 执行编辑器命令 */
    const run = useCallback((cmd: (state: any, dispatch?: any) => boolean) => {
        const view = get_view_ref.current();
        if (!view) {
            return;
        }
        cmd(view.state, view.dispatch);
        view.focus();
        close();
    }, []);

    // 剪贴板操作走浏览器的 document.execCommand（保持与系统剪贴板一致的行为）
    const exec = (command: string) => {
        const view = get_view_ref.current();
        view?.focus();
        document.execCommand(command);
        close();
    };

    if (!menu) {
        return null;
    }

    // 表格相关项仅在光标位于表格内时出现（与 Typora 一致：表格操作走右键菜单）
    const table_items = menu.in_table ? [
        {r: t("上方插入行"), v: MENU.row_before},
        {r: t("下方插入行"), v: MENU.row_after},
        {r: t("左侧插入列"), v: MENU.col_before},
        {r: t("右侧插入列"), v: MENU.col_after},
        {r: t("删除行"), v: MENU.row_delete},
        {r: t("删除列"), v: MENU.col_delete},
        {r: t("切换表头行"), v: MENU.header_toggle},
        {r: t("合并单元格"), v: MENU.cell_merge},
        {r: t("拆分单元格"), v: MENU.cell_split},
        {r: t("删除表格"), v: MENU.table_delete},
    ] : [];

    const items = [
        {r: t("剪切"), v: MENU.cut},
        {r: t("复制"), v: MENU.copy},
        {r: t("粘贴"), v: MENU.paste},
        {
            r: t("格式"), v: "format", items: [
                {r: t("加粗"), v: MENU.strong},
                {r: t("斜体"), v: MENU.em},
                {r: t("删除线"), v: MENU.strike},
                {r: t("行内代码"), v: MENU.code},
            ]
        },
        {
            r: t("段落"), v: "block", items: [
                {r: t("一级标题"), v: MENU.h1},
                {r: t("二级标题"), v: MENU.h2},
                {r: t("三级标题"), v: MENU.h3},
                {r: t("正文"), v: MENU.paragraph},
            ]
        },
        {
            r: t("插入"), v: "insert", items: [
                {r: t("无序列表"), v: MENU.bullet},
                {r: t("有序列表"), v: MENU.ordered},
                {r: t("引用"), v: MENU.quote},
                {r: t("代码块"), v: MENU.code_block},
                {r: t("插入表格"), v: MENU.table_insert},
            ]
        },
        ...(table_items.length ? [{r: t("表格"), v: "table", items: table_items}] : []),
        {r: t("清除格式"), v: MENU.clean},
        {r: t("全选"), v: MENU.select_all},
    ];

    const onclick = (v: string) => {
        switch (v) {
            case MENU.cut:
                return exec("cut");
            case MENU.copy:
                return exec("copy");
            case MENU.paste:
                return exec("paste");
            case MENU.strong:
                return run(toggle_mark("strong"));
            case MENU.em:
                return run(toggle_mark("em"));
            case MENU.strike:
                return run(toggle_mark("strike"));
            case MENU.code:
                return run(toggle_mark("code"));
            case MENU.h1:
                return run(set_block_type("heading", {level: 1}));
            case MENU.h2:
                return run(set_block_type("heading", {level: 2}));
            case MENU.h3:
                return run(set_block_type("heading", {level: 3}));
            case MENU.paragraph:
                return run(set_block_type("paragraph"));
            case MENU.bullet:
                return run(toggle_bullet_list);
            case MENU.ordered:
                return run(toggle_ordered_list);
            case MENU.quote:
                return run(toggle_blockquote);
            case MENU.code_block:
                return run(set_block_type("code_block"));
            case MENU.table_insert:
                close();
                props.on_insert_table?.();
                return;
            case MENU.row_before:
                return run(addRowBefore);
            case MENU.row_after:
                return run(addRowAfter);
            case MENU.col_before:
                return run(addColumnBefore);
            case MENU.col_after:
                return run(addColumnAfter);
            case MENU.row_delete:
                return run(deleteRow);
            case MENU.col_delete:
                return run(deleteColumn);
            case MENU.header_toggle:
                return run(toggleHeaderRow);
            case MENU.cell_merge:
                return run(mergeCells);
            case MENU.cell_split:
                return run(splitCell);
            case MENU.table_delete:
                return run(deleteTable);
            case MENU.clean:
                return run((state: any, dispatch?: any) => {
                    // 清除选区内的所有行内标记
                    const {from, to} = state.selection;
                    let tr = state.tr;
                    state.doc.nodesBetween(from, to, (node: any, pos: number) => {
                        if (node.isText) {
                            for (const mark of node.marks) {
                                tr = tr.removeMark(pos, pos + node.nodeSize, mark.type);
                            }
                        }
                    });
                    dispatch?.(tr);
                    return true;
                });
            case MENU.select_all:
                return run((state: any, dispatch?: any) => {
                    // 用 TextSelection 覆盖整篇文档即可实现全选
                    const {TextSelection} = state.selection.constructor;
                    dispatch?.(state.tr.setSelection(
                        TextSelection.create(state.doc, 0, state.doc.content.size)
                    ));
                    return true;
                });
        }
    };

    return (
        <>
            <OverlayTransparent click={close}/>
            <FileMenuItem x={menu.x} y={menu.y} items={items} click={onclick}/>
        </>
    );
}
