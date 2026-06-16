import React, {useEffect, useRef, useState} from 'react';

import {MaterialIcon} from "material-icons";
import {UserAuth} from "../../../common/req/user.req";
import Awesomplete from "awesomplete";
import "awesomplete/awesomplete.css";
import { createPortal } from 'react-dom';
import {Icon} from "./Button";

export function InputTextIcon(props: {
    placeholder?: string,
    handleInputChange?: (event: string, target: any) => void,
    value?: string,
    icon: MaterialIcon,
    max_width?: string,
    handleEnterPress?: Function,
    not_mobile?: boolean,
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
    return <div id="search" className=""
                style={{"maxWidth": props.max_width, display: props.not_mobile ? "block" : undefined}}>
        {/*display:"block"取消移动样式下的搜索隐藏*/}
        <div id="input">
            <Icon icon={props.icon} />
            <input
                type="text"
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

function Input(props: {
    placeholder?: string,
    placeholderOut?: string,
    type?: string,
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
    options?: (string|{ label: string, value: string })[]
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = React.useState("");
    const [css, setCss] = React.useState("input input--block awesomplete");

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
        if (props.options != null && inputRef.current && Array.isArray(props.options)  ) {
            // 格式化数据
            const listData = props.options.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return { label: item.label, value: item.value };
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
                    <div style={{ flex: "0 0 auto", marginRight: "4px" }}>
                        {props.left_placeholder}
                    </div>
                )}

                <input
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={(event) => event.stopPropagation()}
                    disabled={!!props.disabled}
                    className={css}
                    type={props.type}
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

                {props.right_placeholder && (
                    <div style={{ flex: "0 0 auto", marginLeft: "4px" }}>
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
    options?: (string|{ label: string, value: string })[] // 使用了 必须每次更新state才算修改，这是为啥 ?
    type?: string
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
    options: { title?: string,label?:string, value: any,color?:string }[];
    onChange: (value: any) => void;
    defaultValue?: any,
    no_border?: boolean,
    value?: any,
    tip?: any,
    width?: string,
    disabled?: boolean
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
            const dropdownHeight = dropdownRef.current.offsetHeight;
            const viewportHeight = window.innerHeight;

            // 计算空间
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;

            let top;
            // 如果下方空间不足，且上方空间足够，则渲染在上方
            if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
                top = triggerRect.top - dropdownHeight - 4; // 在上方，且保留间距
            } else {
                top = triggerRect.bottom + 4; // 默认在下方
            }

            setDropdownStyle({
                position: "fixed",
                top: top,
                left: triggerRect.left,
                width: triggerRect.width,
                zIndex: 9999,
            });
        }
    }, [open]); // 依赖 open 状态

    const handleOpen = () => {
        if (props.disabled) return;
        setOpen(!open); // 只负责开关，位置计算交给 useEffect
    };

    return (
        <div className="select_wrapper" style={{ width: props.width || "100%" }}>
            {props.tip && <p className="input input_left">{props.tip}</p>}
            <div className="select_container">
                <div
                    ref={triggerRef}
                    className={[
                        "input input--block",
                        props.no_border ? "input--no_border" : "",
                        "select_trigger",
                        props.disabled ? "select_trigger--disabled" : "",
                    ].join(" ")}
                    onClick={handleOpen}
                >
                    <span className="select_trigger__label" style={{ color: selected?.color || "inherit" }}>
                        {selected?.title ?? selected?.value ?? ""}
                    </span>
                    <i className={["material-icons", "select_trigger__icon", open ? "select_trigger__icon--open" : ""].join(" ")}>
                        expand_more
                    </i>
                </div>

                {open && createPortal(
                    <div ref={dropdownRef} className="select_dropdown" style={dropdownStyle}>
                        {props.options.map((item, index) => (
                            <div
                                key={index}
                                className={["select_option", item.value === (props.value ?? props.defaultValue) ? "select_option--selected" : ""].join(" ")}
                                style={{ color: item.color }}
                                onClick={() => {
                                    props.onChange(item.value);
                                    setOpen(false);
                                }}
                            >
                                {item.title ?? item.label ??item.value}
                            </div>
                        ))}
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}

export function InputRadio(props: {
    value: any,
    context: any,
    onchange?: (value: string) => void,
    selected?: boolean,
    name?: string
}) {
    return <div className="input_radio_row">
        {/* ⭐ 使用 props.selected ?? false 确保绝对不为 undefined */}
        <input type="radio" checked={props.selected ?? false} name={props.name ?? "common_name"} value={props.value}
               className={"input_radio"}
               onChange={() => {
                   if (props.onchange) props.onchange(props.value)
               }}/>
        {props.context}
    </div>
}

export function InputCheckbox(props: {
    context?: any,
    onchange?: () => void,
    selected?: boolean,
    is_disable?: boolean,
}) {
    // 💡 优化掉不必要的内部 useState 与 useEffect，直接成为标准受控组件，避免不必要的渲染和警告
    return <div className="input_radio_row">
        {/* ⭐ 使用 !!props.selected 强转为布尔值，防止 undefined 潜入 */}
        <input type="checkbox" disabled={!!props.is_disable} checked={!!props.selected}
               onChange={() => {
                   if (props.onchange) {
                       props.onchange();
                   }
               }}/>
        {props.context && props.context}
    </div>
}

