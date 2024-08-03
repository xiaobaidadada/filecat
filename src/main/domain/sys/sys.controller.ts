import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Service} from "typedi";
import {Controller, Get} from "routing-controllers";
import {SyserviceImpl} from "./sys.service";
import {SysSystemServiceImpl} from "./sys.sys.service";
import {SysProcessServiceImpl} from "./sys.process.service";
import {SysDockerServiceImpl} from "./sys.docker.service";

@Service()
@Controller("/sys")
export class SysController {

    @Get("/base")
    async get() {
       return SyserviceImpl.getSysIno();
    }

    @Get("/disk")
    async disk() {
        return SyserviceImpl.getDisk();
    }

    @Get("/filedisk")
    async fileDisk() {
        return SyserviceImpl.getFileDisk();
    }

    // 订阅系统信息
    @msg(CmdType.sys_get)
    async sys(data: WsData<any>) {
        await SysSystemServiceImpl.sys(data);
        return ""
    }

    // 取消订阅系统信息
    @msg(CmdType.sys_cancel)
    async sysCancel(data: WsData<any>) {
        await SysSystemServiceImpl.sysCancel(data);
        return ""
    }

    // 订阅docker信息
    @msg(CmdType.docker_get)
    async dockerGet(data: WsData<any>) {
        await SysDockerServiceImpl.dockerGet(data);
        return ""
    }

    @msg(CmdType.docker_cancel)
    async dockerCancel(data: WsData<any>) {
        await SysDockerServiceImpl.dockerCancel(data);
        return ""
    }

    // docker开关
    @msg(CmdType.docker_switch)
    async dockerSwitch(data:WsData<any>) {
        await SysDockerServiceImpl.dockerSwitch(data);
        return "";
    }

    // docker 删除容器
    @msg(CmdType.docker_del_container)
    async dockerDelContainer(data:WsData<any>) {
        await SysDockerServiceImpl.dockerDelContainer(data);
        return "";
    }

    // 订阅进程信息
    @msg(CmdType.process_get)
    async processGet(data: WsData<any>) {
        await SysProcessServiceImpl.processGet(data);
        return ""
    }

    // 取消订阅进程信息
    @msg(CmdType.process_cancel)
    async processCancel(data: WsData<any>) {
        await SysProcessServiceImpl.processCancel(data);
        return ""
    }

    // 关闭订阅进程信息
    @msg(CmdType.process_close)
    async processClose(data: WsData<any>) {
        await SysProcessServiceImpl.processClose(data);
        return ""
    }
}
