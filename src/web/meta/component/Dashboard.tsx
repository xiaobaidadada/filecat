import React, {useEffect, useRef, useState} from 'react';
import {Link, NavLink, Route, Routes, useLocation, useMatch, useNavigate} from "react-router-dom";
import SimpleRoutes from "./SimpleRoutes";
import {ActionButton, Button} from "./Button";
import { have_key_by_router_key_list} from "../../project/util/WebPath";
// 1. 定义每个配置项的类型，支持传入 React 组件
export interface MenuOption {
    rto: string;
    name: string;
    component: React.ComponentType<any> | React.ReactNode; // 支持直接传组件类或渲染好的 React 节点
    index?: number;
}

export function Menu(props: {
    optionList: MenuOption[];
}) {
    const optionList = [...props.optionList].sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0)
    );
    const components = optionList.map(v=>v.component);
    const have_key = have_key_by_router_key_list(props.optionList.map(v=>v.rto))
    return (
        <div className={"dashboard"}>
            {/* 菜单 */}
            <div className={"menu not-select-div"}>
                <div className={"wrapper"}>
                    <ul>
                        {optionList.map((v, index) => (
                            <NavLink
                                key={index}
                                to={`${v.rto}`.replace(/\*$/, "")}
                                end={v.rto === "/"} // 根路径精确匹配
                                className={({ isActive }) =>
                                {
                                    if(have_key === false && index === 0) {
                                        isActive = true
                                    }
                                    return isActive ? "active-link" : ""
                                }
                                }
                            >
                                {({ isActive }) => {
                                    if(have_key === false && index === 0) {
                                        isActive = true
                                    }
                                    return (
                                        <li className={isActive ? "active" : ""}>
                                            {v.name}
                                        </li>
                                    )
                                }}
                            </NavLink>
                        ))}
                    </ul>
                </div>
            </div>

            {/*标签内容路由*/}
            <div className={" scroll-div-y "}>
                <div style={{
                    padding:".5rem"
                }}>
                    <SimpleRoutes rtos={props.optionList.filter(v=>!!v).map(value => value.rto)}
                                  children={components}/>
                </div>
            </div>
        </div>
    );
}

// 普通容器 行列必须要在这个里面
export function Dashboard(props) {
    return <div className={"dashboard"}>
        {props.children}
    </div>
}

// 容器内的列
export const Column: React.FC<{
    widthPer?: number,
    minWidth?:number,
    maxWidth?:number,
    children: React.ReactNode
}> = (props) => {
    const style = {
        "width": props.widthPer ? `${props.widthPer}%` : "50%"
    }
    if (props.minWidth) {
        style['minWidth'] = props.minWidth ? `${props.minWidth}%` : "50%";
    }
    if(props.maxWidth) {
        style['maxWidth'] = props.maxWidth ? `${props.maxWidth}%` : "50%";
    }
    return <div className={"column"} style={style}>{props.children}</div>
}

export function Row(props) {
    return <div className={"row"}>{props.children}</div>
}

export function RowColumn(props?:{
    widthPer?: number,
    minWidth?:number,
    maxWidth?:number,
    children?: React.ReactNode}) {
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

export function ShowTextDiv (props:{content:string}) {
    return <div className={"show_data_text_div"}>
        {props.content}
    </div>
}


export function FileMenuItem(props: { x: number, y: number, items?: any, click?: (v,item) => void ,pre_value?: any}) {
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
        <Dropdown items={props.items} click={props.click} pre_value={props.pre_value}/>
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

export function DropdownItem(props: {
    item: any,
    click?: (v: any, item: any) => void,
    context: React.ReactNode,
    pre_value?: any,
    value?: any,
    c?: React.ReactNode
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [alignLeft, setAlignLeft] = useState(false); // 决定子菜单是向左还是向右弹出
    const itemRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // 关键逻辑：检测屏幕剩余空间
    const checkPosition = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            // 假设子菜单宽度约为 160px (10rem)，加上父级宽度，判断右侧剩余空间
            const spaceRight = window.innerWidth - rect.right;
            if (spaceRight < 160) {
                setAlignLeft(true); // 右侧空间不足，向左弹出
            } else {
                setAlignLeft(false); // 默认向右弹出
            }
        }
    };

    const handleMouseEnter = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        checkPosition(); // 鼠标移入时校验位置
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timerRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 10);
    };

    return (
        <div
            ref={itemRef}
            className={`dropdown_item ${props.value !== undefined && props.value === props.pre_value ? "dropdown_selected" : ""}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => {
                e.stopPropagation();
                if (props.click && props.value !== undefined) props.click(props.value, props.item);
            }}
        >
            <div className="action">
                <span>{props.context}</span>
            </div>

            {isOpen && props.c && (
                <div
                    className="dropdown_item_children"
                    style={{
                        position: 'absolute',
                        top: '-.5rem',
                        // 根据空间动态调整左右偏移
                        left: alignLeft ? 'auto' : '100%',
                        right: alignLeft ? '100%' : 'auto',
                        zIndex: 1003,
                        display: 'block'
                    }}
                >
                    {props.c}
                </div>
            )}
        </div>
    );
}

export type DropdownItemsPojo = { r: React.ReactNode, v: any, items?: DropdownItemsPojo }[];


export function Dropdown(props: {
    items?: { r: React.ReactNode, v: any, items?: any[] }[],
    click?: (v: any, item: any) => void,
    pre_value?: any
}) {
    return (
        <div className="dropdown">
            {props.items && props.items.map((v, index) => (
                <React.Fragment key={index}>
                    <DropdownItem
                        value={v.v}
                        item={v}
                        click={props.click}
                        context={v.r}
                        pre_value={props.pre_value}
                        // 递归嵌套子菜单
                        c={v.items ? <Dropdown items={v.items} click={props.click} pre_value={props.pre_value} /> : null}
                    />
                </React.Fragment>
            ))}
        </div>
    );
}

export function Overlay(props: { click: () => void, className?: string }) {
    return <div className={`overlay ${props.className ?? ""}`.trim()} onClick={props.click}></div>
}

export function OverlayTransparent(props: { click: () => void, children?: React.ReactNode }) {
    return <div className="overlay_trans" onClick={props.click}>{props.children}</div>
}

export function DivOverlayTransparent(props: { click: () => void, children?: React.ReactNode }) {
    return <div className="overlay_trans_container" onClick={props.click}>
        <div className={"overlay_trans_overlay "}></div>
        <div className={"overlay_trans_content"}>{props.children}</div>
    </div>
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
