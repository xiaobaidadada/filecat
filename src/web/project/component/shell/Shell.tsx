import React, {useCallback, useEffect, useRef, useState} from "react";
import {FitAddon} from "@xterm/addon-fit";
import {Terminal} from "@xterm/xterm";
import '@xterm/xterm/css/xterm.css'
import {copyToClipboard} from "../../util/FunUtil";
import {NotySuccess} from "../../util/noty";
import {use_drag_resize} from "../../util/useDragResize";

export interface ShellProps {
    show:boolean,
    terminal:Terminal,
    init?:(rows:number,cols:number) =>void,
    file_shell_hidden?:boolean,
    get_simple?:boolean,
    rows_clos?:(rows:number,cols:number) => void
}

export default function Shell(props:ShellProps) {
    const [shellHeight,setShellHeight] = useState(25);
    const shellDividerRef = useRef(null);
    // @ts-ignore
    const fitAddon = useCallback(new FitAddon(),[])
    const shellRef = useRef(null);
    // pty 终端
    const terminalRef = useRef(null);

    // 通用拖拽调高：绑 shellRef，32ms 节流，动态上下限（依赖终端字号与分隔条高度）
    const {dragging: shellDrag, on_pointer_down, on_pointer_up} = use_drag_resize({
        direction: "vertical",
        // @ts-ignore
        target_ref: shellRef,
        get_start_size: () => shellHeight,
        px_to_unit: (delta_px) => {
            // @ts-ignore
            const size = parseFloat(getComputedStyle(shellRef.current).fontSize);
            return delta_px / size;
        },
        min: () => {
            // @ts-ignore
            const size = parseFloat(getComputedStyle(shellRef.current).fontSize);
            // @ts-ignore
            return 2.25 + shellDividerRef.current.offsetHeight / size;
        },
        max: () => {
            // @ts-ignore
            const size = parseFloat(getComputedStyle(shellRef.current).fontSize);
            return window.innerHeight / size - 4;
        },
        throttle: 32,
        on_change: (size) => {
            // 每次尺寸变化都刷新终端尺寸
            // @ts-ignore
            fitAddon.fit();
            setShellHeight(parseFloat(size.toFixed(2)));
        },
    });
    useEffect(() => {
        if (props.terminal) {
            props.terminal.options.convertEol = true; // 把 \n 自动作为 \n\r 换行
            props.terminal.open(terminalRef.current);
            // terminal 的尺寸与父元素匹配
            // @ts-ignore
            props.terminal!.loadAddon(fitAddon)
            // @ts-ignore
            fitAddon.fit()
            if (props.init) {
                props.init(props.terminal.rows,props.terminal.cols);
            }
            // 监听键盘事件
            props.terminal.attachCustomKeyEventHandler((event) => {
                // 检测用户是否按下 Ctrl + C
                if (event.ctrlKey && event.key === 'c') {
                    const selectedText = props.terminal.getSelection();
                    if (selectedText) {
                        copyToClipboard(selectedText);
                        NotySuccess("已复制");
                        // 阻止默认的 Ctrl + C 事件（防止它发送中断信号）
                        event.preventDefault();
                        props.terminal.focus();
                        return false;
                    }
                } else if (event.type === "keydown" && event.key === "v" && event.ctrlKey) {
                    return false;
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
    if (!props.show) {
        return ;
    }
    return props.get_simple ? <div className={"pty"} style={{height:'100%'}} ref={terminalRef}/> :<div className={"shell"} style={{
        height: `${shellHeight}em`,
        display: `${props.file_shell_hidden ? 'none' : 'block'}`
    }} ref={shellRef}>
        <div className={"shell__divider"} ref={shellDividerRef} onPointerDown={on_pointer_down}
             onPointerUp={on_pointer_up}/>
        <div className={"pty"} style={{
            height: `${shellHeight - 1}em`,
        }} ref={terminalRef}/>
        {shellDrag &&
            <div
                className="shell__overlay" onPointerUp={on_pointer_up}
            />
        }
    </div>
}
