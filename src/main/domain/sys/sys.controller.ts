import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {SyserviceImpl} from "./sys.service";
import {SysSystemServiceImpl, sysWssMap} from "./sys.sys.service";
import {SysProcessServiceImpl} from "./sys.process.service";
import {SysDockerServiceImpl} from "./sys.docker.service";
import {systemd} from "./sys.systemd.service";
import {Sucess} from "../../other/Result";
import {SysCmd, SysCmdExePojo} from "../../../common/req/sys.pojo";
import {userService} from "../user/user.service";
import {Wss} from "../../../common/frame/ws.server";
import {UserAuth} from "../../../common/req/user.req";
import {Request} from "express";
import {FileTypeEnum} from "../../../common/file.pojo";
import {FileServiceImpl} from "../file/file.service";
import {FileUtil} from "../file/FileUtil";

@JsonController("/sys")
export class SysController {

    @Get("/base")
    async get(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return SyserviceImpl.getSysIno();
    }

    @Get("/disk")
    async disk(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return SyserviceImpl.getDisk();
    }

    @Get("/filedisk")
    async fileDisk(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return SyserviceImpl.getFileDisk();
    }

    // 订阅系统信息
    @msg(CmdType.sys_get)
    async sys(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        await SysSystemServiceImpl.sys(data);
        return ""
    }

    @msg(CmdType.sys_cancel)
    async cancel(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        sysWssMap.delete((data.wss as Wss).id)
    }


    // 订阅docker信息
    @msg(CmdType.docker_get)
    async dockerGet(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        await SysDockerServiceImpl.dockerGet(data);
        return ""
    }

    // 所有镜像
    @Get("/docker/images")
    async get_all_images(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysDockerServiceImpl.get_all_images());
    }

    // 删除容器镜像
    @Post("/docker/delete")
    async delete_image(@Body() data: { ids: string[] },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.docker_images_delete);
        await SysDockerServiceImpl.delete_image(data.ids);
        return Sucess("");
    }

    // 检测容器是否能被删除
    @Post("/docker/check/delete")
    async check_image_delete(@Body() data: { ids: string[] },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysDockerServiceImpl.check_image_delete(data.ids));
    }

    // 读取 Docker 代理配置（daemon.json 的 proxies 字段）
    @Get("/docker/config")
    async get_docker_config(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysDockerServiceImpl.get_docker_config());
    }

    // 保存 Docker 配置（daemon.json：proxies + registry-mirrors + insecure-registries + debug + 存储/日志/网络字段，空值表示清除对应项）
    @Post("/docker/config/save")
    async save_docker_config(@Body() data: { http_proxy?: string, https_proxy?: string, no_proxy?: string, registry_mirrors?: string[], insecure_registries?: string[], debug?: boolean, data_root?: string, storage_driver?: string, log_driver?: string, iptables?: boolean, live_restore?: boolean },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        await SysDockerServiceImpl.save_docker_config(data);
        return Sucess("ok");
    }

    // 重启 docker 服务（需要用户二次确认后由前端调用）
    @Post("/docker/restart")
    async restart_docker(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        await SysDockerServiceImpl.restart_docker();
        return Sucess("ok");
    }

    // docker开关
    @msg(CmdType.docker_switch)
    async dockerSwitch(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        userService.check_user_auth((data.wss as Wss).token,UserAuth.docker_container_update);
        await SysDockerServiceImpl.dockerSwitch(data);
        return "";
    }

    // docker 删除容器
    @msg(CmdType.docker_del_container)
    async dockerDelContainer(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        userService.check_user_auth((data.wss as Wss).token,UserAuth.docker_container_update);
        await SysDockerServiceImpl.dockerDelContainer(data);
        return "";
    }

    // 订阅进程信息
    @msg(CmdType.process_get)
    async processGet(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        await SysProcessServiceImpl.processGet(data);
        return ""
    }

    // 关闭订阅进程信息
    @msg(CmdType.process_close)
    async processClose(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        userService.check_user_auth((data.wss as Wss).token,UserAuth.sys_process_close);
        await SysProcessServiceImpl.processClose(data);
        return ""
    }

    // 获取内部 systemd信息
    @msg(CmdType.systemd_inside_get)
    async systemdInsideGet(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        await systemd.systemdInsideGet(data);
        return "";
    }

    @Get("/systemd/allget")
    async getAllSystemd(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await systemd.getAllSystemd());
    }

    @Post("/systemd/add")
    async addAllSystemd(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd);
        await systemd.addSystemd(pojo.unit_name);
        return Sucess(systemd.getAllInsideSystemd());
    }

    @Get("/systemd/inside/all")
    async getInsideAllSystemd(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(systemd.getAllInsideSystemd());
    }

    @Post("/systemd/delete")
    async deleteAllSystemd(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd);
        await systemd.deleteSystemd(pojo.unit_name);
        return Sucess("");
    }

    @Post("/systemd/get/context")
    async get_systemd_context(@Body() pojo: { unit_name: string },@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd);
        return Sucess(await systemd.get_systemd_context(pojo.unit_name));
    }

    @Post("/systemd/sys/delete")
    async delte_systemd(@Body() pojo: { unit_name: string },@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd);
        return Sucess(await systemd.delete_sys_systemd(pojo.unit_name));
    }

    // 保存 systemd 服务文件内容（前端已通过 systemd/get/context 拿到绝对路径 path 一并传回）
    @Post("/systemd/sys/save")
    async save_sys_systemd(@Body() pojo: { unit_name: string, path: string, context: string },@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        userService.check_user_auth(req.headers.authorization,UserAuth.systemd);
        await systemd.save_sys_systemd(pojo.path, pojo.context);
        return Sucess("");
    }

    // 日志
    @msg(CmdType.systemd_logs_get)
    async systemd_logs_get(data: WsData<any>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.all_sys);
        await systemd.systemd_logs_get(data);
        return ""
    }

    // 获取磁盘信息
    @Post("/sys/disk/info")
    async get_disk_info(@Body() pojo: { name: string },@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysSystemServiceImpl.diskSmartctl(pojo.name));
    }

    // 获取块设备信息
    @Get("/disk/blk")
    async get_lsblk_info(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysSystemServiceImpl.get_lsblk_info());
    }

    // 获取卷组相关信息
    @Get("/disk/lvm")
    async get_lvm_info(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        return Sucess(await SysSystemServiceImpl.get_lvm_info());
    }

    // 执行特定系统上的命令
    @Post("/cmd/exe")
    async cmd_exe(@Body() pojo: SysCmdExePojo,@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.all_sys);
        if(pojo.type === SysCmd.mount) {
            userService.check_user_auth(req.headers.authorization,UserAuth.sys_disk_mount);
        }
        await SysSystemServiceImpl.cmd_exe(pojo);
        return Sucess("");
    }

    // 获取系统时间
    @Get("/sys_time/get")
    async get_sys_time(@Req()req) {
        const now = new Date();
        const timestamp = now.getTime(); // 毫秒时间戳
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // 系统时区，比如 Asia/Shanghai
        return Sucess({
            timezone,
            timestamp,
        })
    }


    @Get("/get_fstab")
    async getFstab(@Req() ctx) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.sys_disk_mount);
        const buffer = await FileUtil.readFileSync("/etc/fstab");
        const pojo = Sucess(buffer.toString());
        pojo.message = "fstab";
        return pojo;
    }

    @Post("/save_fstab")
    async save_fstab(@Req() ctx, @Body() data: any) {
        userService.check_user_auth(ctx.headers.authorization, UserAuth.sys_disk_mount);
        await FileUtil.writeFileSync("/etc/fstab", data.content);
        return Sucess("")
    }
}
