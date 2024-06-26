import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {shellServiceImpl} from "./shell.service";
import {ShellInitPojo} from "../../../common/req/ssh.pojo";


export class ShellController {

    @msg(CmdType.shell_open)
    async open(data:WsData<ShellInitPojo>) {
        shellServiceImpl.open(data);
        return ""
    }
    @msg(CmdType.shell_send)
    async send(data:WsData<any>) {
        shellServiceImpl.send(data);
        return ""
    }
    @msg(CmdType.shell_cancel)
    async cancel(data:WsData<any>) {
        shellServiceImpl.cancel(data);
        return ""
    }
    @msg(CmdType.shell_cd)
    async cd(data:WsData<any>) {
        shellServiceImpl.cd(data);
        return ""
    }


    // 日志
    @msg(CmdType.docker_shell_logs)
    async dockerShellLogs(data:WsData<any>) {
        await shellServiceImpl.dockerShellLogs(data);
        return ""
    }
    @msg(CmdType.docker_shell_logs_cancel)
    async dockerShellLogs_cancel(data:WsData<any>) {
        shellServiceImpl.dockerShellLogs_cancel(data);
        return ""
    }

    // 进入exec执行
    @msg(CmdType.docker_shell_exec_open)
    async dockerShellExecOpen(data:WsData<ShellInitPojo>) {
        await shellServiceImpl.dockerShellExecOpen(data);
        return "";
    }
    @msg(CmdType.docker_shell_exec)
    async dockerShellExec(data:WsData<any>) {
        await shellServiceImpl.dockerShellExec(data);
        return "";
    }
    @msg(CmdType.docker_shell_exec_cancel)
    async dockerShellExecCancel(data:WsData<any>) {
        shellServiceImpl.dockerShellExecCancel(data);
        return "";
    }


}
