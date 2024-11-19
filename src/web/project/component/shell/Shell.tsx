import React, {useCallback, useEffect, useRef, useState} from "react";
import lodash from "lodash";
import {FitAddon} from "@xterm/addon-fit";
import {Terminal} from "@xterm/xterm";
import '@xterm/xterm/css/xterm.css'
import {copyToClipboard} from "../../util/FunUtil";
import {NotySucess} from "../../util/noty";
import { useTranslation } from "react-i18next";

export interface ShellProps {
    show:boolean,
    terminal:Terminal,
    init:(rows:number,cols:number) =>void,
    file_shell_hidden?:boolean,
}

export function Shell(props:ShellProps) {
    const {t} = useTranslation();
    const [shellHeight,setShellHeight] = useState(25);
    const shellDividerRef = useRef(null);
    // @ts-ignore
    const fitAddon = useCallback(new FitAddon(),[])
    const shellRef = useRef(null);
    // pty 终端
    const terminalRef = useRef(null);
    const [shellDrag,setShellDrag] = useState(false);

    const handleDrag = useCallback(lodash.throttle( (event)=> {
        // @ts-ignore
        fitAddon.fit();
        const size = parseFloat(getComputedStyle(shellRef.current).fontSize);
        const top = window.innerHeight / size - 4;
        const userPos = (window.innerHeight - event.clientY) / size;
        // @ts-ignore
        const bottom =2.25 +shellDividerRef.current.offsetHeight / size;
        if (userPos <= top && userPos >= bottom) {
            setShellHeight(parseFloat(userPos.toFixed(2)))
        }
    }, 32),[])
    useEffect(() => {
        if (props.terminal) {
            props.terminal.open(terminalRef.current);
            // terminal 的尺寸与父元素匹配
            // @ts-ignore
            props.terminal!.loadAddon(fitAddon)
            // @ts-ignore
            fitAddon.fit()
            props.init(props.terminal.rows,props.terminal.cols);

            // 监听键盘事件
            props.terminal.attachCustomKeyEventHandler((event) => {
                // 检测用户是否按下 Ctrl + C
                if (event.ctrlKey && event.key === 'c') {
                    const selectedText = props.terminal.getSelection();
                    if (selectedText) {
                        copyToClipboard(selectedText);
                        NotySucess(t("copied"));
                        // 阻止默认的 Ctrl + C 事件（防止它发送中断信号）
                        event.preventDefault();
                        props.terminal.focus();
                    }
                }
                return true;
            });
        }

    },[props.terminal])
    useEffect(() => {
        return ()=>{
            if (props.terminal) {
                props.terminal.dispose();
            }
        }
    }, []);
    const handlePointerDown = () => {
        // 按下
        setShellDrag(true)
        shellRef.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup= () => {
        // 抬起
        setShellDrag(false)
        shellRef.current.removeEventListener("pointermove", handleDrag);

    };
    if (!props.show) {
        return ;
    }
    return <div className={"shell"} style={{
        height: `${shellHeight}em`,
        display: `${props.file_shell_hidden? 'none' : 'block'}`
    }} ref={shellRef}>
        <div className={"shell__divider"} ref={shellDividerRef} onPointerDown={handlePointerDown}
             onPointerUp={handlePointerup}/>
        <div className={"pty"} style={{
            height: `${shellHeight - 1}em`,
        }} ref={terminalRef}/>
        {shellDrag &&
            <div
                className="shell__overlay" onPointerUp={handlePointerup}
            />
        }
    </div>
}
