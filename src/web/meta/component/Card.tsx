import React, {useEffect, useRef, useState} from 'react';
import {InputText} from "./Input";
import {copyToClipboard} from "../../project/util/FunUtil";
import {NotySuccess} from "../../project/util/noty";

export interface CardProps {
    title?: string;
    self_title?: any;
    titleCom?: React.ReactNode;
    children?: React.ReactNode;
    rightBottomCom?: React.ReactNode;
    key?:any
}

enum Type {
    common,
    full
}

function CardComponent(props: CardProps, type: Type) {
    const contextClass = type === Type.common ? "card-content"
        : type === Type.full ? "card-content full" : "";
    return <div className={"card"} style={{
        // overflow:"auto"
    }}>
        <div className={"card-title"}>
            {props.self_title ? props.self_title : <h2>{props.title}</h2>}
            <div className={"not-select-div"}>{props.titleCom && props.titleCom}</div>
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
    return CardComponent(props, Type.common);
}

export function CardFull(props: CardProps) {
    return CardComponent(props, Type.full);
}

export interface TextProps {
    context?: string,
    tip_context?: string,
    children?: any
}

export function TextTip(props: TextProps) {
    const copyRef = useRef<HTMLDivElement>(null);
    const click = () => {
        copyToClipboard(props.tip_context ?? props.context ?? props.children)
        NotySuccess('复制完成')
    }
    return (
        <div className="card-text">
            <div className={"card-text-context"}>{props.context ?? props.children}</div>
            <div className={"card-text-tip"} ref={copyRef} onClick={click}>{props.tip_context ?? props.context ?? props.children}</div>
        </div>
    )
}

export function LongText(props: TextProps) {
    return (
        <div className="card-text">
            <div className={"card-text-context"}>{props.context ?? props.children}</div>
            <div className={"card-text-tip"} >{props.context ?? props.children}</div>
        </div>
    )
}


export function CardPrompt(props: {
    title: string,
    context?: React.ReactNode[],
    cancel?: () => void,
    confirm?: () => void,
    cancel_t?: string,
    confirm_t?: string,
    confirm_enter?: () => void
}) {
    return (<div className={"card floating"} onKeyPress={(event) => {
        if (event.key === 'Enter') {
            if (props.confirm_enter) {
                props.confirm_enter();
            }
        }
    }}>
        <div className="card-title">
            <h2>{props.title}</h2>
        </div>
        <div className="card-content">
            {props.context && Array.isArray(props.context)
            ? props.context.map((value, index) => (<React.Fragment key={index}>{value}</React.Fragment>))
            : props.context}
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

export function ProgressCard(props: { progress: number }) {
    return <div className="progress-card">
        <div className="progress-per">
            <div style={{
                "width": `${props.progress}%`
            }}></div>
        </div>
    </div>
}

/**
 * 通用状态圆点/状态指示器。
 *
 * 兼容原有三种用法（互斥）：
 *   <StatusCircle ok={true} />       —— 绿点 / 灰点
 *   <StatusCircle success={true} />  —— 绿点 / 红点
 *   <StatusCircle running={true} />  —— 黄点
 *
 * 新增用法：
 *   <StatusCircle loading />         —— 黄色转圈（表示加载中）
 *   <StatusCircle loading text="加载中" />  —— 转圈 + 文字
 *   <StatusCircle success text="在线" />    —— 彩点 + 文字
 *
 * text 传了就在圆点右侧显示文字，文字颜色跟随状态色，省去调用方自己拼文本。
 */
export const StatusCircle = (props: {
    ok?: boolean;
    success?: boolean;
    running?: boolean;
    /** 加载中：显示为旋转的空心圆环（优先于其它状态） */
    loading?: boolean;
    /** 跟随状态色的说明文字；不传则只显示圆点 */
    text?: React.ReactNode;
    /** 圆点直径，默认 10px */
    size?: number;
}) => {
    // 状态色直接算，不用 useState + useEffect（派生状态不该存 state）
    let color = "var(--iconTertiary)";
    if (props.loading === true) {
        color = "var(--icon-yellow)";
    } else if (props.ok != null) {
        color = props.ok ? "var(--icon-green)" : "var(--iconTertiary)";
    } else if (props.success != null) {
        color = props.success ? "var(--icon-green)" : "var(--icon-red)";
    } else if (props.running != null) {
        color = "var(--icon-yellow)";
    }

    const size = props.size ?? 10;
    const circleStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        backgroundColor: props.loading ? "transparent" : color,
        // 加载中用环形边框 + 旋转代替实心点
        border: props.loading ? "2px solid currentColor" : undefined,
        borderTopColor: props.loading ? "transparent" : undefined,
        flexShrink: 0,
    };

    const dot = <div className={props.loading ? "status-circle__dot status-circle__dot--spin" : "status-circle__dot"}
                     style={circleStyle}/>;

    // 没传文字：保持原有的「只返回一个圆点」行为（老调用方零影响）
    if (props.text == null) {
        return dot;
    }

    return (
        <span className="status-circle" style={{color}}>
            {dot}
            <span className="status-circle__text">{props.text}</span>
        </span>
    );
};
