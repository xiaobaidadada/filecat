import React, {useEffect, useRef, useState} from 'react';

import {MaterialIcon} from "material-icons";
import {UserAuth} from "../../../common/req/user.req";

export function InputTextIcon(props: {
    placeholder?: string,
    handleInputChange?: (event: string, target: any) => void,
    value?: string,
    icon:MaterialIcon,
    max_width?:string,
    handleEnterPress?:Function,
    not_mobile?: boolean,
}) {
    const inputRef = useRef(null);  // 创建一个 ref 引用
    const [value, setValue] = React.useState("");
    useEffect(() => {
        let v = props.value;
        if(v === undefined || v === null) {
            v = '';
        }
        inputRef.current.value = v;
        setValue(props.value || "");
    }, [props.value]);
    return <div id="search" className="" style={{"maxWidth":props.max_width,display:props.not_mobile?"block":undefined}} >
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
                onKeyPress={(event)=>{
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
    handlerEnter?:(v)=>void,
    focus?:boolean,
    no_border?:boolean,
    left_placeholder?:string,
    right_placeholder?:string,
    disabled?:boolean,
    maxWidth?:string,
    width?:string,
}) {
    const inputRef = useRef(null);
    const [value, setValue] = React.useState("");
    const [css, setCss] = React.useState("input input--block");
    useEffect(() => {
        setValue(props.value === undefined || props.value === null ? "" : props.value);
        if (props.focus) {
            inputRef.current.focus(); //获得焦点
        }
        if (props.no_border) {
            setCss(`${css} input--no_border`);
        }
    }, [props.value]);
    return (<React.Fragment >
            {props.placeholderOut && <p>{props.placeholderOut}</p>}
            <div style={{
                display: "flex",
                alignItems: "center",
                width: props.width,
                maxWidth:props.maxWidth
            }}>
                {props.left_placeholder && <div style={{
                    "paddingRight":".3rem",
                    width:"auto",
                    whiteSpace: "nowrap",
                }}>
                    {props.left_placeholder}
                </div>}
                <input
                    onClick={(event)=>{
                        event.stopPropagation();
                    }}
                    disabled={!!props.disabled}
                    className={css}
                    type={props.type}
                    placeholder={value || props.placeholder}
                    onChange={(event) => {
                        if (props.handleInputChange) {
                            props.handleInputChange(event.target.value, event.target);
                        }
                        setValue(event.target.value);
                    }}
                    onKeyPress={(event) => {
                        if (event.key === 'Enter') {
                            if (props.handlerEnter) {
                                props.handlerEnter(event.target.value);
                            }
                        }
                    }}
                    value={value}
                    ref={inputRef}
                />
                {props.right_placeholder && <div style={{
                    "paddingLeft":".3rem",
                    width:"auto",
                    whiteSpace: "nowrap",
                }}>
                    {props.right_placeholder}
                </div>}

            </div>
        </React.Fragment>

    )
}

export function InputText(props: {
    placeholder?: string,
    placeholderOut?: string,
    handleInputChange?: (value: string) => void,
    value?: any,
    handlerEnter?: (v) => void,
    no_border?: boolean,
    left_placeholder?: string,
    right_placeholder?:string
    disabled?: boolean,
    maxWidth?:string,
    width?:string,
}) {
    return Input({
        ...props
    });
}

export function InputPassword(props: {
    placeholder?: string,
    handleInputChange?: (value: string) => void,
    handleEnterPress?: () => void,
    maxWidth?:string,
    width?:string,
}) {
    return Input({
        placeholder: props.placeholder,
        type: "password",
        handleInputChange: props.handleInputChange,
        handlerEnter: props.handleEnterPress,
        maxWidth:props.maxWidth,
        width:props.width,
    });
}

export interface SelectProps {
    options: { title: string, value: any }[];
    onChange: (value: string) => void;
    defaultValue?:any,
    no_border?:boolean,
    value?:any,
    tip?:any,
    width?:string,
    disabled?:boolean
}

export function Select(props: SelectProps) {

    return <div style={{
        display: "flex",
    }}>
        { props.tip &&
            <p className={`input input_left `}>
                {props.tip}
            </p>
        }
        <select defaultValue={props.defaultValue} value={props.value}
                style={{
                    width: props.width,
                }}
                disabled = {!!props.disabled}
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
    name?:string
}) {
    return <div className="input_radio_row">
        <input type="radio" checked={props.selected} name={props.name ?? "common_name"} value={props.value} className={"input_radio"}
               onChange={() => {
                   if (props.onchange) props.onchange(props.value)
               }}/>
        {props.context}
    </div>
}

export function InputCheckbox(props: {
    context: any,
    onchange?: () => void,
    selected?: boolean,
    is_disable?: boolean,
}) {
    const [selected,set_selected] = useState<boolean>(false);
    useEffect(() => {
        set_selected(!!props.selected)
    }, [props.selected]);
    return <div className="input_radio_row">
        <input type="checkbox" disabled={props.is_disable??false} checked={selected}
               onChange={() => {
                   if (props.onchange) {
                       props.onchange();
                   }
               }}/>
        {/*<i className="material-icons icon" onClick={() => {*/}
        {/*    if (props.onchange) {*/}
        {/*        props.onchange();*/}
        {/*    }*/}
        {/*}}>{selected ? "check_box" : "check_box_outline_blank"}</i>*/}
        {/* 通过state更改input是会报错的。所以改成自定义的。*/}
        {/*<input type="checkbox" checked={props.selected} name="common_name" value={props.value} className={"input_radio"}*/}
        {/*       onChange={() => {*/}
        {/*           if (props.onchange) props.onchange(props.value)*/}
        {/*       }}/>*/}
        {props.context}
    </div>
}

