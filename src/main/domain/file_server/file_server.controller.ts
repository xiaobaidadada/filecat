import {Body, JsonController, Post, Req} from "routing-controllers";
import {Sucess} from "../../other/Result";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {FileServerItem, FileServerType} from "./file_server.pojo";
import {fileServerService} from "./file_server.service";

/** 文件服务保存请求体 */
export interface FileServerSaveReq {
    id?: string;
    type?: FileServerType;
    note?: string;
    enabled?: boolean;
    port?: number;
    root_path?: string;
    readonly?: boolean;

    sftp_username?: string;
    sftp_password?: string;

    webdav_username?: string;
    webdav_password?: string;
    smb_share_name?: string;
    smb_hostname?: string;
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
 * 把密码类字段换成布尔标记，不把明文下发给前端。
 * 前端编辑时留空表示不修改。
 */
function mask_secret(item: FileServerItem): any {
    const out: any = {...item};
    if (item.type === FileServerType.sftp) {
        out.sftp_has_password = Boolean(item.sftp_password);
        delete out.sftp_password;
    }
    if (item.type === FileServerType.webdav) {
        out.webdav_has_password = Boolean(item.webdav_password);
        delete out.webdav_password;
    }
    return out;
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
            .map(v => ({...mask_secret(v), ...fileServerService.state(v.id)}));
        return Sucess(list);
    }

    /** 新增 */
    @Post("/add")
    async add(@Body() body: FileServerSaveReq, @Req() r) {
        assert_file_server_auth(r);
        const item = fileServerService.add({
            type: body.type as FileServerType,
            note: body.note ?? "",
            enabled: body.enabled !== false,
            port: Number(body.port),
            root_path: body.root_path ?? "",
            readonly: Boolean(body.readonly),
            sftp_username: body.sftp_username,
            sftp_password: body.sftp_password,
            webdav_username: body.webdav_username,
            webdav_password: body.webdav_password,
            smb_share_name: body.smb_share_name,
            smb_hostname: body.smb_hostname,
        });
        return Sucess(mask_secret(item));
    }

    /**
     * 修改。
     * 密码类字段为空字符串时保持原值（和凭据编辑的约定一致）。
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

        const patch: Partial<FileServerItem> = {};
        const copy = <K extends keyof FileServerItem>(k: K) => {
            const v = body[k as keyof FileServerSaveReq];
            if (v !== undefined && v !== "") {
                (patch as any)[k] = v;
            }
        };

        copy("type");
        copy("note");
        copy("port");
        copy("root_path");
        copy("sftp_username");
        copy("sftp_password");
        copy("webdav_username");
        copy("webdav_password");
        copy("smb_share_name");
        copy("smb_hostname");
        if (body.port !== undefined) {
            patch.port = Number(body.port);
        }
        if (body.enabled !== undefined) {
            patch.enabled = body.enabled;
        }
        if (body.readonly !== undefined) {
            patch.readonly = body.readonly;
        }

        const item = await fileServerService.update(body.id, patch);
        return Sucess(mask_secret(item));
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
