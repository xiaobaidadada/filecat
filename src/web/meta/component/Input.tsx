import React, {useEffect, useRef, useState} from 'react';

import {MaterialIcon} from "material-icons";
import {UserAuth} from "../../../common/req/user.req";
import Awesomplete from "awesomplete";
import "awesomplete/awesomplete.css";
import {createPortal} from 'react-dom';
import {Icon} from "./Button";

export function InputTextIcon(props: {
    placeholder?: string,
    handleInputChange?: (event: string, target: any) => void,
    value?: string,
    icon: MaterialIcon,
    max_width?: string,
    handleEnterPress?: Function,
    type?: input_type,
    mobile_hidden?: boolean
}) {
    const inputRef = useRef(null);  // 创建一个 ref 引用
    const [value, setValue] = React.useState("");
    useEffect(() => {
        let v = props.value;
        if (v === undefined || v === null) {
            v = '';
        }
        inputRef.current.value = v;
        setValue(props.value || "");
    }, [props.value]);
    // 注意：不复用 id="search"（那是 header 专属搜索框，移动端会 display:none，
    // 且 id 需全局唯一），改用 class 共享视觉样式。
    // 需要移动端隐藏的调用方（如文件列表"搜索当前目录"）显式传 mobile_hidden，
    // 由 .filecat-search-box--mobile-hidden 在移动端 display:none。
    return <div className={"filecat-search-box" + (props. mobile_hidden ? " filecat-search-box--mobile-hidden" : "")}
                style={{"maxWidth": props.max_width}}>
        <div className="filecat-search-box__inner">
            <Icon icon={props.icon}/>
            <input
                type={props.type}
                ref={inputRef}  // 使用 ref 关联到 input 元素
                placeholder={value || props.placeholder}
                onChange={(event) => {
                    if (props.handleInputChange) {
                        props.handleInputChange(event.target.value, event.target);
                    }
                    setValue(event.target.value);
                }}
                onKeyPress={(event) => {
                    // 检查是否是输入法回车键（macOS下输入法按回车选中文字）
                    if (event.key === 'Process' || event.nativeEvent.isComposing) {
                        return; // 忽略输入法回车键
                    }

                    if (event.key === 'Enter') {
                        if (props.handleEnterPress) {
                            props.handleEnterPress();
                        }
                    }
                }}
            />
        </div>
    </div>
}

export type input_type =
    | 'text' | 'password' | 'checkbox' | 'radio' | 'hidden'
    | 'button' | 'submit' | 'reset' | 'image' | 'file'
    | 'email' | 'number' | 'tel' | 'url' | 'search'
    | 'color' | 'date' | 'datetime-local' | 'time'
    | 'month' | 'week' | 'range' | 'textarea';

function Input(props: {
    placeholder?: string,
    placeholderOut?: string,
    type?: input_type,
    handleInputChange?: (event: string, target: any) => void,
    value?: string,
    handlerEnter?: (v) => void,
    focus?: boolean,
    no_border?: boolean,
    left_placeholder?: string,
    right_placeholder?: string,
    disabled?: boolean,
    maxWidth?: string,
    width?: string,
    options?: (string | { label: string, value: string })[]
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = React.useState("");
    const [css, setCss] = React.useState("input input--block awesomplete");
    const [passwordVisible, setPasswordVisible] = useState(false);
    const isPassword = props.type === "password";

    // 同步外部传入的 value
    useEffect(() => {
        setValue(props.value == null ? "" : props.value);
        if (props.focus && inputRef.current) {
            inputRef.current.focus();
        }
        if (props.no_border) {
            setCss("input input--block awesomplete input--no_border");
        }
    }, [props.value, props.focus, props.no_border]);

    // 使用 Ref 绕过 useEffect 的闭包陷阱，确保永远能调用到最新的回调函数
    const handlerRef = useRef(props.handleInputChange);
    useEffect(() => {
        handlerRef.current = props.handleInputChange;
    }, [props.handleInputChange]);

    // 监听 options 变化，动态初始化或销毁 Awesomplete
    useEffect(() => {
        if (props.options != null && inputRef.current && Array.isArray(props.options)) {
            // 格式化数据
            const listData = props.options.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return {label: item.label, value: item.value};
                }
                return String(item);
            });

            const awesomplete = new Awesomplete(inputRef.current, {
                list: listData,
                minChars: 0,
                autoFirst: true,
                // 🌟 核心修改 1：重写过滤器。当输入框为空时，强制显示所有选项
                filter: (text, input) => {
                    if (input.trim() === "") {
                        return true; // 空输入时，所有条目都算匹配成功
                    }
                    // 如果不为空，则走默认的“包含”匹配逻辑（不区分大小写）
                    return Awesomplete.FILTER_CONTAINS(text, input);
                },
                // 🌟 核心修改 2：防止空状态下排序被打乱
                sort: (a, b) => {
                    if (inputRef.current?.value.trim() === "") {
                        return 0; // 保持原样输出
                    }
                    return a.label < b.label ? -1 : 1;
                }
            });

            // 点击或聚焦时自动展开下拉菜单
            const handleFocus = () => {
                awesomplete.evaluate(); // 🌟 显式调用 evaluate() 比单纯派发事件更稳定
            };

            // 选中下拉项时的逻辑
            const handleSelect = (event: any) => {
                const selectedText = event.text.label ?? event.text.value ?? event.text;
                const selectedValue = event.text.value ?? event.text;

                setValue(selectedText);

                requestAnimationFrame(() => {
                    if (inputRef.current) inputRef.current.value = selectedText;
                });

                if (handlerRef.current) {
                    handlerRef.current(selectedValue, inputRef.current);
                }
            };

            inputRef.current.addEventListener("focus", handleFocus);
            inputRef.current.addEventListener("awesomplete-selectcomplete", handleSelect);

            return () => {
                if (inputRef.current) {
                    inputRef.current.removeEventListener("focus", handleFocus);
                    inputRef.current.removeEventListener("awesomplete-selectcomplete", handleSelect);
                }
                awesomplete.destroy();
            };
        }
    }, [props.options]);

    return (
        <React.Fragment>
            {props.placeholderOut && <p>{props.placeholderOut}</p>}
            <div style={{
                display: "flex",
                alignItems: "center",
                width: props.width,
                maxWidth: props.maxWidth
            }}>
                {props.left_placeholder && (
                    <div style={{flex: "0 0 auto", marginRight: "4px"}}>
                        {props.left_placeholder}
                    </div>
                )}

                <div style={{position: "relative", flex: 1, display: "flex", alignItems: "center"}}>
                    <input
                        style={{flex: 1, minWidth: 0, paddingRight: isPassword ? "2.4em" : undefined}}
                        onClick={(event) => event.stopPropagation()}
                        disabled={!!props.disabled}
                        className={css}
                        type={isPassword && passwordVisible ? "text" : props.type}
                        placeholder={props.placeholder}
                        onChange={(event) => {
                            const val = event.target.value;
                            setValue(val);
                            if (props.handleInputChange) {
                                props.handleInputChange(val, event.target);
                            }
                        }}
                        onKeyPress={(event) => {
                            // 检查是否是输入法回车键（macOS下输入法按回车选中文字）
                            if (event.key === 'Process' || event.nativeEvent.isComposing) {
                                return; // 忽略输入法回车键
                            }

                            if (event.key === 'Enter' && props.handlerEnter) {
                                props.handlerEnter(event.currentTarget.value);
                            }
                        }}
                        value={value}
                        ref={inputRef}
                    />
                    {isPassword && (
                        <i
                            className="material-icons input-password-toggle"
                            style={{
                                position: "absolute",
                                right: "8px",
                                cursor: "pointer",
                                fontSize: "1.2em",
                                userSelect: "none",
                                lineHeight: 1,
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault(); // 防止 input 失焦
                                setPasswordVisible(!passwordVisible);
                            }}
                            onMouseUp={(e) => {
                                e.preventDefault(); // 防止 input 失焦
                            }}
                            aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                        >
                            {passwordVisible ? "visibility_off" : "visibility"}
                        </i>
                    )}
                </div>

                {props.right_placeholder && (
                    <div style={{flex: "0 0 auto", marginLeft: "4px"}}>
                        {props.right_placeholder}
                    </div>
                )}
            </div>
        </React.Fragment>
    );
}

export function InputText(props: {
    placeholder?: string,
    placeholderOut?: string,
    handleInputChange?: (value: string) => void,
    value?: any,
    handlerEnter?: (v) => void,
    no_border?: boolean,
    left_placeholder?: string,
    right_placeholder?: string
    disabled?: boolean,
    maxWidth?: string,
    width?: string,
    options?: (string | { label: string, value: string })[] // 使用了 必须每次更新state才算修改，这是为啥 ?
    type?: input_type
}) {
    return Input({
        ...props
    });
}

export function InputPassword(props: {
    placeholder?: string,
    handleInputChange?: (value: string) => void,
    handleEnterPress?: () => void,
    maxWidth?: string,
    width?: string,
    value?: any,
}) {
    return Input({
        placeholder: props.placeholder,
        type: "password",
        handleInputChange: props.handleInputChange,
        handlerEnter: props.handleEnterPress,
        maxWidth: props.maxWidth,
        width: props.width,
        value: props.value,
    });
}

export interface SelectProps {
    /**
     * 选项列表。
     * 可选 group 字段：相同 group 的选项会被归为同一组，组之间渲染分组标题与分割线
     * （用于「同一供应商的模型聚合」这类需要分组展示的场景，效果类似左侧菜单的分组）。
     */
    options: { title?: string, label?: string, value: any, color?: string, group?: string }[];
    onChange: (value: any) => void;
    defaultValue?: any,
    no_border?: boolean,
    value?: any,
    tip?: any,
    width?: string, // 自动扩容可以写 auto
    disabled?: boolean,
    /**
     * 额外外边距，用于在 Header 等「多个组件并排」的布局中与相邻元素拉开间隔。
     * 例如 "0 0 0 1em"（左侧留 1em）或 "0 1em 0 0"（右侧留 1em）。
     */
    margin?: string,
    /**
     * 精简外观：去掉触发框的内边距与背景，视觉上就是「一段可点击的文字 + 展开箭头」。
     * 用于表头筛选这类需要把「列名」本身当作触发器的场景，避免在表头里出现输入框式的外观。
     */
    bare?: boolean,
    /**
     * 触发框固定显示的文字（不随选中值变化）。
     * 典型用于表头筛选：触发框始终显示列名，选中值只影响下拉里的选中态。
     * 不传时按原逻辑显示当前选中项。
     */
    trigger_label?: string
}

// export function Select(props: SelectProps) {
//     return (
//         <div style={{
//             display: "flex",
//             alignItems: "center", // 让前置 tip 和下拉框在水平方向完美居中对齐
//             width: props.width || "100%",
//         }}>
//             {props.tip && (
//                 <p className={`input input_left`}>
//                     {props.tip}
//                 </p>
//             )}
//
//             {/* 🌟 核心：外层增加一个相对定位的容器 */}
//             <div style={{
//                 position: "relative",
//                 flex: 1,
//                 display: "flex",
//                 alignItems: "center"
//             }}>
//                 <select
//                     defaultValue={props.defaultValue}
//                     value={props.value}
//                     disabled={!!props.disabled}
//                     className={`input input--block ${props.no_border ? "input--no_border" : ""}`}
//                     onChange={(event) => props.onChange(event.target.value)}
//                     style={{
//                         // margin: 0, // 消除 input--block 默认的下边距干扰
//                         cursor: props.disabled ? "not-allowed" : "pointer"
//                     }}
//                 >
//                     {props.options.map((item, index) => {
//                         return <option key={index} value={item.value} style={{ color: item.color || '' }} >{item.title ?? item.value}</option>;
//                     })}
//                 </select>
//
//                 {/* 🌟 核心：在此处放置你的 MaterialIcon，并通过内联样式将其固定在右侧 */}
//                 <i
//                     className="material-icons"
//                     style={{
//                         position: "absolute",
//                         right: "12px",
//                         pointerEvents: "none", // 💡 穿透点击：点击图标依然能打开下拉菜单
//                         color: props.disabled ? "#9ca3af" : "#666", // 随禁用状态变灰
//                         fontSize: "18px" // 根据 UI 调整现代化的图标大小
//                     }}
//                 >
//                     expand_more {/* 或者使用 arrow_drop_down */}
//                 </i>
//             </div>
//         </div>
//     );
// }

export function Select(props: SelectProps) {
    const [open, setOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selected = props.options.find(o => o.value === (props.value ?? props.defaultValue));

    // 点击外部关闭逻辑保持不变
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // 核心修改：使用 useEffect 在 open 变化时重新计算位置
    useEffect(() => {
        if (open && triggerRef.current && dropdownRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            // 注意：此时 dropdownRef 尚带着上一次的 maxHeight，先清掉再量真实内容高度
            dropdownRef.current.style.maxHeight = "";
            const dropdownHeight = dropdownRef.current.offsetHeight;
            // 下拉列表宽度随「最宽选项」自适应（由 CSS width:max-content 撑开），
            // 但为了量出这个宽度以便做水平边界修正，先取 offsetWidth
            const dropdownWidth = dropdownRef.current.offsetWidth;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            const MARGIN = 8; // 视口边缘安全间距
            const GAP = 4;    // 下拉与触发框之间的间距

            // 计算上下方可用垂直空间（扣除安全间距）
            const spaceBelow = viewportHeight - triggerRect.bottom - MARGIN - GAP;
            const spaceAbove = triggerRect.top - MARGIN - GAP;
            // 取较大的可用空间作为列表最大高度，保证列表始终能完整显示在视口内
            const maxHeight = Math.max(spaceBelow, spaceAbove, 0);

            // 优先在下方显示；仅当下方放不下、且上方空间更大时才翻转到上方
            const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
            // 列表实际渲染高度（受 maxHeight 限制）
            const renderedHeight = Math.min(dropdownHeight, maxHeight);

            let top;
            if (showAbove) {
                top = triggerRect.top - renderedHeight - GAP; // 在上方，且保留间距
            } else {
                top = triggerRect.bottom + GAP;               // 默认在下方
            }
            // 兜底：把 top 钳制在视口内，避免因边界情况溢出屏幕
            top = Math.max(MARGIN, Math.min(top, viewportHeight - MARGIN - renderedHeight));

            // 水平方向：默认与触发框左对齐；若列表比触发框宽并超出视口右缘，则左移到不超边界的位置
            let left = triggerRect.left;
            if (left + dropdownWidth > viewportWidth - MARGIN) {
                left = Math.max(MARGIN, viewportWidth - MARGIN - dropdownWidth);
            }

            setDropdownStyle({
                position: "fixed",
                top: top,
                left: left,
                // 不设 width（交给 CSS width:max-content 由最宽选项决定）；
                // 仅设 minWidth 保证列表不窄于触发框（选中态宽度与列表宽度解耦）
                minWidth: triggerRect.width,
                maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
                // 限制最大高度，超出时可滚动（配合 CSS overflow-y:auto）
                maxHeight: maxHeight > 0 ? `${maxHeight}px` : undefined,
                zIndex: 9999,
            });
        }
    }, [open]); // 依赖 open 状态

    const handleOpen = () => {
        if (props.disabled) return;
        setOpen(!open); // 只负责开关，位置计算交给 useEffect
    };

    return (
        <div className={"select_wrapper" + (props.bare ? " select_wrapper--bare" : "")} style={{
            width: props.width || '100%',
            // 支持调用方通过 margin 在并排布局中拉开间隔
            margin: props.margin,
        }}>
            {props.tip && <span className="select_tip">{props.tip}</span>}
            <div className="select_container">
                <div
                    ref={triggerRef}
                    className={[
                        "input input--block",
                        (props.no_border || props.bare) ? "input--no_border" : "",
                        "select_trigger",
                        props.bare ? "select_trigger--bare" : "",
                        props.disabled ? "select_trigger--disabled" : "",
                    ].join(" ")}
                    onClick={handleOpen}
                >
                    <span className="select_trigger__label" style={{color: selected?.color || "inherit"}}>
                        {/* 传了 trigger_label 时触发框固定显示该文字（如表头筛选始终显示列名），否则显示选中项 */}
                        {props.trigger_label ?? (selected?.title ?? selected?.label ?? selected?.value ?? "")}
                    </span>
                    <i className={["material-icons", "select_trigger__icon", open ? "select_trigger__icon--open" : ""].join(" ")}>
                        expand_more
                    </i>
                </div>

                {open && createPortal(
                    <div ref={dropdownRef} className="select_dropdown" style={dropdownStyle}>
                        {props.options.map((item, index) => {
                            // 与上一个选项的 group 不同时，先渲染一条分组标题（含分割线）
                            const prev = index > 0 ? props.options[index - 1] : undefined;
                            const showGroup = !!item.group && item.group !== prev?.group;
                            return (
                                <React.Fragment key={index}>
                                    {showGroup && (
                                        <div className="select_group">
                                            <span className="select_group__title">{item.group}</span>
                                        </div>
                                    )}
                                    <div
                                        className={["select_option", item.value === (props.value ?? props.defaultValue) ? "select_option--selected" : ""].join(" ")}
                                        style={{color: item.color}}
                                        onClick={() => {
                                            props.onChange(item.value);
                                            setOpen(false);
                                        }}
                                    >
                                        {item.title ?? item.label ?? item.value}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}

/**
 * 通用「标签 + 控件」行组件。
 *
 * 横向（默认）：左侧固定宽度的 label，右侧自适应控件，用于"字段一行"的紧凑布局。
 * 纵向（vertical）：label 在上、控件在下并占满宽度，各字段之间左边缘天然对齐，
 * 适合控件本身就是块级内容（下拉、按钮组）或字段较多时逐条阅读的表单。
 * @param props
 */
export function InputRow(props: {
    label: string,
    label_width?: string,
    required?: boolean,
    input_max_width?: string,
    vertical?: boolean,
    children?: any
    // React 内置属性：显式声明才能让调用方直接在 <InputRow key={...}> 上使用。
    // 内联字面量类型不会自动带上 key，不写会报 TS2322。
    key?: React.Key
}) {
    const input_css: any = {flex: 1, minWidth: 0}
    if(props.input_max_width) {
        input_css['maxWidth'] = props.input_max_width;
    }
    const star = props.required && <span style={{color: 'red', marginRight: '0.15rem'}}>*</span>;

    if (props.vertical) {
        return <div style={{display: 'flex', flexDirection: 'column', gap: '0.3rem'}}>
            <label style={{whiteSpace: 'nowrap'}}>{star}{props.label}</label>
            <div style={input_css}>{props.children}</div>
        </div>
    }

    const css: any = {
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
        // width: props.width || '5.5rem',
        textAlign: 'right'
    }
    if(props.label_width) {
        css['width'] = props.label_width;
    }
    return <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
        <label style={css}>{star}{props.label}</label>
        <div style={input_css}>{props.children}</div>
    </div>
}

export function InputRadio(props: {
    value: any,
    context: any,
    onchange?: (value: string) => void,
    selected?: boolean,
    name?: string
}) {
    return <label className="input_radio_row">
        {/* ⭐ 使用 props.selected ?? false 确保绝对不为 undefined */}
        <input type="radio" checked={props.selected ?? false} name={props.name ?? "common_name"} value={props.value}
               className={"input_radio"}
               onChange={() => {
                   if (props.onchange) props.onchange(props.value)
               }}/>
        {props.context}
    </label>
}

export function InputCheckbox(props: {
    context?: any,
    onchange?: () => void,
    selected?: boolean,
    is_disable?: boolean,
}) {
    // 💡 优化掉不必要的内部 useState 与 useEffect，直接成为标准受控组件，避免不必要的渲染和警告
    return <label className="input_radio_row">
        {/* ⭐ 使用 !!props.selected 强转为布尔值，防止 undefined 潜入 */}
        <input type="checkbox" disabled={!!props.is_disable} checked={!!props.selected}
               onChange={() => {
                   if (props.onchange) {
                       props.onchange();
                   }
               }}/>
        {props.context && props.context}
    </label>
}

