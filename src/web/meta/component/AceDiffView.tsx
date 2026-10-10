import React, {useEffect, useMemo, useRef} from 'react';
import {ace, modest} from "./ace_setup";

/** diff 视图模式：split 左右并排 / inline 单栏行内 */
export type AceDiffMode = "split" | "inline";

interface Props {
    /** 左（旧）版本内容 */
    valueA: string;
    /** 右（新）版本内容 */
    valueB: string;
    mode?: AceDiffMode;
    /** Ace 主题名，与项目编辑器保持一致 */
    theme?: string;
    /** 用文件名推断语法高亮 */
    filename?: string;
}

/**
 * 基于 Ace 官方 ext-diff 的两版本文本对比视图。
 *
 * 为什么用它而不是自研行渲染：官方 diff 视图自带
 *   同步滚动、行号对齐、行级（增/删）与字符级差异高亮、折叠未改动区域，
 * 能力对标 JetBrains 的 diff 面板，且是 Ace 自带、无需新依赖。
 *
 * ext-diff 的几个非直观约束（决定了下面的写法）：
 *   1. 区域差异由 onInput() 计算，而它挂在 session 的 change 事件上 ——
 *      setValue 发生在监听绑定之前，因此创建后必须手工调一次 onInput()；
 *   2. 差异算完前 align 拿不到行数，容器高度会算成 0，需在 onInput 之后 resize；
 *   3. init() 已在构造过程中执行，不能再手工调用；
 *   4. 挂载点 container 只在构造函数里接收，且 createDiffView 不透传它：
 *        - InlineDiffView(diffModel, container) 可直接接收
 *        - SplitDiffView 构造签名没有 container，只能创建后把两个 editor 手动挂上
 */
export default function AceDiffView({valueA, valueB, mode = "split", theme, filename}: Props) {
    const box_ref = useRef<HTMLDivElement>(null);
    const view_ref = useRef<any>(null);
    // 由文件名推出的 Ace 语法 mode
    const ace_mode = useMemo(
        () => filename ? (modest.getModeForPath(filename).mode || "ace/mode/text") : "ace/mode/text",
        [filename]
    );

    useEffect(() => {
        const box = box_ref.current;
        if (!box) return;
        // ext-diff 挂在 ace 的模块系统里，通过 require 取到其视图类与 diff 提供者
        const mod = (ace as any).require("ace/ext/diff");
        const model = {
            valueA: valueA ?? "",
            valueB: valueB ?? "",
            diffProvider: new mod.DiffProvider(),
        };
        const is_inline = mode === "inline";
        const view = is_inline
            ? new mod.InlineDiffView({...model, inline: "a"}, box)
            : new mod.SplitDiffView(model);
        if (!is_inline) {
            // Split 视图构造时不接收容器，需要在此把两个编辑器挂到组件容器上
            view.container = box;
            box.appendChild(view.editorA.container);
            box.appendChild(view.editorB.container);
        }
        // 主题与语法高亮在视图就绪后一次性设置
        if (theme) view.setTheme(theme);
        view.editorA?.session.setMode(ace_mode);
        view.editorB?.session.setMode(ace_mode);
        // 手工补一次差异计算（见顶部约束 1、2），再按算好的行数重排并让 Ace 重新量尺寸
        view.onInput();
        view.foldUnchanged();
        // align 内部含异步步骤，下一帧再量一次尺寸，避免拿到 0 高度
        const raf = requestAnimationFrame(() => {
            view.editorA?.resize(true);
            view.editorB?.resize(true);
        });
        view_ref.current = view;
        return () => {
            cancelAnimationFrame(raf);
            try {
                view.destroy();
            } catch (e) { /* 视图尚未初始化完成，无需处理 */ }
            view_ref.current = null;
            box.innerHTML = "";
        };
    }, [valueA, valueB, mode, theme, ace_mode]);

    return <div className="ace-diff" ref={box_ref}/>;
}
