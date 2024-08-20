import React, {useEffect} from 'react';
import {Link, Route, Routes, useLocation, useMatch, useNavigate} from "react-router-dom";
import Login from "../../project/component/Login";
import Layout from "../../project/component/Layout";
import {SimpleRoutes} from "./SimpleRoutes";
import {ActionButton, Button} from "./Button";

// 菜单容器
export function Menu(props) {
    const location = useLocation();

    if (props.optionList) {
        props.optionList.sort((a, b) => a.index - b.index);
    }
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    useEffect(() => {
        for (let index=0;index<props.optionList.length;index++) {
            if (location.pathname.includes(props.optionList[index].rto)) {
                setSelectedIndex(index);
            }
        }
    }, []);
    return <div className={"dashboard"}>
        {/*标签头*/}
        <div className={"menu"}>
            <div className={"wrapper"}>
                <ul>

                    {props.optionList.map((v, index) =>
                        (<Link to={v.rto} onClick={() => {setSelectedIndex(index)}} key={index}>
                            <li className={selectedIndex===index ?"active":""} >{v.name}</li>
                        </Link>)
                    )}
                </ul>
            </div>
        </div>
        {/*标签内容路由*/}
        <SimpleRoutes rtos={props.optionList.map(value => value.rto)} children={!Array.isArray(props.children)?[props.children]:props.children} />
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
    widthPer?:number,
    children:React.ReactNode
}>  = (props)=>{
    return <div className={"column"} style={{
        "width":props.widthPer?`${props.widthPer}%`:"50%"
    }}>{props.children}</div>
}

export function Row(props) {
    return <div className={"row"}>{props.children}</div>
}

export function RowColumn(props){
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

export function FlexContainer(props) {
    return (
        <div className={"flex"}>
            {props.children}
        </div>
    )
}

export function TextLine(props:{
    right?:any,
    left?:any,
    center?:any
}) {
    return <div className="grid_three">
        <div className="grid_three_item">{props.left}</div>
        <div className="grid_three_item">{props.center}</div>
        <div className="grid_three_item">{props.right}</div>
    </div>

}

export function DropdownTag(props:{items?:{r:React.ReactNode,v:any}[],click?:(v)=>void, pre_value?:any}) {
    const [show, setShow] = React.useState(false);
    const click = () =>{
        setShow(false);
    }

    return <div className={"dropdown_start"}>
        <ActionButton icon={"more_vert"} title={"更多"} onClick={() => {
            setShow(!show)
        }}/>
        {show && <OverlayTransparent click={click}/>}
        {show && <Dropdown {...props}/>}

    </div>

}

function DropdownItem (props:{key,value,click,context,pre_value,c?:React.ReactNode}) {
    return <div  className={props.value !== undefined && props.value === props.pre_value ? "dropdown_selected" : ""}
                onClick={() => {
                    if (props.click) props.click(props.value)
                }}>
        {props.context}
        {props.c &&
            <div className={"dropdown_child"}>
                {props.c}
            </div>
        }
    </div>
}

export type DropdownItemsPojo = { r: React.ReactNode, v: any,c?:DropdownItemsPojo }[];

export function Dropdown(props: { items?: DropdownItemsPojo, click?: (v) => void, pre_value?: any }) {
    return <div className={"dropdown"}>
        {props.items && props.items.map((v, index) => (<DropdownItem key={index} value={v.v} click={props.click} context={v.r} pre_value={props.pre_value} c={(<Dropdown items={v.c} click={props.click} pre_value={props.pre_value}/>)}/>))}
    </div>
}

export function Overlay(props: { click: Function }) {
    return <div className="overlay" onClick={props.click}></div>
}

export function OverlayTransparent(props: { click: Function ,children?: React.ReactNode}) {
    return <div className="overlay_trans" onClick={props.click}>{props.children}</div>
}

export function FullScreenDiv(props: { isFull?: boolean;children?: React.ReactNode;}) {
    return <div className={props.isFull ?"full_screen":"not_screen"}>
        {props.children}
    </div>
}
