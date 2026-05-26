import React, {useEffect, useRef, useState} from 'react';

import {MaterialIcon} from "material-icons";
import {UserAuth} from "../../../common/req/user.req";
import Awesomplete from "awesomplete";
import "awesomplete/awesomplete.css";

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
            <i className="material-icons">{props.icon}</i>
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
        if (props.options != null && inputRef.current) {
            // 格式化数据：Awesomplete 接受标准 [{label: 'xx', value: 'yy'}] 或 ['字符串']
            const listData = props.options.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return { label: item.label, value: item.value };
                }
                return String(item);
            });

            const awesomplete = new Awesomplete(inputRef.current, {
                list: listData,
                minChars: 0,
                autoFirst: true
            });

            // 点击时自动展开下拉菜单，不再粗暴清空输入框
            const handleFocus = () => {
                // 触发原生 input 事件，让 Awesomplete 弹出菜单
                inputRef.current?.dispatchEvent(new Event("input"));
            };

            // 选中下拉项时的逻辑
            const handleSelect = (event: any) => {
                // event.text 对象包含了选中的项
                const selectedText = event.text.label ?? event.text.value ?? event.text;
                const selectedValue = event.text.value ?? event.text;

                // 1. 先更新 React 内部的状态
                setValue(selectedText);

                // 2. 强行在下一帧更正 DOM 的 value，防止 Awesomplete 乱填
                requestAnimationFrame(() => {
                    if (inputRef.current) inputRef.current.value = selectedText;
                });

                // 3. 触发父组件的 onChange 回调，传入真实 Value
                if (handlerRef.current) {
                    handlerRef.current(selectedValue, inputRef.current);
                }
            };

            inputRef.current.addEventListener("focus", handleFocus);
            inputRef.current.addEventListener("awesomplete-selectcomplete", handleSelect);

            // 清理函数：当 options 改变或组件销毁时，彻底移除残留的 DOM 监听和 wrapper
            return () => {
                if (inputRef.current) {
                    inputRef.current.removeEventListener("focus", handleFocus);
                    inputRef.current.removeEventListener("awesomplete-selectcomplete", handleSelect);
                }
                awesomplete.destroy();
            };
        }
    }, [props.options]); // ⭐ 关键：把 props.options 作为依赖项！

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
    options: { title: string, value: any }[];
    onChange: (value: string) => void;
    defaultValue?: any,
    no_border?: boolean,
    value?: any,
    tip?: any,
    width?: string,
    disabled?: boolean
}

export function Select(props: SelectProps) {

    return <div style={{
        display: "flex",
    }}>
        {props.tip &&
            <p className={`input input_left `}>
                {props.tip}
            </p>
        }
        <select defaultValue={props.defaultValue} value={props.value}
                style={{
                    width: props.width,
                }}
                disabled={!!props.disabled}
                className={`input input--block  ${props.no_border ? "input--no_border" : ""}`}
                onChange={(event) => props.onChange(event.target.value)}>
            {props.options.map((item, index) => {
                return <option key={index} value={item.value}>{item.title}</option>;
            })}
        </select>
    </div>
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

