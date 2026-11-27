import React, {useCallback, useEffect, useRef} from "react";
import {
    EditorModel,
    caretAt,
    getCommand,
    readDomSelection,
    renderDocumentHtml,
    runCommand,
} from "@office-kit/docx-editor";
import {model_to_bytes} from "./docx_util";
import {PageGeometryPx, PageSlice, collect_line_bottoms, paginate_by_heights, read_page_geometry} from "./docx_paginate";

/**
 * 按 id 取命令。
 *
 * 包的 index 只导出了命令的类型声明，运行时那些具名常量是 undefined，
 * 命令必须靠 getCommand(id) 取（或者从 ALL_COMMANDS 里筛）。
 */
function cmd(id: string) {
    const c = getCommand(id);
    if (!c) {
        throw new Error(`docx 命令不存在: ${id}`);
    }
    return c;
}

interface Props {
    /** 编辑模型（openEditor 得到的实例） */
    model: EditorModel;
    /** 内容有变化时通知外部（脏标记） */
    on_change?: (dirty: boolean) => void;
    /** 把「导出字节」的函数交给外部，保存时调用 */
    bind_save?: (fn: () => Uint8Array) => void;
}

/**
 * docx 正文渲染、真分页与就地编辑。
 *
 * 四条设计约束：
 *
 * 1. **纸张必须是 contenteditable。** 库渲染出来的是静态 HTML，浏览器不会给
 *    非编辑元素画插入符。contenteditable 让浏览器接管光标、选区、双击选词、拖选。
 *
 * 2. **DOM 只是显示层，文档真相在模型里。** 用户输入时拦下浏览器默认行为，
 *    把 DOM 选区读成模型位置，执行库命令改模型，再由模型回写 DOM。
 *
 * 3. **增量更新 DOM。** 整篇重渲染会把 contenteditable 里的光标节点换掉，
 *    表现为「打一个字光标就没了」。按块对比，只替换变化的块。
 *
 * 4. **分页靠实测块高。** 先把整篇渲染出来量每块高度，喂给库的 paginate，
 *    再按结果把块搬进各页容器。估算行高会累积误差，越往后偏得越离谱。
 *
 * 分页与编辑的关系：内容一变就重算分页。重算时先量当前所有块高（此时块还在
 * 原来的页里，高度是准的），再按新分页重新分配 —— 不整篇重建 DOM，
 * 只移动需要换页的那几个块，光标所在块通常原地不动。
 */
export default function DocxBody(props: Props) {
    const {model, on_change, bind_save} = props;
    // 临时测量容器 + 实际分页容器
    const host_ref = useRef<HTMLDivElement>(null);
    // 上一次渲染出来的块 HTML，用于增量对比（下标 = data-wk-block）
    const block_cache_ref = useRef<string[]>([]);
    // 页面几何（来自 docx 的 sectPr），首次量测后固定
    const geo_ref = useRef<PageGeometryPx>();
    // 每个块 id 对应的 DOM 元素，分页时在页之间搬来搬去
    const block_els_ref = useRef<Map<number, HTMLElement>>(new Map());
    // 上一次的分页结果，用于判断是否需要重新分配
    const layout_key_ref = useRef("");

    /**
     * 把模型里的光标位置重新映射回 DOM 并设置浏览器选区。
     *
     * 模型改完后我们重画了 DOM，浏览器原来的光标节点已经被换掉，选区会掉到
     * 容器上（表现就是「打一个字光标就没了」）。重画之后按模型 position 找回来。
     */
    const restore_caret = useCallback(() => {
        const host = host_ref.current;
        const pos = model.selection?.focus;
        if (!host || !pos) {
            return;
        }
        const block_el = host.querySelector(`[data-wk-block="${pos.block}"]`);
        if (!block_el) {
            return;
        }
        let anchor: Element = block_el;
        if (pos.inline !== undefined) {
            const inline_el = block_el.querySelector(`[data-wk-inline="${pos.inline}"]`);
            if (inline_el) {
                anchor = inline_el;
            }
        }
        const text_node = anchor.firstChild;
        if (!text_node) {
            return;
        }
        const range = document.createRange();
        const offset = Math.min(pos.offset ?? 0, text_node.textContent?.length ?? 0);
        range.setStart(text_node, offset);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, [model]);

    /**
     * 渲染正文并重新分页。
     *
     * @param force_full 结构变化（增删块）时整体重建，否则按块增量更新
     */
    const paint = useCallback((force_full = false) => {
        const host = host_ref.current;
        if (!host) {
            return;
        }

        // 记下光标落在哪个块，替换时避开它
        let caret_block = -1;
        const sel = window.getSelection();
        if (sel && sel.anchorNode && host.contains(sel.anchorNode)) {
            const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode as Element : sel.anchorNode.parentElement;
            const el = node?.closest("[data-wk-block]");
            if (el) {
                caret_block = Number(el.getAttribute("data-wk-block"));
            }
        }

        // 1. 生成最新块 HTML
        const holder = document.createElement("div");
        holder.innerHTML = renderDocumentHtml(model.document);
        const next_blocks = Array.from(holder.children).map((el) => el.outerHTML);
        const prev_blocks = block_cache_ref.current;

        // 2. 结构变了或者首次渲染：整体重建
        const structure_changed = force_full || prev_blocks.length !== next_blocks.length;
        if (structure_changed) {
            host.innerHTML = holder.innerHTML;
            block_els_ref.current.clear();
            Array.from(host.children).forEach((node) => {
                const el = node as HTMLElement;
                const id = Number(el.getAttribute("data-wk-block"));
                if (!Number.isNaN(id)) {
                    block_els_ref.current.set(id, el);
                }
            });
        } else {
            // 3. 只改动内容变了的块（光标所在块原地改文字，不换节点）。
            //
            // 这里绝不能写 old_el.outerHTML = ... ：此刻 host 里是分页后的结构，
            // 块可能被包在 .docx-page__slice 里，outerHTML 赋值会就地换节点，
            // 块逐层套进自己内部（实测块全变成 <p> 套 <p>），页面看起来就空了。
            //
            // 分页只管「块放在哪一页」，块本身的内容直接同步 innerHTML 即可，
            // 位置由后面的 apply_pages 重新分配。
            for (let i = 0; i < next_blocks.length; i++) {
                if (prev_blocks[i] === next_blocks[i]) {
                    continue;
                }
                const old_el = block_els_ref.current.get(i);
                if (!old_el) {
                    continue;
                }
                old_el.innerHTML = holder.children[i].innerHTML;
            }
        }
        block_cache_ref.current = next_blocks;

        // 4. 重新分页。
        //
        // 量高之前必须先让块处在「和最终显示一样宽」的容器里 —— 块宽直接决定
        // 折行数量，进而决定高度。如果块还散在没有页宽约束的容器里，宽度会
        // 远大于纸张正文宽，量出来的高偏小，分页就会往一页里塞进过多内容，
        // 结果纸张被撑破（实测会变成 1400~1500px 而 A4 只有 1123px）。
        geo_ref.current ??= read_page_geometry(model.document);
        const geo = geo_ref.current;
        const {heights, lines} = measure_heights(next_blocks.length, geo);
        const pages = paginate_by_heights(model.document, heights, lines, geo);
        apply_pages(host, pages, geo);
    }, [model]);

    /**
     * 量出每块在纸张正文宽度下的真实高度。
     *
     * 关键：必须先把块临时收进一个「宽度 = 纸张正文宽」的容器里再量。
     * 块宽决定折行数，折行数决定高度；宽度不对，量出来的高度就全错
     * （实测会在没有页宽约束时把 A4 的一页撑到 1400px 以上）。
     *
     * 量完把容器移除。块节点本身始终留在 block_els_ref 里，由 apply_pages
     * 搬去各页 —— 节点不重建，光标就不会因为分页而丢。
     */
    const measure_heights = useCallback((
        total: number,
        geo: PageGeometryPx,
    ): { heights: number[]; lines: number[][] } => {
        const ruler = document.createElement("div");
        ruler.className = "docx-page";
        ruler.style.cssText = [
            `width:${geo.width}px`,
            `padding:${geo.top}px ${geo.right}px ${geo.bottom}px ${geo.left}px`,
            "position:absolute",
            "left:-99999px",
            "top:0",
            "visibility:hidden",
            "pointer-events:none",
        ].join(";");
        const ruler_body = document.createElement("div");
        ruler_body.className = "docx-page__body";
        ruler.appendChild(ruler_body);
        document.body.appendChild(ruler);

        // 量每块的「实际占用高度」。
        //
        // 不能用 offsetHeight / getBoundingClientRect().height —— 都不含 margin，
        // 而 docx 段落普遍带段前段后间距（实测标题 mt 22.67 / mb 22）。
        //
        // 这里用相邻块的 offsetTop 差值来量：某一块的占用 = 下一块的顶部 - 本块顶部。
        // 这样浏览器已经把 margin 折叠算完了，我们直接拿结果，不用自己推导
        // 折叠规则（首块上边距、末块下边距这些边界情况也一并绕过）。
        // 最后一块没有「下一块」，就用容器 scrollHeight - 它的 offsetTop。
        const els: HTMLElement[] = [];
        for (let i = 0; i < total; i++) {
            const el = block_els_ref.current.get(i);
            if (!el) {
                const filler = document.createElement("div");
                ruler_body.appendChild(filler);
                els.push(filler);
                continue;
            }
            ruler_body.appendChild(el);
            els.push(el);
        }

        // 量每块「从本块顶部到下一块顶部」的距离 = 块高 + 折叠后的段距。
        //
        // 为什么是这么量：把块摆到页面上时，浏览器就是按这个距离往下排的
        // （margin 折叠、首块上边距与容器折叠，全由浏览器算好）。
        // 我们直接拿这个结果，分页算出来的高度就和真实渲染一模一样。
        //
        // 首块的 margin-top 会和容器上边距折叠掉，所以它的起点就是容器顶部；
        // 末块的 margin-bottom 会溢出容器，不计入 —— 但摆到页面上时它仍占位，
        // 所以单独补回来。
        const heights: number[] = [];
        const line_tops: number[][] = [];
        const flow_h = ruler_body.scrollHeight;
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const top = el.offsetTop;
            const next_top = i + 1 < els.length ? els[i + 1].offsetTop : flow_h;
            let h = Math.max(0, next_top - top);
            if (i === els.length - 1) {
                h += parseFloat(getComputedStyle(el).marginBottom) || 0;
            }
            heights[i] = h;
            line_tops[i] = collect_line_bottoms(el);
        }
        ruler.remove();

        return {heights, lines: line_tops};
    }, []);

    /**
     * 按分页结果把块搬进各页。
     *
     * 块元素在 Map 里复用，不重新创建 —— 节点不换，光标就不会丢。
     */
    const apply_pages = useCallback((
        host: HTMLDivElement,
        pages: PageSlice[],
        geo: PageGeometryPx,
    ) => {
        // 注意：这里不能按「分页签名没变」就提前 return。
        // measure_heights 为了量高会把块 appendChild 进临时量测容器，
        // 量完容器被移除，块也跟着脱离文档 —— 每次 paint 进来时块都是悬空的。
        // 一旦提前 return，页面就只剩空壳（实测整页内容消失）。
        // 所以每次都必须重新分发，位置对不上才跳过。
        const key = pages.map((p) => p.fragments.map((f) => f.block).join(",")).join("|");
        layout_key_ref.current = key;

        host.innerHTML = "";

        // 逐页建容器
        for (const page of pages) {
            const page_el = document.createElement("div");
            page_el.className = "docx-page";
            page_el.style.width = `${geo.width}px`;
            // 用固定 height 而不是 minHeight：minHeight 会被内容撑开，
            // 分页算法差几像素时纸张就会变得比 A4 高。固定高度 + overflow
            // hidden 保证每页永远是一样的尺寸。
            page_el.style.height = `${geo.height}px`;
            page_el.style.padding = `${geo.top}px ${geo.right}px ${geo.bottom}px ${geo.left}px`;

            const body_el = document.createElement("div");
            body_el.className = "docx-page__body";
            page_el.appendChild(body_el);

            // 页脚页码
            const num_el = document.createElement("div");
            num_el.className = "docx-page__number";
            num_el.textContent = String(page.number);
            page_el.appendChild(num_el);

            for (const f of page.fragments) {
                const el = block_els_ref.current.get(f.block);
                if (!el) {
                    continue;
                }
                if (f.from === 0 && f.to >= el.offsetHeight - 1) {
                    // 整块落在本页：直接搬
                    body_el.appendChild(el);
                    continue;
                }
                // 跨页块：按像素区间裁剪。
                //
                // 分页算法给出的是 [from, to) 像素区间（同一块的上一段留在前一页，
                // 这一段落在本页）。DOM 里只有一个完整元素，所以用负 margin 把
                // 上方已经画过的部分顶出去，再用 overflow 裁掉下方不属于本页的。
                // 不裁剪的话整块 131px 会被塞进只剩 35px 的位置，页面直接被撑破。
                const holder = document.createElement("div");
                holder.className = "docx-page__slice";
                holder.style.height = `${f.to - f.from}px`;
                holder.style.overflow = "hidden";
                const inner = el.cloneNode(true) as HTMLElement;
                inner.style.marginTop = `${-f.from}px`;
                holder.appendChild(inner);
                body_el.appendChild(holder);
            }
            host.appendChild(page_el);
        }

        // 每页内容都让浏览器可编辑
        host.querySelectorAll(".docx-page__body").forEach((el) => {
            el.setAttribute("contenteditable", "true");
            el.setAttribute("suppresscontenteditablewarning", "true");
        });
    }, []);

    // 首次渲染 + 模型变更后刷新
    useEffect(() => {
        paint(true);
        const unsub = model.subscribe(() => {
            const host = host_ref.current;
            const sel = window.getSelection();
            const had_caret = !!(host && sel && sel.anchorNode && host.contains(sel.anchorNode));
            // 块数变化就要整体重建，否则增量更新
            paint(false);
            if (had_caret) {
                restore_caret();
            }
            on_change?.(true);
        });
        return () => {
            unsub();
        };
    }, [model, paint, restore_caret, on_change]);

    // 把导出字节的能力交给外层（保存按钮）
    useEffect(() => {
        bind_save?.(() => model_to_bytes(model));
    }, [model, bind_save]);

    /**
     * 把浏览器选区写进模型。
     * 命令都是按模型选区生效的，所以每次执行命令前都要先同步。
     */
    const sync_selection = useCallback(() => {
        const next = readDomSelection(document);
        if (!next) {
            return false;
        }
        const cur = model.selection;
        if (cur && JSON.stringify(cur.anchor) === JSON.stringify(next.anchor)
            && JSON.stringify(cur.focus) === JSON.stringify(next.focus)) {
            return true;
        }
        model.setSelection(next);
        return true;
    }, [model]);

    /** 执行命令 */
    const run = useCallback((id: string, params?: any) => {
        sync_selection();
        runCommand(model, cmd(id) as any, params as any);
    }, [model, sync_selection]);

    /**
     * 删除当前模型选区里的内容。
     *
     * 库里没有「删一个字符」的命令：
     *  - structure.deleteSelection 只在有选区时生效，光标折叠时直接 return，
     *    而且它根本不在 ALL_COMMANDS 里，getCommand 拿不到；
     *  - structure.mergeBack 是段首并到上一段（删整段结构）。
     * 所以统一用「往选区插空串」来删：insertText 会在写入前替换掉选区。
     *
     * 这里不能再去 sync DOM 选区 —— 调用方刚用 setSelection 设好了目标选区，
     * 再读一次 DOM 会把刚设的覆盖回光标原位置，等于没删。
     */
    const delete_selection = useCallback(() => {
        runCommand(model, cmd("structure.insertText") as any, {text: ""} as any);
    }, [model]);

    /** 退格 / Delete：光标折叠时先扩成一个字符的选区，再走删除 */
    const delete_char = useCallback((backward: boolean) => {
        if (!sync_selection()) {
            return;
        }
        const sel = model.selection;
        if (!sel) {
            return;
        }
        const {anchor, focus} = sel;
        if (anchor.block !== focus.block || anchor.inline !== focus.inline || anchor.offset !== focus.offset) {
            delete_selection();
            return;
        }
        const offset = anchor.offset;
        if (backward && offset <= 0) {
            // 段首退格 = 并到上一段
            runCommand(model, cmd("structure.mergeBack") as any, undefined as any);
            return;
        }
        const from = backward ? offset - 1 : offset;
        const to = backward ? offset : offset + 1;
        const target = {block: anchor.block, para: anchor.para, cell: anchor.cell, inline: anchor.inline};
        model.setSelection({
            anchor: caretAt({...target, offset: from}).anchor,
            focus: caretAt({...target, offset: to}).anchor,
        });
        delete_selection();
    }, [model, sync_selection, delete_selection]);

    /** 输入文字 */
    const insert_text = useCallback((text: string) => {
        sync_selection();
        runCommand(model, cmd("structure.insertText") as any, {text} as any);
    }, [model, sync_selection]);

    // 键盘：拦下浏览器默认编辑行为，转成模型命令
    useEffect(() => {
        const host = host_ref.current;
        if (!host) {
            return;
        }
        const on_key = (e: KeyboardEvent) => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !host.contains(sel.anchorNode)) {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                const k = e.key.toLowerCase();
                if (!e.shiftKey && (k === "b" || k === "i" || k === "u")) {
                    e.preventDefault();
                    run(k === "b" ? "text.bold" : k === "i" ? "text.italic" : "text.underline");
                    return;
                }
                if (k === "z") {
                    e.preventDefault();
                    (e.shiftKey ? model.canRedo() : model.canUndo()) && (e.shiftKey ? model.redo() : model.undo());
                    return;
                }
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                run("structure.insertParagraph");
                return;
            }
            if (e.key === "Backspace") {
                e.preventDefault();
                delete_char(true);
                return;
            }
            if (e.key === "Delete") {
                e.preventDefault();
                delete_char(false);
                return;
            }
            if (e.key.length === 1 && !e.altKey) {
                e.preventDefault();
                insert_text(e.key);
            }
        };

        // 输入法（中文等）：组合结束才拿得到最终文字
        const on_composition_end = (e: CompositionEvent) => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !host.contains(sel.anchorNode)) {
                return;
            }
            if (e.data) {
                insert_text(e.data);
            }
        };

        // 粘贴：只取纯文本
        const on_paste = (e: ClipboardEvent) => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !host.contains(sel.anchorNode)) {
                return;
            }
            e.preventDefault();
            const text = e.clipboardData?.getData("text/plain");
            if (text) {
                insert_text(text);
            }
        };

        host.addEventListener("keydown", on_key);
        host.addEventListener("compositionend", on_composition_end);
        host.addEventListener("paste", on_paste);
        return () => {
            host.removeEventListener("keydown", on_key);
            host.removeEventListener("compositionend", on_composition_end);
            host.removeEventListener("paste", on_paste);
        };
    }, [model, run, delete_char, insert_text]);

    return (
        <div className="docx-body">
            <div className="docx-pages" ref={host_ref}/>
        </div>
    );
}
