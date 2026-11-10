import React, {useEffect, useState} from 'react'
import {Terminal} from '@xterm/xterm';
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
// import {Shell} from "./Shell";
import {ShellInitPojo} from "../../../../common/req/ssh.pojo";
import {copyToClipboard} from "../../util/FunUtil";
import {get_user_now_pwd, isAbsolutePath, to_remote_dir_path} from "../file/FileUtil";

const ShellLazy = React.lazy(() => import("./ShellLazy"))


export default function FileShell(props) {
    const [terminalState,setTerminalState] = useState(null)
    const [shellShow,setShellShow] = useAtom($stroe.fileShellShow);
    const [current_mount] = useAtom($stroe.current_mount);
    const [file_shell_hidden,set_file_shell_hidden] = useAtom($stroe.file_shell_hidden);
    const [userInfo, setUserInfo] = useAtom($stroe.user_base_info);
    const color =  userInfo.user_data.theme?.includes("dark")?"#FFFFFF":"#000000";
    /** 挂在 SSH 挂载目录下时，终端直连对端主机（走驱动的 ssh shell），不走本机 pty */
    const ssh_mount = current_mount?.driver === "sftp";
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
        await ws.addMsg(CmdType.shell_getting,(wsData:WsData<SysPojo>)=>{
            handle(wsData.context);
        })
        await ws.addMsg(CmdType.mount_ssh_shell_getting,(wsData:WsData<SysPojo>)=>{
            handle(wsData.context);
        })
        await ws.addMsg(CmdType.shell_copy,(wsData:WsData<SysPojo>)=>{
            if(wsData.context)
            copyToClipboard(wsData.context);
            terminal.focus()
        })
        // 交互效果完全发送到服务器
        terminal.onData(async (data) => {
            if (ssh_mount) {
                const obj = new WsData(CmdType.mount_ssh_shell_send);
                obj.context = {cmd: data};
                await ws.send(obj)
                return;
            }
            const obj = new WsData(CmdType.shell_send);
            obj.context=data;
            await ws.send(obj)
        });
        setTerminalState(terminal)
        // ws.subscribeUnconnect(initTerminal)
    }
    const close = ()=>{
        terminalState?.dispose();
        setTerminalState(null);
    }
    useEffect(() => {
        return ()=> {
            close();
        }
    }, [])
    useEffect(() => {
        if (!shellShow.show) {
            close();
            // 关闭时结束服务端那条 shell，避免远端会话残留（context 为空即关闭）
            if (ssh_mount) {
                ws.send(new WsData(CmdType.mount_ssh_shell_open));
            }
            return
        }
        if (terminalState) {
            if(shellShow.cmd) {
                ws.sendData(ssh_mount ? CmdType.mount_ssh_shell_send : CmdType.shell_send, {cmd: shellShow.cmd});
            }
            return;
        } else {
            initTerminal();
        }
    }, [shellShow])
    const init = (rows:number,cols:number)=>{
        terminalState.writeln('\x1b[38;2;29;153;243mopen shell...\x1b[0m ')
        const data = new WsData(ssh_mount ? CmdType.mount_ssh_shell_open : CmdType.shell_open);
        const pojo = new ShellInitPojo();
        // 本地终端在服务器上解析路径，需要挂载点前缀；
        // SSH 挂载终端由驱动自己换算成远端路径，但传的必须是绝对路径，
        // 而 shellShow.path 是前端 URL 路径（相对用户根目录），这里按后端同款规则拼上根目录
        let init_path = shellShow.path;
        if (ssh_mount && !isAbsolutePath(init_path)) {
            const root_path = get_user_now_pwd(userInfo.user_data);
            init_path = `${root_path.replace(/[\\/]+$/, "")}/${init_path.replace(/^[\\/]+/, "")}`;
        }
        pojo.init_path = ssh_mount ? init_path : to_remote_dir_path(shellShow.path, current_mount);
        pojo.rows = rows;
        pojo.cols = cols;
        pojo.http_token = localStorage.getItem('token');

        data.context= pojo;
        ws.send(data)
        if(shellShow.cmd) {
            ws.sendData(ssh_mount ? CmdType.mount_ssh_shell_send : CmdType.shell_send, shellShow.cmd);
        }
    }
    return (
        <ShellLazy show={shellShow.show} file_shell_hidden={file_shell_hidden} terminal={terminalState} init={init}/>
    )
}
