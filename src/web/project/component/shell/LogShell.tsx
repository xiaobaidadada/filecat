import React, {useEffect, useState} from 'react'
import {Terminal} from '@xterm/xterm';

import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Shell} from "./Shell";
import {ShellInitPojo} from "../../../../common/req/ssh.pojo";
import Header from "../../../meta/component/Header";
import {ActionButton} from "../../../meta/component/Button";

export default function LogShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useRecoilState($stroe.log_viewer);

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
        terminal.clear();

        for (let i = 0; i < 2000; i++) {
            const lineNumberText = `\x1b[48;2;232;232;232m${i}:\x1b[0m`;
            terminal.write(`${lineNumberText} ${`第${i}行0000000000000000000000000000000000000000000000000`}\n`);
        }
        terminal.onData(async (data) => {
            console.log(data);
        });
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
    }
    if (!shellShow.show) {
        return ;
    }
    return <div id={'editor-container'}>
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={()=>{setShellShow({show: false})}}/>]}>
        </Header>
        <div style={{height:`100%`}}>
            <Shell show={shellShow.show} terminal={terminalState} init={init} get_simple={true}/>
        </div>
    </div>
}
