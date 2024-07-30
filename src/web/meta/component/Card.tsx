import React, {useRef} from 'react';
import Noty from "noty";
import {InputText} from "./Input";

export interface CardProps {
    title?: string;
    titleCom?:React.ReactNode;
    children?: React.ReactNode;
    rightBottomCom?: React.ReactNode;
}

enum Type {
    common,
    full
}

function CardComponent(props: CardProps ,type:Type) {
    const contextClass = type===Type.common?"card-content"
        :type===Type.full?"card-content full":"";
    return <div className={"card"}>
        <div className={"card-title"}>
            <h2>{props.title}</h2>
            <div>{props.titleCom && props.titleCom}</div>
        </div>
        <div className={contextClass}>
            {props.children}
        </div>
        <div className={"card-action card-action-bottom-right"}>
            {props.rightBottomCom}
            {/*<input type="submit" className="button button--flat" value="更新"/>*/}
        </div>
    </div>
}

export function Card(props: CardProps) {
    return CardComponent(props,Type.common);
}

export function CardFull(props:CardProps) {
    return CardComponent(props,Type.full);
}

export interface TextProps {
    context?:string
}
export function TextTip(props:TextProps) {
    const copyRef = useRef<HTMLDivElement>(null);
    const click = () =>{
        const textarea = document.createElement('textarea');
        // @ts-ignore
        textarea.value = props.context;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        new Noty({
            type: 'info',
            text: '复制完成',
            timeout: 1000, // 设置通知消失的时间（单位：毫秒）
            layout:"bottomLeft"
        }).show();
    }
    return (
        <div className="card-text">
            <div className={"card-text-context"}>{props.context}</div>
            <div className={"card-text-tip"} ref={copyRef} onClick={click}>{props.context}</div>
        </div>
    )
}


export function CardPrompt(props:{title:string,context?:React.ReactNode[],cancel?:()=>void,confirm?:()=>void,cancel_t?:string,confirm_t?:string}) {
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{props.title}</h2>
        </div>
        <div className="card-content">
            {props.context && props.context.map((value,index) => (<div key={index}>{value}</div>))}
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={props.cancel}>
                {props.cancel_t ?? "cancel"}
            </button>
            <button className="button button--flat" onClick={props.confirm}>
                {props.confirm_t ?? "confirm"}
            </button>
        </div>
    </div>)
}

export function ProgressCard(props:{progress:number}) {
    return <div className="progress-card">
        <div className="progress-per">
            <div style={{
                "width": `${props.progress}%`
            }}></div>
        </div>
    </div>
}
