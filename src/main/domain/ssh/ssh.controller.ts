import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import { sshService} from "./ssh.service";
import {ShellInitPojo, SshPojo} from "../../../common/req/ssh.pojo";
import {
    Body,
    Controller,
    Ctx,
    Delete,
    Get,
    JsonController,
    Param,
    Post,
    Put,
    Req, Res,
    UploadedFile
} from "routing-controllers";
import {Sucess} from "../../other/Result";
import {NavIndexItem} from "../../../common/req/common.pojo";
import { DataUtil} from "../data/DataUtil";
import multer from "multer";
import {Request, Response} from "express";
import {data_common_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Wss} from "../../../common/frame/ws.server";

@JsonController("/ssh")
export class SSHController {

    // todo 有一个连接，其他用户不需要密码也能连接，以后有权限了可以改一下
    @Post("/start")
    async start(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return Sucess(await sshService.start(body));
    }

    @Post("/close")
    async close(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return Sucess(await sshService.close(body));
    }

    // 获取目录下文件
    @Post("/get/dir")
    async getDir(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return Sucess(await sshService.getDir(body));
    }

    // 获取文本
    @Post("/get/file/text")
    async getFileText(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return sshService.getFileText(body);
    }

    // 更新文本
    @Post("/update/file/text")
    async updateFileText(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return Sucess(await sshService.updateFileText(body));
    }


    // 创建文件夹或者文件
    @Post("/create")
    async create(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        return Sucess(await sshService.create(body));
    }

    // 删除单个文件
    @Post("/delete")
    async deletes(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        await sshService.deletes(body);
        return Sucess("");
    }

    // 移动文件或者文件夹
    @Post("/move")
    async move(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        await sshService.move(body);
        return Sucess("");
    }

    // 复制文件
    @Post("/copy")
    async copy(@Body() body: SshPojo,@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        await sshService.copy(body);
        return Sucess("");
    }

    // 上传文件
    @Put("/")
    async uploadFile(@Req() r: Request, @Res() res: Response,) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        await sshService.uploadFile(r, res);
        return Sucess("1");
    }

    // cmd
    @msg(CmdType.remote_shell_open)
    async open(data: WsData<SshPojo>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.ssh_proxy_tag_update);
        sshService.open(data);
        return ""
    }

    @msg(CmdType.remote_shell_send)
    async send(data: WsData<SshPojo>) {
        userService.check_user_auth((data.wss as Wss).token,UserAuth.ssh_proxy_tag_update);
        sshService.send(data);
        return ""
    }

    // @msg(CmdType.remote_shell_cancel)
    // async cancel(data: WsData<SshPojo>) {
    //     sshService.cancel(data);
    //     return ""
    // }

    // @msg(CmdType.remote_shell_cd)
    // async cd(data: WsData<SshPojo>) {
    //     userService.check_user_auth((data.wss as Wss).token,UserAuth.ssh_proxy_tag_update);
    //     sshService.cd(data);
    //     return ""
    // }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[],@Req() r: Request) {
        userService.check_user_auth(r.headers.authorization,UserAuth.ssh_proxy_tag_update);
        DataUtil.set(data_common_key.navindex_remote_ssh_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get(@Req()r) {
        userService.check_user_auth(r.headers.authorization, UserAuth.ssh_proxy);
        let list = DataUtil.get(data_common_key.navindex_remote_ssh_key);
        return Sucess(list || []);
    }
}
