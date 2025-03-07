import React, {useEffect, useState} from 'react'
import {Terminal} from '@xterm/xterm';

import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
// import {Shell} from "./Shell";
import {ShellInitPojo} from "../../../../common/req/ssh.pojo";

const ShellLazy = React.lazy(() => import("./ShellLazy"))


export function SystemdShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.systemd_shell_show);

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
            scrollSensitivity: 1,
            tabStopWidth: 4,
            convertEol:true // \n换行符
        });
        ws.subscribeUnconnect(close)
        ws.addMsg(CmdType.systemd_logs_getting,(wsData:WsData<SysPojo>)=>{
            // wsData.context=wsData.context.replaceAll(/(?<!\r)\n/, "\r\n")
            if (wsData.context==="error") {
                close();
            }
            terminal.write(wsData.context)
        })
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
        const handleCustomEvent = (event) => {
            // 测试一下事件功能
            ws.unConnect();
        };
        document.addEventListener('cancel_systemd_logs', handleCustomEvent);
        return () => {
            document.removeEventListener('cancel_systemd_logs', handleCustomEvent);
        };
    }, [shellShow])
    useEffect(() => {
        return ()=> {
            close();
        }
    }, []);
    const init = (rows:number,cols:number)=>{
        terminalState.writeln('\x1b[38;2;29;153;243mconnect...\x1b[0m ');
        const pojo = {unit_name:shellShow.unit_name};
        const  data = new WsData(CmdType.systemd_logs_get);
        data.context = pojo;
        ws.send(data)
    }
    return (
        <ShellLazy show={shellShow.show} terminal={terminalState} init={init}/>
    )
}
