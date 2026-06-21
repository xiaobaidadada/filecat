import React, {useState} from 'react';
import {MaterialIcon} from "material-icons";
import { useAtom } from 'jotai';
import {$stroe} from "../../project/util/store";
import {editor_data} from "../../project/util/store.util";


export function ButtonLittle(props:{text:string,clickFun?:()=>void}) {
    return (<button className={"little-button button"}  onClick={props.clickFun}>{props.text}</button>)
}

export function ButtonLittleStatus(props:{text:string,clickFun?:(open?:boolean)=>void,defaultStatus:boolean}) {
    const [color, setColor] = React.useState(props.defaultStatus);
    return (<button className={"little-button-status"}  style={{
        backgroundColor:!color?"var(--surfaceSecondary)":"var(--icon-blue)"
    }} onClick={()=>{
        const v = !color;
        setColor(v);
        if(props.clickFun ){
            props.clickFun(v);
        }
    }}>{props.text}</button>)
}

export function Button(props: { text: string,color?:string, clickFun?: ()=>void }) {
    return (<input
        className="button button--block"
        type="submit"
        value={props.text}
        onClick={props.clickFun}
        style={{
            backgroundColor: props.color??'var(--blue)'
        }}
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

export function ActionButton(props:{icon?:MaterialIcon,title:string,onClick?:(event?:any)=>void,tip?:any,selected?:boolean,key?:any}) {
    return (
        <div className="action" title={props.title} onClick={props.onClick}>
            {
                props.icon ?
                    <Icon icon={props.icon} style={{
                        color:props.selected===true?"#2196f3":""
                    }}/> :
                    props.title
            }
            {props.tip!==undefined && <div className={"actio_tip"}>{props.tip}</div>}
        </div>
    );
}

export function AceButton(props:{icon?:MaterialIcon,title?:string,value?:string,save:(value:string) => void,model?:string }) {
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting);
    return <ActionButton icon={props.icon} title={props.title} onClick={() => {
        editor_data.set_value_temp(props.value ?? '')
        setEditorSetting({
            model: props.model??"ace/mode/ini",
            open: true,
            fileName: "",
            save:async (context)=>{
                props.save(context);
                editor_data.set_value_temp('')
            }
        })
    }}/>
}

export default function Switch({
                                   checked,
                                   defaultChecked = false,
                                   onChange,
                                   disabled = false,
                                   title = ""
                               }) {
    const [internal, setInternal] = useState(defaultChecked);

    const isControlled = checked !== undefined;
    const isOn = isControlled ? checked : internal;

    const toggle = () => {
        if (disabled) return;

        const next = !isOn;

        if (!isControlled) {
            setInternal(next);
        }

        onChange?.(next);
    };

    return (
        <div className={"action"} title={title}>
            <button
                onClick={toggle}
                disabled={disabled}
                style={{
                    width: "3.5rem",
                    height: "1.8rem",
                    borderRadius: 999,
                    border: "none",
                    cursor: disabled ? "not-allowed" : "pointer",
                    background: isOn ? "#4ade80" : "#ccc",
                    position: "relative",
                    transition: "background 0.2s",
                    padding: 0,
                    overflow: "hidden",
                }}
            >
              <span
                  style={{
                      position: "absolute",
                      top: 3,
                      left: isOn ? 26 : 3,
                      width: "1.5rem",
                      height: "1.4rem",
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
              />
            </button>
        </div>
    );
}

export function Icon(props:{icon: MaterialIcon|'',style?:any,aria_label?:string}) {
    return <i className="material-icons icon" aria-label={props.aria_label} data-icon={props.icon} style={{...props.style}}>{props.icon}</i>
}