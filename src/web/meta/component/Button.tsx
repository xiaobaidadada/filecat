import React from 'react';
import {MaterialIcon} from "material-icons";


export function ButtonLittle(props:{text:string,clickFun?:()=>void}) {
    return (<button className={"little-button button"}  onClick={props.clickFun}>{props.text}</button>)
}

export function ButtonLittleStatus(props:{text:string,clickFun?:(open?:boolean)=>void,defaultStatus:boolean}) {
    const [color, setColor] = React.useState(props.defaultStatus);
    return (<button className={"little-button-status"}  style={{
        backgroundColor:!color?"var(--surfaceSecondary)":"var(--blue)"
    }} onClick={()=>{
        const v = !color;
        setColor(v);
        if(props.clickFun ){
            props.clickFun(v);
        }
    }}>{props.text}</button>)
}

export function Button(props: { text: string, clickFun?: ()=>void }) {
    return (<input
        className="button button--block"
        type="submit"
        value={props.text}
        onClick={props.clickFun}
    />)
}

export function ButtonText(props:{text:string,clickFun?:()=>void}) {
    return (<input
        className="button button--flat "
        type="button"
        value={props.text}
        onClick={props.clickFun}
    />)
}

export function ActionButton(props:{icon:MaterialIcon,title:string,onClick?:(event?:any)=>void,tip?:any,selected?:boolean,key?:any}) {
    return (
        <div className="action" title={props.title} onClick={props.onClick}>
            <i className="material-icons icon" style={{
                color:props.selected===true?"#2196f3":""
            }}>{props.icon}</i>
            {props.tip!==undefined && <div className={"actio_tip"}>{props.tip}</div>}
        </div>
    );
}
