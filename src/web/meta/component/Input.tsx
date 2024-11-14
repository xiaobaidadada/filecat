import React, {useEffect, useRef, useState} from 'react';

import {MaterialIcon} from "material-icons";

export function InputTextIcon(props: {
    placeholder?: string,
    handleInputChange?: (event: string, target: any) => void,
    value?: string,
    icon:MaterialIcon,
    max_width?:string,
    handleEnterPress?:Function
}) {
    const [value, setValue] = React.useState("");
    useEffect(() => {
        setValue(props.value || "");
    }, [props.value]);
    return <div id="search" className="" style={{"maxWidth":props.max_width}}>
        <div id="input">
            <i className="material-icons">{props.icon}</i>
            <input
                type="text"
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
    handlerEnter?:()=>void,
    focus?:boolean,
    no_border?:boolean,
    left_placeholder?:string,
    right_placeholder?:string
}) {
    const inputRef = useRef(null);
    const [value, setValue] = React.useState("");
    const [css, setCss] = React.useState("input input--block");
    useEffect(() => {
        setValue(props.value || "");
        if (props.focus) {
            inputRef.current.focus(); //获得焦点
        }
        if (props.no_border) {
            setCss(`${css} input--no_border`);
        }
    }, [props.value]);
    return (<div >
            {props.placeholderOut && <p>{props.placeholderOut}</p>}
            <div style={{
                display: "flex",
                alignItems: "center",
            }}>
                {props.left_placeholder && <div style={{
                    "paddingRight":".3rem",
                    width:"auto",
                    whiteSpace: "nowrap",
                }}>
                    {props.left_placeholder}
                </div>}
                <input
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
                                props.handlerEnter();
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
        </div>

    )
}

export function InputText(props: {
    placeholder?: string,
    placeholderOut?: string,
    handleInputChange?: (value: string) => void,
    value?: string,
    handlerEnter?: () => void,
    no_border?: boolean,
    left_placeholder?: string,
    right_placeholder?:string
}) {
    return Input({
        ...props
    });
}

export function InputPassword(props: {
    placeholder?: string,
    handleInputChange?: (value: string) => void,
    handleEnterPress?: () => void
}) {
    return Input({
        placeholder: props.placeholder,
        type: "password",
        handleInputChange: props.handleInputChange,
        handlerEnter: props.handleEnterPress
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
}

export function Select(props: SelectProps) {

    return <div style={{
        display: "flex",
    }}>
        { props.tip &&
            <label className={`input input_left `}>
                {props.tip}
            </label>
        }
        <select defaultValue={props.defaultValue} value={props.value}
                style={{
                    width: props.width,
                }}
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
    selected?: boolean
}) {
    return <div className="input_radio_row">
        <input type="radio" checked={props.selected} name="common_name" value={props.value} className={"input_radio"}
               onChange={() => {
                   if (props.onchange) props.onchange(props.value)
               }}/>
        {props.context}
    </div>
}

export function InputCheckbox(props: {
    value: any,
    context: any,
    onchange?: () => void,
    selected?: boolean
}) {

    return <div className="input_radio_row">
        <i className="material-icons icon" onClick={()=>{
            if (props.onchange) {
                props.onchange();
            }
        }}>{props.selected?"check_box":"check_box_outline_blank" }</i>
        {/* 通过state更改input是会报错的。所以改成自定义的。*/}
        {/*<input type="checkbox" checked={props.selected} name="common_name" value={props.value} className={"input_radio"}*/}
        {/*       onChange={() => {*/}
        {/*           if (props.onchange) props.onchange(props.value)*/}
        {/*       }}/>*/}
        {props.context}
    </div>
}

