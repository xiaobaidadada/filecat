import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Service} from "typedi";
import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {SyserviceImpl} from "./sys.service";
import {SysSystemServiceImpl} from "./sys.sys.service";
import {SysProcessServiceImpl} from "./sys.process.service";
import {SysDockerServiceImpl} from "./sys.docker.service";
import {systemd} from "./sys.systemd.service";
import {Sucess} from "../../other/Result";
import {SysCmd, SysCmdExePojo} from "../../../common/req/sys.pojo";
import {userService} from "../user/user.service";
import {Wss} from "../../../common/frame/ws.server";
import {UserAuth} from "../../../common/req/user.req";
import {Request} from "express";

@Service()
@JsonController("/sys")
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


    // 订阅docker信息
    @msg(CmdType.docker_get)
    async dockerGet(data: WsData<any>) {
        await SysDockerServiceImpl.dockerGet(data);
        return ""
    }

    // 所有镜像
    @Get("/docker/images")
    async get_all_images() {
        return Sucess(SysDockerServiceImpl.get_all_images());
    }

    // 删除容器镜像
    @Post("/docker/delete")
    async delete_image(@Body() data: { ids: string[] },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.docker_images_delete);
        await SysDockerServiceImpl.delete_image(data.ids);
        return Sucess("");
    }

    // 检测容器是否能被删除
    @Post("/docker/check/delete")
    async check_image_delete(@Body() data: { ids: string[] }) {
        return Sucess(await SysDockerServiceImpl.check_image_delete(data.ids));
    }

    // docker开关
    @msg(CmdType.docker_switch)
    async dockerSwitch(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.docker_container_update);
        await SysDockerServiceImpl.dockerSwitch(data);
        return "";
    }

    // docker 删除容器
    @msg(CmdType.docker_del_container)
    async dockerDelContainer(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.docker_container_update);
        await SysDockerServiceImpl.dockerDelContainer(data);
        return "";
    }

    // 订阅进程信息
    @msg(CmdType.process_get)
    async processGet(data: WsData<any>) {
        await SysProcessServiceImpl.processGet(data);
        return ""
    }

    // 关闭订阅进程信息
    @msg(CmdType.process_close)
    async processClose(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.sys_process_close);
        await SysProcessServiceImpl.processClose(data);
        return ""
    }

    // 获取内部 systemd信息
    @msg(CmdType.systemd_inside_get)
    async systemdInsideGet(data: WsData<any>) {
        await systemd.systemdInsideGet(data);
        return "";
    }

    @Get("/systemd/allget")
    async getAllSystemd() {
        return Sucess(systemd.getAllSystemd());
    }

    @Post("/systemd/add")
    async addAllSystemd(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd_update);
        await systemd.addSystemd(pojo.unit_name);
        return Sucess(systemd.getAllInsideSystemd());
    }

    @Get("/systemd/inside/all")
    async getInsideAllSystemd() {
        return Sucess(systemd.getAllInsideSystemd());
    }

    @Post("/systemd/delete")
    async deleteAllSystemd(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd_update);
        await systemd.deleteSystemd(pojo.unit_name);
        return Sucess("");
    }

    @Post("/systemd/get/context")
    async get_systemd_context(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd_update);
        return Sucess(await systemd.get_systemd_context(pojo.unit_name));
    }

    @Post("/systemd/sys/delete")
    async delte_systemd(@Body() pojo: { unit_name: string }) {
        return Sucess(await systemd.delete_sys_systemd(pojo.unit_name));
    }

    // 日志
    @msg(CmdType.systemd_logs_get)
    async systemd_logs_get(data: WsData<any>) {
        await systemd.systemd_logs_get(data);
        return ""
    }

    // 获取磁盘信息
    @Post("/sys/disk/info")
    async get_disk_info(@Body() pojo: { name: string }) {
        return Sucess(await SysSystemServiceImpl.diskSmartctl(pojo.name));
    }

    // 获取块设备信息
    @Get("/disk/blk")
    async get_lsblk_info() {
        return Sucess(SysSystemServiceImpl.get_lsblk_info());
    }

    // 获取卷组相关信息
    @Get("/disk/lvm")
    async get_lvm_info() {
        return Sucess(SysSystemServiceImpl.get_lvm_info());
    }

    // 执行特定系统上的命令
    @Post("/cmd/exe")
    async cmd_exe(@Body() pojo: SysCmdExePojo,@Req()req) {
        if(pojo.type === SysCmd.mount) {
            userService.check_user_auth(req.headers.authorization,UserAuth.sys_disk_mount);
        }
        await SysSystemServiceImpl.cmd_exe(pojo);
        return Sucess("");
    }

    // 获取系统时间
    @Get("/sys_time/get")
    async get_sys_time() {
        const now = new Date();
        const timestamp = now.getTime(); // 毫秒时间戳
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // 系统时区，比如 Asia/Shanghai
        return Sucess({
            timezone,
            timestamp,
        })
    }
}
