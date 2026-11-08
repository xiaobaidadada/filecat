import {Body, JsonController, Post, Req} from "routing-controllers";
import {Sucess} from "../../other/Result";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {FileServerType, SmbConfig, SftpConfig, WebdavConfig} from "./file_server.pojo";
import {fileServerService} from "./file_server.service";

/** 文件服务保存请求体：各协议带自己的配置，只有对应 type 的那个有值 */
export interface FileServerSaveReq {
    id?: string;
    type?: FileServerType;
    note?: string;
    enabled?: boolean;
    port?: number;
    readonly?: boolean;

    smb?: SmbConfig;
    webdav?: WebdavConfig;
    sftp?: SftpConfig;
}

/** 请求体 → 存储结构。只保留与 type 匹配的那个协议配置 */
function to_item(body: FileServerSaveReq) {
    const item: any = {
        type: body.type,
        note: body.note ?? "",
        enabled: body.enabled !== false,
        port: Number(body.port),
        readonly: Boolean(body.readonly),
    };
    if (body.type === FileServerType.smb) {
        item.smb = body.smb;
    }
    if (body.type === FileServerType.webdav) {
        item.webdav = body.webdav;
    }
    if (body.type === FileServerType.sftp) {
        item.sftp = body.sftp;
    }
    return item;
}

/**
 * 校验请求方是否拥有「文件服务」权限。
 *
 * 与项目其他 controller 保持一致的写法：直接调 have_user_auth，
 * root 账号自动放行，无权限时抛 "no permission"。
 */
function assert_file_server_auth(r: any) {
    userService.have_user_auth(r.headers.authorization, UserAuth.file_server);
}

/**
 * 文件服务设置接口。
 *
 * 「文件服务」和「网盘挂载」方向相反：
 *   挂载   —— 把远端内容接进本地目录
 *   文件服务 —— 把本地目录以 SMB/WebDAV/SFTP 协议对外提供
 */
@JsonController("/file_server")
export class FileServerController {

    /** 列表 */
    @Post("/list")
    async list(@Req() r) {
        assert_file_server_auth(r);
        const list = fileServerService.list()
            .map(v => ({...v, ...fileServerService.state(v.id)}));
        return Sucess(list);
    }

    /** 新增 */
    @Post("/add")
    async add(@Body() body: FileServerSaveReq, @Req() r) {
        assert_file_server_auth(r);
        const item = fileServerService.add(to_item(body));
        return Sucess(item);
    }

    /**
     * 修改。前端回传整份数据，直接覆盖。
     */
    @Post("/update")
    async update(@Body() body: FileServerSaveReq, @Req() r) {
        assert_file_server_auth(r);
        if (!body.id) {
            throw new Error("id is required");
        }
        const old = fileServerService.get(body.id);
        if (!old) {
            throw new Error("file server not found");
        }

        const item = await fileServerService.update(body.id, to_item(body));
        return Sucess(item);
    }

    /** 删除 */
    @Post("/delete")
    async remove(@Body() body: {id: string}, @Req() r) {
        assert_file_server_auth(r);
        await fileServerService.remove(body.id);
        return Sucess(true);
    }

    /** 启动 */
    @Post("/start")
    async start(@Body() body: {id: string}, @Req() r) {
        assert_file_server_auth(r);
        await fileServerService.start(body.id);
        return Sucess(fileServerService.state(body.id));
    }

    /** 停止 */
    @Post("/stop")
    async stop(@Body() body: {id: string}, @Req() r) {
        assert_file_server_auth(r);
        await fileServerService.stop(body.id);
        return Sucess(fileServerService.state(body.id));
    }
}
