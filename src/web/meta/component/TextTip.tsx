import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from "react-dom";
import {copyToClipboard} from "../../project/util/FunUtil";
import {NotySuccess} from "../../project/util/noty";

export interface TextProps {
    context?: string,
    tip_context?: string,
    children?: any
}

/**
 * 悬停显示的完整文本浮层。
 *
 * 浮层用 position: fixed + portal 挂到 body，原因有两个：
 * 1. 卡片内容区（.card-content）有 overflow 约束，留在里面的绝对定位元素超出边界会被裁掉；
 * 2. 弹窗 .card.floating 带 transform 动画，会让内部 fixed 元素的参照系从视口退化成该元素，
 *    所以必须挂到 body 才能让 fixed 真正相对视口定位。
 *
 * 位置由 JS 测量锚点元素在视口中的坐标后写入 CSS 变量，浮层自身的 left/top 由样式表控制：
 *   --tip-x：锚点左边缘的视口 x 坐标，对应原来的 left: 0
 *   --tip-y：锚点顶边向上偏移 1rem 后的视口 y 坐标，对应原来的 top: -1rem
 * 这样浮层的水平/垂直位置与原来是像素级一致的。
 */
function TextTipLayer(props: {
    key?: React.Key,
    anchor: HTMLElement | null,
    children: React.ReactNode,
    onClick?: () => void,
    onEnter?: () => void,
    onLeave?: () => void,
}) {
    const [style, set_style] = useState<React.CSSProperties | null>(null);

    useEffect(() => {
        if (!props.anchor) {
            set_style(null);
            return;
        }
        const rect = props.anchor.getBoundingClientRect();
        set_style({
            // 换算成 CSS 变量后由样式表使用，保持 left: 0 / top: -1rem 的原视觉位置
            ["--tip-x" as any]: `${rect.left}px`,
            ["--tip-y" as any]: `${rect.top - 16}px`,
        });
    }, [props.anchor]);

    if (!style) {
        return null;
    }
    return createPortal(
        <div className={"card-text-tip"} style={style}
             onClick={props.onClick}
             onMouseEnter={props.onEnter}
             onMouseLeave={props.onLeave}>
            {props.children}
        </div>,
        document.body
    );
}

/**
 * 悬停状态管理。
 *
 * 浮层被 portal 到 body 后不再是文本节点的兄弟元素，
 * 鼠标从文本移到浮层上时会先触发文本的 mouseleave，
 * 所以关闭动作延迟到下一帧，浮层的 mouseenter 能在这之前取消掉关闭。
 */
function use_hover_tip() {
    const anchor_ref = useRef<HTMLDivElement>(null);
    const timer_ref = useRef<number>(0);
    const [anchor, set_anchor] = useState<HTMLElement | null>(null);

    const show = () => {
        window.clearTimeout(timer_ref.current);
        set_anchor(anchor_ref.current);
    };
    const hide = () => {
        window.clearTimeout(timer_ref.current);
        // 浮层在文字上方留了 1rem 间距，鼠标要穿过这段空白才能移上去，
        // 延迟关闭给这段时间留出余量，进入浮层后会被 onEnter 取消
        timer_ref.current = window.setTimeout(() => set_anchor(null), 200);
    };
    useEffect(() => () => window.clearTimeout(timer_ref.current), []);

    return {anchor_ref, anchor, show, hide};
}

/**
 * 带悬停提示、点击复制的文本。
 */
export function TextTip(props: TextProps) {
    const {anchor_ref, anchor, show, hide} = use_hover_tip();

    const click = () => {
        copyToClipboard(props.tip_context ?? props.context ?? props.children)
        NotySuccess('复制完成')
    }

    return (
        <div className="card-text">
            <div className={"card-text-context"} ref={anchor_ref} onMouseEnter={show} onMouseLeave={hide}>
                {props.context ?? props.children}
            </div>
            <TextTipLayer anchor={anchor} onClick={click} onEnter={show} onLeave={hide}
                          children={props.tip_context ?? props.context ?? props.children}/>
        </div>
    )
}

/**
 * 只做悬停展示的文本（不提供复制）。
 */
export function LongText(props: TextProps) {
    const {anchor_ref, anchor, show, hide} = use_hover_tip();

    return (
        <div className="card-text">
            <div className={"card-text-context"} ref={anchor_ref} onMouseEnter={show} onMouseLeave={hide}>
                {props.context ?? props.children}
            </div>
            <TextTipLayer anchor={anchor} onEnter={show} onLeave={hide}
                          children={props.context ?? props.children}/>
        </div>
    )
}
