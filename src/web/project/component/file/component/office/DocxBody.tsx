import React, {useCallback, useEffect, useRef} from "react";
import {
    EditorModel,
    caretAt,
    getCommand,
    positionFromDom,
    readDomSelection,
    renderDocumentHtml,
    runCommand,
} from "@office-kit/docx-editor";
import {model_to_bytes} from "./docx_util";

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
 * docx 正文渲染与就地编辑。
 *
 * 三条设计约束，决定了这里的写法：
 *
 * 1. **纸张必须是 contenteditable。** 库渲染出来的是静态 HTML，浏览器不会给
 *    非编辑元素画插入符 —— 之前「看不到光标」就是这个原因。contenteditable
 *    让浏览器接管光标、选区、双击选词、拖选，这些原生能力没必要自己实现。
 *
 * 2. **DOM 只是显示层，文档真相在模型里。** 用户输入时拦下浏览器默认行为，
 *    把 DOM 选区读成模型位置（positionFromDom / readDomSelection），执行库命令
 *    改模型，再由模型回写 DOM。绝不让浏览器直接改 DOM 内容 —— 否则改完还得
 *    反推回文档树，等于手写 DOM→OOXML 映射。
 *
 * 3. **增量更新 DOM，不整篇重渲染。** 整篇重渲染会把 contenteditable 里的
 *    光标节点一起换掉，表现为「打一个字光标就跑掉/消失」。实测模型改一个字符时
 *    整篇 HTML 只有一处差异，所以按块级 [data-wk-block] 对比出变化的块，
 *    只替换那几个块，光标所在块不受影响时选区就完全稳定。
 */
export default function DocxBody(props: Props) {
    const {model, on_change, bind_save} = props;
    const page_ref = useRef<HTMLDivElement>(null);
    // 上一次渲染出来的块 HTML，用于增量对比（下标 = data-wk-block）
    const block_cache_ref = useRef<string[]>([]);

    /**
     * 把模型里的光标位置重新映射回 DOM 并设置浏览器选区。
     *
     * 为什么需要：模型改完后我们重画了 DOM，浏览器原来的光标节点已经被换掉，
     * 选区会掉到容器上（表现就是「打一个字光标就没了」）。重画之后按模型
     * position 找回来，用户才能接着连续输入。
     */
    const restore_caret = useCallback(() => {
        const page = page_ref.current;
        const pos = model.selection?.focus;
        if (!page || !pos) {
            return;
        }
        // 定位到块 → run → 文本节点
        const block_el = page.querySelector(`[data-wk-block="${pos.block}"]`);
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

    /** 把当前模型渲染进 DOM；只替换内容变化了的块 */
    const paint = useCallback(() => {
        const page = page_ref.current;
        if (!page) {
            return;
        }
        // 记下光标当前落在哪个块上：那个块要特殊处理，否则一换节点光标就没了
        let caret_block_el: Element | null = null;
        const sel = window.getSelection();
        if (sel && sel.anchorNode && page.contains(sel.anchorNode)) {
            const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode as Element : sel.anchorNode.parentElement;
            caret_block_el = node?.closest("[data-wk-block]") ?? null;
        }

        const holder = document.createElement("div");
        holder.innerHTML = renderDocumentHtml(model.document);

        const next_blocks = Array.from(holder.children).map((el) => el.outerHTML);
        const prev_blocks = block_cache_ref.current;

        // 块数变了（增删段落）就整体替换
        if (prev_blocks.length !== next_blocks.length) {
            page.innerHTML = holder.innerHTML;
        } else {
            for (let i = 0; i < next_blocks.length; i++) {
                if (prev_blocks[i] === next_blocks[i]) {
                    continue;
                }
                const old_el = page.children[i];
                if (!old_el) {
                    continue;
                }
                if (old_el === caret_block_el) {
                    // 光标所在的块不能换节点（换了光标就丢），只更新它的文字内容
                    old_el.innerHTML = holder.children[i].innerHTML;
                } else {
                    old_el.outerHTML = next_blocks[i];
                }
            }
        }
        block_cache_ref.current = next_blocks;
    }, [model]);

    // 首次渲染 + 模型变更后增量刷新
    useEffect(() => {
        paint();
        const unsub = model.subscribe(() => {
            // 记下是否有焦点在文档里：有的话重画后要把光标还回去
            const page = page_ref.current;
            const sel = window.getSelection();
            const had_caret = !!(page && sel && sel.anchorNode && page.contains(sel.anchorNode));
            paint();
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

    /** 执行命令；返回是否真的改动过 */
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
     * 所以统一用「往选区插空串」来删：insertText 会在写入前替换掉选区，
     * 传空串就等于把选区删掉，删一个字符和多行选区都是同一个逻辑。
     *
     * 注意这里不能再去 sync DOM 选区 —— 调用方刚用 setSelection 设好了目标选区，
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
        // 有选区：直接删（此时模型选区就是用户选中的范围，不需要再同步）
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
        // 把光标前/后的一个字符扩成选区，再插空串删掉
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
        const page = page_ref.current;
        if (!page) {
            return;
        }
        const on_key = (e: KeyboardEvent) => {
            // 焦点不在本文档里就不管
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !page.contains(sel.anchorNode)) {
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
                // 其它组合键（复制粘贴、全选等）交给浏览器
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
            // 可打印字符：中文等输入法走 compositionend，这里只处理直接按键
            if (e.key.length === 1 && !e.altKey) {
                e.preventDefault();
                insert_text(e.key);
            }
        };

        // 输入法（中文/日文等）：组合结束才拿得到最终文字
        const on_composition_end = (e: CompositionEvent) => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !page.contains(sel.anchorNode)) {
                return;
            }
            if (e.data) {
                insert_text(e.data);
            }
        };

        // 粘贴：只取纯文本，走 insertText（多行会被拆成多段）
        const on_paste = (e: ClipboardEvent) => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode || !page.contains(sel.anchorNode)) {
                return;
            }
            e.preventDefault();
            const text = e.clipboardData?.getData("text/plain");
            if (text) {
                insert_text(text);
            }
        };

        page.addEventListener("keydown", on_key);
        page.addEventListener("compositionend", on_composition_end);
        page.addEventListener("paste", on_paste);
        return () => {
            page.removeEventListener("keydown", on_key);
            page.removeEventListener("compositionend", on_composition_end);
            page.removeEventListener("paste", on_paste);
        };
    }, [model, run, delete_char, insert_text]);

    return (
        <div className="docx-body">
            <div
                className="docx-body__page"
                ref={page_ref}
                // 让浏览器负责光标、选区、双击选词、拖选
                contentEditable
                suppressContentEditableWarning
            />
        </div>
    );
}
