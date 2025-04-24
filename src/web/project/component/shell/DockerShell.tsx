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


export function DockerShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.dockerShellShow);
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const color =  userInfo.user_data.theme === "dark"?"#FFFFFF":"#000000";
    const initTerminal =  async () => {
        const terminal = new Terminal({
            // fontSize: 15,
            // fontWeight: 900,
            fontFamily: "Monaco, Menlo, Consolas, 'Courier New', monospace",
            theme: {
                background: '#FFFFFF',
                foreground: color,
                cursor:color,
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
        let handle;
        const handle_msg2 = (context:string)=> {
            terminal.write(context);
        }
        handle = (context: string) => {
            terminal.clear();
            terminal.write(context);
            handle = handle_msg2;
        };
        ws.addMsg(shellShow.type==="logs"?CmdType.docker_shell_logs_getting:CmdType.docker_shell_exec_getting,(wsData:WsData<SysPojo>)=>{
            // wsData.context=wsData.context.replaceAll(/(?<!\r)\n/, "\r\n")
            if (wsData.context==="error") {
                close();
            }
            handle(wsData.context)
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
    const init = (rows:number,cols:number)=>{

        terminalState.writeln('\x1b[38;2;29;153;243mconnect...\x1b[0m ');
        const pojo = new ShellInitPojo();
        pojo.rows = rows;
        pojo.cols = cols;
        pojo.dockerId = shellShow.dockerId;
        let data :any;
        if (shellShow.type==="logs") {
            data = new WsData(CmdType.docker_shell_logs);
        } else {
            data = new WsData(CmdType.docker_shell_exec_open);
        }
        data.context = pojo;
        ws.send(data)
    }
    return (
        <ShellLazy show={shellShow.show} terminal={terminalState} init={init}/>
    )
}
