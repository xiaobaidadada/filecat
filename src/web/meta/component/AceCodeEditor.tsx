import React, {useEffect, useImperativeHandle, useRef, forwardRef} from "react";
// 静态 mode/theme 引入 + CDN 兜底配置 + ace 命名空间：与 Ace.tsx（文件编辑器）共用同一份，
// 这样本组件也能用上那些常用语言的离线语法高亮，不会因为缺 mode 而回落到 CDN。
import {ace} from "./ace_setup";
import {useAtom} from "jotai";
import {$stroe} from "../../project/util/store";

/**
 * 通用 Ace 代码编辑器组件。
 *
 * 设计目标：把项目里「Ace 编辑器」的通用能力抽出来，供多处复用
 * （当前使用方：MD 编辑器的源码模式）。
 *
 * 与项目里另外两个 Ace 实现的区别：
 *   1. Ace.tsx（文件编辑器）  —— 内容走全局 editor_data 存取，父子间不传值，耦合 store。
 *   2. AceInput.tsx（单行输入）—— 单行、无行号、禁 Tab，定位是输入框。
 *   3. 本组件              —— 受控式：value 进、onChange(value) 出，通用编辑器定位。
 *
 * 为什么 value 只做「初始值」而不持续同步？
 *   Ace 内部有自己的文档模型与撤销栈，若每次 value 变化都 setValue，
 *   会把用户的撤销历史冲掉（表现为 Ctrl+Z 失效）。因此约定：
 *   - 初始内容用 props.value（仅首渲染生效）；
 *   - 外部要整篇替换内容时，调用 ref.setValue()，或换 React key 重挂载。
 */

/** AceCodeEditor 通过 ref 暴露的方法 */
export interface AceCodeEditorHandle {
    /** 获取当前全部内容 */
    getValue(): string;
    /** 整篇替换内容（会清空撤销栈）；auto_indent 为 true 时自动缩进 */
    setValue(val: string, auto_indent?: boolean): void;
    /** 获取原始 ace editor 实例，用于需要深入定制（如加 command）的场景 */
    getEditor(): ace.Ace.Editor | null;
    /** 获取选区起始偏移（字符索引），可用来做大纲高亮等定位 */
    getCursorOffset(): number;
    /** 设置光标到指定字符偏移（并滚动到可见区域） */
    setCursorOffset(offset: number): void;
    /** 让编辑器获得焦点 */
    focus(): void;
}

interface Props {
    /** 初始内容（仅首次渲染生效，之后不追踪变化，原因见文件头注释） */
    value?: string;
    /** ace 的 mode，形如 "markdown" / "javascript"；默认按 plain_text */
    mode?: string;
    /** 是否显示行号（默认显示，代码编辑场景更实用） */
    showLineNumbers?: boolean;
    /** 是否自动换行（默认关，代码场景靠横向滚动，避免长行折行后行号错乱） */
    wrap?: boolean;
    /** 是否只读 */
    readOnly?: boolean;
    /** 内容变化回调 */
    onChange?: (value: string) => void;
    /** 光标/选区变化回调（键盘移动、鼠标点击、输入都会触发，调用方注意节流） */
    onCursorChange?: () => void;
    /**
     * 触发保存（Ctrl/Cmd + S）。
     * 必须走 Ace 的命令系统而不是外层 DOM 监听：Ace 会给内部输入区挂 keydown
     * 并阻止冒泡，写在 document 上的监听收不到；而 Ace 命中绑定的按键后
     * 会自行 preventDefault，浏览器默认的「保存网页」对话框也就不会弹出。
     */
    onSave?: () => void;
    /** 外层 div 的 className */
    className?: string;
    /** 外层 div 的 style */
    style?: React.CSSProperties;
    /** 额外的 ace 配置，用于个别场景定制 */
    options?: Partial<ace.Ace.EditorOptions>;
}

const AceCodeEditor = forwardRef<AceCodeEditorHandle, Props>(function AceCodeEditor(
    {
        value = "",
        mode = "plain_text",
        showLineNumbers = true,
        wrap = false,
        readOnly = false,
        onChange,
        onCursorChange,
        onSave,
        className,
        style,
        options,
    },
    ref,
) {
    const container_ref = useRef<HTMLDivElement>(null);
    const editor_ref = useRef<ace.Ace.Editor | null>(null);
    // 跟项目其它 Ace 实现保持一致：跟随用户主题（深色/浅色）
    const [user_info] = useAtom($stroe.user_base_info);
    const theme = user_info.user_data.theme?.includes("dark") ? "cloud_editor_dark" : "cloud9_day";

    // 回调与配置放 ref，避免它们出现在 useEffect 依赖里导致编辑器被反复销毁重建
    const cb_ref = useRef({onChange, onCursorChange, onSave});
    cb_ref.current = {onChange, onCursorChange, onSave};

    useImperativeHandle(ref, () => ({
        getValue: () => editor_ref.current?.getValue() ?? "",
        setValue: (val: string, auto_indent = false) => {
            const ed = editor_ref.current;
            if (!ed) {
                return;
            }
            // 第二参数 -1 表示把光标送到内容末尾。
            // auto_indent 为 true 时让 ace 按当前 mode 重新缩进整个文档
            // （切回源码模式时用得上：外部文本可能缩进不规范）。
            ed.setValue(val, -1);
            if (auto_indent) {
                const session = ed.getSession();
                (session as any).indentAll?.();
            }
        },
        getEditor: () => editor_ref.current,
        getCursorOffset: () => {
            const ed = editor_ref.current;
            if (!ed) {
                return 0;
            }
            // ace 的光标是 {row, column}，这里换算成「整篇文档的字符偏移」，
            // 与 parse_markdown_headings 产出的 pos 是同一套坐标。
            return ed.session.doc.positionToIndex(ed.getCursorPosition(), 0);
        },
        setCursorOffset: (offset: number) => {
            const ed = editor_ref.current;
            if (!ed) {
                return;
            }
            const pos = ed.session.doc.indexToPosition(Math.max(0, offset), 0);
            // 注意：这里必须用 moveCursorTo 而不是 moveCursorToPosition。
            // moveCursorToPosition 只移动选区的活动端（lead），锚点（anchor）留在原处，
            // 结果就是「从旧位置到新位置」被整段选中 —— 点大纲跳转时表现为文字被选中。
            // moveCursorTo 会把锚点与活动端一起移过去并收起选区。
            ed.selection.moveCursorTo(pos.row, pos.column);
            ed.selection.clearSelection();
            // 第三个参数 false = 不把该行居中显示；第四个参数是回调
            ed.scrollToLine(pos.row, true, false, () => {});
        },
        focus: () => editor_ref.current?.focus(),
    }), []);

    useEffect(() => {
        const container = container_ref.current;
        if (!container) {
            return;
        }
        const editor = ace.edit(container, {
            value,
            mode: `ace/mode/${mode}`,
            theme: `ace/theme/${theme}`,
            showPrintMargin: false,      // 打印边距竖线没有意义
            highlightActiveLine: false,  // 当前行背景高亮在写作/看日志时比较干扰
            fontSize: 14,
            readOnly,
            showLineNumbers,
            showGutter: showLineNumbers,
            wrap,
            useWorker: false,            // 不走 web worker，纯离线环境也能正常用
            ...options,
        } as any);

        // 内容变化：回传最新全文
        editor.on("change", () => {
            cb_ref.current.onChange?.(editor.getValue());
        });
        // 光标/选区变化：用于大纲高亮等需要跟随光标的场景
        editor.selection.on("changeCursor", () => {
            cb_ref.current.onCursorChange?.();
        });

        // Ctrl/Cmd + S 保存。
        // 用 Ace 自己的命令系统注册：绑定命中后 Ace 会 preventDefault，
        // 浏览器的「另存网页」对话框不会弹出；且不受 focus 之外的因素影响。
        editor.commands.addCommand({
            name: "filecat_save",
            bindKey: {win: "Ctrl-S", mac: "Command-S"},
            exec: () => {
                cb_ref.current.onSave?.();
            },
            // 只读模式下也允许触发保存（虽然内容没变，但行为上更符合直觉）
            readOnly: true,
        });

        editor_ref.current = editor;

        return () => {
            // 销毁实例，避免 ace 的全局注册表（$id）里残留已卸载编辑器
            editor.destroy();
            editor_ref.current = null;
        };
        // 只初始化一次：value 是初始值，mode/theme 等运行期变化通过重建（换 key）或 ref 处理
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 说明：高度/宽度默认交给 className 控制（不同使用场景高度策略不同，
    // 例如输入框按内容撑开、编辑区铺满可视区域）。
    // 若调用方需要强制尺寸，通过 style 覆盖即可。
    return <div ref={container_ref} className={className} style={style}/>;
});

export default AceCodeEditor;
