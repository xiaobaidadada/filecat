import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {navindex_remote_ssh_key, sshService} from "./ssh.service";
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
import {DataUtil} from "../data/DataUtil";
import multer from "multer";
import {Request, Response} from "express";

@JsonController("/ssh")
export class SSHController {

    @Post("/start")
    async start(@Body() body: SshPojo) {
        return Sucess(await sshService.start(body));
    }

    @Post("/close")
    async close(@Body() body: SshPojo) {
        return Sucess(await sshService.close(body));
    }

    // 获取目录下文件
    @Post("/get/dir")
    async getDir(@Body() body: SshPojo) {
        return Sucess(await sshService.getDir(body));
    }

    // 获取文本
    @Post("/get/file/text")
    async getFileText(@Body() body: SshPojo) {
        return sshService.getFileText(body);
    }

    // 更新文本
    @Post("/update/file/text")
    async updateFileText(@Body() body: SshPojo) {
        return Sucess(await sshService.updateFileText(body));
    }


    // 创建文件夹或者文件
    @Post("/create")
    async create(@Body() body: SshPojo) {
        return Sucess(await sshService.create(body));
    }

    // 删除单个文件
    @Post("/delete")
    async deletes(@Body() body: SshPojo) {
        await sshService.deletes(body);
        return Sucess("");
    }

    // 移动文件或者文件夹
    @Post("/move")
    async move(@Body() body: SshPojo) {
        await sshService.move(body);
        return Sucess("");
    }

    // 复制文件
    @Post("/copy")
    async copy(@Body() body: SshPojo) {
        await sshService.copy(body);
        return Sucess("");
    }

    // 上传文件
    @Put("/")
    async uploadFile(@Req() req: Request, @Res() res: Response,) {
        await sshService.uploadFile(req, res);
        return Sucess("1");
    }

    // cmd
    @msg(CmdType.remote_shell_open)
    async open(data: WsData<SshPojo>) {
        sshService.open(data);
        return ""
    }

    @msg(CmdType.remote_shell_send)
    async send(data: WsData<SshPojo>) {
        sshService.send(data);
        return ""
    }

    @msg(CmdType.remote_shell_cancel)
    async cancel(data: WsData<SshPojo>) {
        sshService.cancel(data);
        return ""
    }

    @msg(CmdType.remote_shell_cd)
    async cd(data: WsData<SshPojo>) {
        sshService.cd(data);
        return ""
    }

    @Post('/tag/save')
    save(@Body() items: NavIndexItem[]) {
        DataUtil.set(navindex_remote_ssh_key, items);
        return Sucess('ok');
    }

    @Get("/tag")
    get() {
        let list = DataUtil.get(navindex_remote_ssh_key);
        return Sucess(list || []);
    }
}
