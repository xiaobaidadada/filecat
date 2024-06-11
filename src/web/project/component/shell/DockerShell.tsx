import React, {useEffect, useState} from 'react'
import {Terminal} from '@xterm/xterm';

import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Shell} from "./Shell";

export function DockerShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.dockerShellShow);

    const initTerminal =  async () => {
        const terminal = new Terminal({
            // fontSize: 15,
            // fontWeight: 900,
            fontFamily: "Monaco, Menlo, Consolas, 'Courier New', monospace",
            theme: {
                background: '#FFFFFF',
                foreground: '#000000',
                cursor:'#000000',
                selectionBackground:"#a6d2ff"
            },
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 1000,
            scrollSensitivity: 15,
            tabStopWidth: 4,
            convertEol:true // \n换行符
        });
        terminal.writeln('\x1b[38;2;29;153;243mconnect...\x1b[0m ')
        const data = new WsData(shellShow.type==="logs"?CmdType.docker_shell_logs:CmdType.docker_shell_exec);
        data.context=shellShow.dockerId;
        await ws.send(data)
        ws.subscribeUnconnect(close)
        ws.addMsg(shellShow.type==="logs"?CmdType.docker_shell_logs_getting:CmdType.docker_shell_exec_getting,(wsData:WsData<SysPojo>)=>{
            // wsData.context=wsData.context.replaceAll(/(?<!\r)\n/, "\r\n")
            if (wsData.context==="error") {
                close();
            }
            terminal.write(wsData.context)
        })
        // 交互效果完全发送到服务器
        if (shellShow.type==="exec") {
            terminal.onData(async (data) => {
                const obj = new WsData(CmdType.docker_shell_exec);
                obj.context=data;
                await ws.send(obj)
            });
        }
        setTerminalState(terminal)
    }
    const close = ()=>{
        (async () => {

            if (terminalState) {
                terminalState.writeln('\x1b[38;2;29;153;243mclose!\x1b[0m ')
                terminalState.dispose();
                setTerminalState(null);
            }
        })();
    }
    useEffect(() => {
        if (!shellShow.show) {
            close();
            return
        }
        initTerminal();
    }, [shellShow])
    useEffect(() => {
        return ()=> {
            close();
        }
    }, []);
    return (
        <Shell show={shellShow.show} terminal={terminalState}/>
    )
}
