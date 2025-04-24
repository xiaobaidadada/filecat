import React, {useCallback, useEffect, useRef, useState} from 'react'
import { Terminal } from '@xterm/xterm';
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
// import {Shell} from "./Shell";
import {ShellInitPojo, SshPojo} from "../../../../common/req/ssh.pojo";
import {joinPaths} from "../../../../common/ListUtil";

const ShellLazy = React.lazy(() => import("./ShellLazy"))

export function RemoteShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.remoteShellShow);
    const [shellShowInit,setShellShowInit] = useState(false);
    const [sshInfo,setSSHInfo] = useRecoilState<any>($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
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

        });
        let handle;
        const handle_msg2 = (context:string)=> {
            terminal.write(context);
        }
        handle = (context: string) => {
            terminal.clear();
            terminal.write(context);
            handle = handle_msg2;
        };
        ws.addMsg(CmdType.remote_shell_getting,(wsData:WsData<SysPojo>)=>{
            handle(wsData.context)
        })
        // 交互效果完全发送到服务器
        terminal.onData(async (data) => {
            const req = new SshPojo();
            req.key = sshInfo.key;
            req.cmd = data;
            const obj = new WsData(CmdType.remote_shell_send);
            obj.context=req;
            await ws.send(obj)
        });
        setTerminalState(terminal)
        // ws.subscribeUnconnect(initTerminal)
    }
    const close = ()=>{
        (async () => {
            if (terminalState) {
                terminalState.dispose();
                setTerminalState(null);
            }
            if(ws.isAilive()) {
                ws.setPromise(async (resolve)=>{
                    // const data = new WsData(CmdType.remote_shell_cancel);
                    // data.context=""
                    // ws.unSubscribeUnconnect();
                    // await ws.send(data);
                    await ws.unConnect();
                    resolve();
                })
            }
        })();
    }
    useEffect(() => {
        return ()=> {
            close();
        }
    }, [])
    useEffect(() => {
        if (!shellShow.show) {
            close();
            return
        }
        if (terminalState) {
            //已经开启了
            // if (shellShowInit) {
            //     const data = new WsData(CmdType.remote_shell_cd);
            //     data.context=shellShow.path
            //     ws.send(data)
            // }
            return;
        }
        initTerminal();
        setShellShowInit(true);
    }, [shellShow])
    const init = (rows:number,cols:number)=>{
        terminalState.writeln('\x1b[38;2;29;153;243mopen shell...\x1b[0m ')
        const data = new WsData(CmdType.remote_shell_open);
        const req = new SshPojo();
        req.key = sshInfo.key;
        // Object.assign(req,sshInfo);
        req.init_path = shellShow.path;
        req.rows = rows;
        req.cols = cols;
        data.context= req;
        ws.send(data)
    }
    return (
        <ShellLazy show={shellShow.show} terminal={terminalState} init={init}/>
    )
}
