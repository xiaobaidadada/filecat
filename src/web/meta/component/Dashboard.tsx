import React, {useEffect, useRef, useState} from 'react';
import {Link, Route, Routes, useLocation, useMatch, useNavigate} from "react-router-dom";
import Login from "../../project/component/Login";
import Layout from "../../project/component/Layout";
import SimpleRoutes from "./SimpleRoutes";
import {ActionButton, Button} from "./Button";
import {getRouterPath} from "../../project/util/WebPath";

// 菜单容器
export function Menu(props) {
    const location = useLocation();

    if (props.optionList) {
        props.optionList.sort((a, b) => a.index - b.index);
    }
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    useEffect(() => {
        let have = true;
        for (let index = 0; index < props.optionList.length; index++) {
            if (getRouterPath().includes(props.optionList[index].rto)) {
                setSelectedIndex(index);
                have = false;
                break;
            }
        }
        if(have) {
            setSelectedIndex(0);
        }
    }, [props.optionList]);
    return <div className={"dashboard"}>
        {/*标签头*/}
        <div className={"menu not-select-div"}>
            <div className={"wrapper"}>
                <ul>

                    {props.optionList.map((v, index) =>
                        (<Link to={v.rto} onClick={() => {
                            setSelectedIndex(index)
                        }} key={index}>
                            <li className={selectedIndex === index ? "active" : ""}>{v.name}</li>
                        </Link>)
                    )}
                </ul>
            </div>
        </div>
        {/*标签内容路由*/}
        <SimpleRoutes rtos={props.optionList.filter(v=>!!v).map(value => value.rto)}
                      children={!Array.isArray(props.children) ? [props.children.filter(v=>!!v)] : props.children.filter(v=>!!v)}/>
    </div>
}

// 普通容器
export function Dashboard(props) {
    return <div className={"dashboard"}>
        {props.children}
    </div>
}

// 容器内的列
export const Column: React.FC<{
    widthPer?: number,
    children: React.ReactNode
}> = (props) => {
    return <div className={"column"} style={{
        "width": props.widthPer ? `${props.widthPer}%` : "50%"
    }}>{props.children}</div>
}

export function Row(props) {
    return <div className={"row"}>{props.children}</div>
}

export function RowColumn(props) {
    return (<div className={"row"}>
        <Column {...props}>
            {(props.children)}
        </Column>
    </div>)
}

export function SelfCenter(props) {
    return (<div className={"center "}>
        {props.children}
    </div>)
}

export function WinCenter(props) {
    return (<div className={"self_win_center "}>
        {props.children}
    </div>)
}

// Flex 流式布局的容器
export function FlexContainer(props) {
    return (
        <div className={"flex"}>
            {props.children}
        </div>
    )
}

export function TextLine(props: {
    right?: any,
    left?: any,
    center?: any
}) {
    return <div className="grid_three">
        <div className="grid_three_item">{props.left}</div>
        <div className="grid_three_item">{props.center}</div>
        <div className="grid_three_item">{props.right}</div>
    </div>

}


export function FileMenuItem(props: { x: number, y: number, items?: any, click?: (v) => void }) {
    const divRef = useRef(null);
    const [visible, setVisible] = useState(false); // 控制显示与否
    const [position, setPosition] = useState({ top: props.y, left: props.x });

    // 确保 div 不超出屏幕的函数
    const adjustPosition = () => {
        const divElement = divRef.current;
        const { innerWidth, innerHeight } = window;
        if (divElement) {
            const rect = divElement.getBoundingClientRect();

            let newTop = position.top;
            let newLeft = position.left;

            // 检查右侧是否超出屏幕
            if (rect.right > innerWidth) {
                newLeft = innerWidth - rect.width;
            }
            // 检查左侧是否超出屏幕
            if (rect.left < 0) {
                newLeft = 0;
            }
            // 检查底部是否超出屏幕
            if (rect.bottom > innerHeight) {
                newTop = innerHeight - rect.height;
            }
            // 检查顶部是否超出屏幕
            if (rect.top < 0) {
                newTop = 0;
            }

            // 更新位置
            setPosition({ top: newTop, left: newLeft });
            setVisible(true); // 位置调整后再显示
        }
    };
    // 在组件挂载后获取宽高并调整位置
    useEffect(() => {
        adjustPosition();
    }, [props]);
    return <div
        ref={divRef}
        style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            // backgroundColor: 'white',
            // border: '1px solid black',
            padding: '5px',
            zIndex: 1002,
            visibility: visible ? 'visible' : 'hidden', // 使用 visibility 控制显示
            // display: visible ? 'block' : 'none', // 通过 display 控制显示
        }}
    >
        <Dropdown items={props.items} click={props.click}/>
    </div>
}

export function DropdownTag(props: {
    items?: { r: React.ReactNode, v: any }[],
    click?: (v) => void,
    pre_value?: any,
    title?: any
}) {
    const [show, setShow] = React.useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const click = () => {
        setShow(false);
    }


    return <div className={"dropdown_start"}>
        <ActionButton icon={"more_vert"} title={props.title} onClick={(event) => {
            setPosition({top: event.clientY, left: event.clientX})
            setShow(!show)
        }}/>
        {show && <OverlayTransparent click={click}/>}
        {show && <FileMenuItem x={position.left} y={position.top}
                               items={props.items} click={props.click}/> }
    </div>

}

function DropdownItem(props: { key, value, click, context, pre_value, c?: React.ReactNode }) {
    const parentRef = useRef(null); // 父容器的引用
    const childRef = useRef(null);  // 子容器的引用
    const [isOutOfScreen, setIsOutOfScreen] = useState(false);
    const [parentWidth, setParentWidth] = useState(0); // 存储父 div 宽度

    // 计算子 div 是否超出屏幕
    const checkPosition = () => {
        if (parentRef.current && childRef.current) {
            const parentRect = parentRef.current.getBoundingClientRect();
            const childRect = childRef.current.getBoundingClientRect();

            const width = parentRect.width;
            setParentWidth(width); // 更新宽度状态

            // 判断子 div 的右边缘是否超出屏幕
            const screenWidth = window.innerWidth;
            if (childRect.right + width > screenWidth) {
                setIsOutOfScreen(true);
            } else {
                setIsOutOfScreen(false);
            }
        }
    };
    useEffect(() => {
        // 组件加载时计算一次
        checkPosition();
        // 监听窗口变化（例如屏幕大小变化）
        window.addEventListener('resize', checkPosition);
        // 清理监听器
        return () => {
            window.removeEventListener('resize', checkPosition);
        };
    }, []); // 只在组件挂载时执行一次

    // 处理鼠标进入父 div 时
    const handleMouseEnter = () => {
        if (parentRef.current && childRef.current) {
            childRef.current.style.display = 'block'; // 鼠标悬停时显示子 div
            checkPosition();
        }
    };
    // 处理鼠标离开父 div 时
    const handleMouseLeave = () => {
        if (childRef.current) {
            childRef.current.style.display = 'none'; // 鼠标离开时隐藏子 div
        }
    };

    return <div  ref={parentRef} className={`dropdown_item ${props.value !== undefined && props.value === props.pre_value ? "dropdown_selected" : ""}`}
                onClick={(e) => {
                    e.stopPropagation()
                    e.nativeEvent.stopImmediatePropagation()
                    if (props.click) props.click(props.value)
                }}
                 onMouseEnter={handleMouseEnter} // 监听鼠标进入
                 onMouseLeave={handleMouseLeave} // 监听鼠标离开
    >
        {props.context}
        {props.c &&
            <div
                className={"dropdown_item_children"}
                ref={childRef}
                style={{
                    position: 'absolute',
                    top: '-.5rem',
                    right: isOutOfScreen ?parentWidth:undefined ,
                    left: isOutOfScreen?undefined:parentWidth, // 如果超出屏幕，子 div 显示在右边
                    // transform: 'translateY(-50%)',
                    // backgroundColor: 'lightgreen',
                    // padding: '10px',
                    display: 'none', // 默认隐藏
                }}
                onMouseEnter={()=>{
                    childRef.current.style.display = 'block';
                }} // 监听鼠标进入
                // onMouseLeave={()=>{
                //     childRef.current.style.display = 'none';
                // }} // 监听鼠标离开
            >
                {props.c}
            </div>
        }
    </div>
}

export type DropdownItemsPojo = { r: React.ReactNode, v: any, items?: DropdownItemsPojo }[];


export function Dropdown(props: { items?: DropdownItemsPojo, click?: (v) => void, pre_value?: any }) {

    return <div className={"dropdown"}  >
        {props.items && props.items.map((v, index) => (
            <DropdownItem key={index} value={v.v} click={props.click} context={v.r} pre_value={props.pre_value}
                          c={(<Dropdown items={v.items} click={props.click} pre_value={props.pre_value}/>)}/>))}
    </div>
}

export function Overlay(props: { click: () => void }) {
    return <div className="overlay" onClick={props.click}></div>
}

export function OverlayTransparent(props: { click: () => void, children?: React.ReactNode }) {
    return <div className="overlay_trans" onClick={props.click}>{props.children}</div>
}

export function FullScreenDiv(props: { isFull?: boolean; children?: React.ReactNode; more?:boolean}) {
    let className = props.isFull ? "full_screen " : "not_screen ";
    if(props.more) {
        className += " full_screen_more ";
    }
    return <div className={className} >
        {props.children}
    </div>
}

export function FullScreenContext(props: { children?: React.ReactNode; }) {
    return <div className={"full_screen_context"}>
        {props.children}
    </div>
}
