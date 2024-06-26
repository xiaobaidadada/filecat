import React, {useEffect} from 'react';
import {Link, Route, Routes, useLocation, useMatch, useNavigate} from "react-router-dom";
import Login from "../../project/component/Login";
import Layout from "../../project/component/Layout";
import {SimpleRoutes} from "./SimpleRoutes";
import {ActionButton, Button} from "./Button";
import '../resources/css/all.css'
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

export function Dropdown(props) {
    const [className, setClassName] = React.useState("dropdown_none");
    const click = () =>{
        setClassName("dropdown_none");
    }

    return <div className={"dropdown_start"}>
        <ActionButton icon={"more_vert"} title={"更多"} onClick={() => {
            setClassName(className === "dropdown" ? "dropdown_none" : "dropdown")
        }}/>
        {className==="dropdown" && <OverlayTransparent click={click}/>}
        <div className={"dropdown_start"} >
            <div className={className}>
                {props.children}
            </div>
        </div>
    </div>

}

export function Overlay(props:{click:Function}) {
    return <div className="overlay" onClick={props.click}></div>
}

export function OverlayTransparent(props:{click:Function}) {
    return <div className="overlay_trans" onClick={props.click}></div>
}

export function FullScreenDiv(props:{isFull?:boolean;children?: React.ReactNode;}) {
    return <div className={props.isFull ?"full_screen":""}>
        {props.children}
    </div>
}
