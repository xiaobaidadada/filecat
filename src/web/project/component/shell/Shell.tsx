import React, {useCallback, useEffect, useRef, useState} from "react";
import lodash from "lodash";
import {FitAddon} from "@xterm/addon-fit";
import {Terminal} from "@xterm/xterm";
import '@xterm/xterm/css/xterm.css'

export interface ShellProps {
    show:boolean,
    terminal:Terminal,
    init:(rows:number,cols:number) =>void
}

export function Shell(props:ShellProps) {
    const [shellHeight,setShellHeight] = useState(25);
    const shellDividerRef = useRef(null);
    const fitAddon = new FitAddon();
    const shellRef = useRef(null);
    // pty 终端
    const terminalRef = useRef(null);
    const [shellDrag,setShellDrag] = useState(false);

    const handleDrag = useCallback(lodash.throttle( (event)=> {
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
            props.terminal!.loadAddon(fitAddon)
            fitAddon.fit()
            props.init(props.terminal.rows,props.terminal.cols);
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
    return <div className={"shell"} style={{
        height: `${shellHeight}em`,
        display: `${props.show? 'block' : 'none'}`
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
