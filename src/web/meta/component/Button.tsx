import React from 'react';
import {MaterialIcon} from "material-icons";
import '../resources/css/all.css'

export function ButtonLittle(props:{text:string,clickFun?:Function}) {
    return (<button className={"little-button button"}  onClick={props.clickFun}>{props.text}</button>)
}

export function Button(props: { text: string, clickFun?: Function }) {
    return (<input
        className="button button--block"
        type="submit"
        value={props.text}
        onClick={props.clickFun}
    />)
}

export function ButtonText(props:{text:string,clickFun?:Function}) {
    return (<input
        className="button button--flat"
        type="button"
        value={props.text}
        onClick={props.clickFun}
    />)
}

export function ActionButton(props:{icon:MaterialIcon,title:string,onClick?:Function,tip?:any,selected?:boolean}) {
    return (
        <div className="action" title={props.title} onClick={props.onClick}>
            <i className="material-icons icon" style={{
                color:props.selected===true?"#2196f3":""
            }}>{props.icon}</i>
            {props.tip!==undefined && <div className={"actio_tip"}>{props.tip}</div>}
        </div>
    );
}
