import React, {useCallback, useEffect, useRef, useState} from 'react'
import { Terminal } from '@xterm/xterm';
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Shell} from "./Shell";

export function FileShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.fileShellShow);
    const [shellShowInit,setShellShowInit] = useState(false);

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

        });
        terminal.writeln('\x1b[38;2;29;153;243mopen shell...\x1b[0m ')
        const data = new WsData(CmdType.shell_send);
        data.context=shellShow.path
        await ws.send(data)
        ws.addMsg(CmdType.shell_getting,(wsData:WsData<SysPojo>)=>{
            terminal.write(wsData.context)
        })
        // 交互效果完全发送到服务器
        terminal.onData(async (data) => {
            const obj = new WsData(CmdType.shell_send);
            obj.context=data;
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
                    const data = new WsData(CmdType.shell_cancel);
                    data.context=""
                    ws.unSubscribeUnconnect();
                    await ws.send(data);
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
            if (shellShowInit) {
                const data = new WsData(CmdType.shell_cd);
                data.context=shellShow.path
                ws.send(data)
            }
            return;
        }
        initTerminal();
        setShellShowInit(true);
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
