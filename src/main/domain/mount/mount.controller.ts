import {Body, Get, JsonController, Post, QueryParam, Req, Res} from "routing-controllers";
import {Response} from "express";
import {Sucess} from "../../other/Result";
import {userService} from "../user/user.service";
import {get_sys_base_url_pre} from "../bin/bin";
import {UserAuth} from "../../../common/req/user.req";
import {mountService} from "./mount.service";
import {FileMountItem} from "./mount.pojo";
import {CredentialItem, CredentialType} from "./credential.pojo";
import {MountDriverType} from "./driver/file_driver";

/** 挂载保存请求体 */
export interface MountSaveReq {
    id?: string;
    driver?: MountDriverType;
    mount_path?: string;
    credential_id?: string;
    name?: string;
    root_dir?: string;
    readonly?: boolean;
    color?: string;
    enabled?: boolean;
}

/** 凭据保存请求体 */
export interface CredentialSaveReq {
    id?: string;
    type?: CredentialType;
    name?: string;
    config?: Record<string, any>;
    enabled?: boolean;
}

/** 取当前请求的用户 id（用于归属） */
function current_user_id(r: any): string | undefined {
    try {
        return userService.get_user_info_by_token(r.headers.authorization)?.user_id;
    } catch (e) {
        return undefined;
    }
}

/** 判断当前请求是否 root 账号 */
function is_root_user(r: any): boolean {
    try {
        return Boolean(userService.get_user_info_by_token(r.headers.authorization)?.is_root);
    } catch (e) {
        return false;
    }
}

/**
 * 目录挂载管理接口。
 *
 * 分两大类：
 *  · 凭据（credential）—— 账号/身份信息，在设置页统一管理，可被多个挂载复用
 *  · 挂载（mount）—— 把本地目录接到某份凭据上
 *
 * 权限说明：这里的接口只管「挂载的配置」，统一用 file_mount 权限；
 * 挂载目录内部的文件读写走 file.controller，用的是原有的文件权限，
 * 所以普通用户只要能访问那个目录就能正常使用挂载，不需要额外授权。
 */
@JsonController("/mount")
export class MountController {

    // ==================== 凭据 ====================

    /** 取凭据列表（密码等敏感字段不返回） */
    @Post("/credential/list")
    async credential_list(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const list = mountService.list_credentials_for_user(current_user_id(r), is_root_user(r));
        return Sucess(list.map(mask_credential));
    }

    /** 取凭据类型元信息（供设置页渲染动态表单） */
    @Post("/credential/meta")
    async credential_meta(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(mountService.credential_metas());
    }

    /** 新增凭据 */
    @Post("/credential/add")
    async credential_add(@Body() body: CredentialSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const item = mountService.add_credential({
            type: body.type as CredentialType,
            name: body.name ?? "",
            config: body.config ?? {},
            enabled: body.enabled !== false,
            user_id: current_user_id(r),
        });
        return Sucess(mask_credential(item));
    }

    /** 修改凭据（config 里留空的字段表示不修改，避免把密码清空） */
    @Post("/credential/update")
    async credential_update(@Body() body: CredentialSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        if (!body.id) {
            throw new Error("缺少凭据 id");
        }
        const patch: Partial<CredentialItem> = {};
        if (body.name !== undefined) {
            patch.name = body.name;
        }
        if (body.config !== undefined) {
            patch.config = body.config;
        }
        if (body.enabled !== undefined) {
            patch.enabled = body.enabled;
        }
        return Sucess(mask_credential(mountService.update_credential(body.id, patch)));
    }

    /** 删除凭据（仍被挂载引用时会报错） */
    @Post("/credential/delete")
    async credential_delete(@Body() body: {id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.remove_credential(body.id);
        return Sucess(true);
    }

    /** 测试凭据可用性（不保存，直接用传入的配置试连一次） */
    @Post("/credential/test")
    async credential_test(@Body() body: CredentialSaveReq & {driver?: MountDriverType}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        // 凭据测试需要知道用哪个驱动，前端会带上
        return Sucess(await mountService.test_credential(body));
    }

    // ==================== 挂载 ====================

    /** 取挂载功能总开关状态（Header 开关用，登录即可读） */
    @Post("/enabled/get")
    async enabled_get(@Req() r) {
        return Sucess(mountService.is_enabled());
    }

    /** 设置挂载功能总开关；关闭后所有挂载立即失效，目录全部按本地处理 */
    @Post("/enabled/set")
    async enabled_set(@Body() body: {enabled: boolean}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.set_enabled(body.enabled !== false);
        return Sucess(mountService.is_enabled());
    }

    /** 取挂载列表（设置页管理用，不受总开关影响） */
    @Post("/list")
    async list(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(mountService.list_for_user(current_user_id(r), is_root_user(r), true));
    }

    /** 取所有可用驱动类型（前端「挂载类型」下拉用） */
    @Post("/driver/list")
    async driver_list(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(mountService.driver_metas());
    }

    /** 新增挂载 */
    @Post("/add")
    async add(@Body() body: MountSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const item = mountService.add({
            driver: body.driver as MountDriverType,
            mount_path: body.mount_path ?? "",
            credential_id: body.credential_id ?? "",
            name: body.name,
            root_dir: body.root_dir,
            readonly: body.readonly,
            color: body.color,
            enabled: body.enabled !== false,
            user_id: current_user_id(r),
        });
        return Sucess(item);
    }

    /** 修改挂载 */
    @Post("/update")
    async update(@Body() body: MountSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        if (!body.id) {
            throw new Error("缺少挂载 id");
        }
        const patch: Partial<FileMountItem> = {};
        const keys: (keyof MountSaveReq)[] = [
            "driver", "mount_path", "credential_id", "name",
            "root_dir", "readonly", "color", "enabled",
        ];
        for (const k of keys) {
            if (body[k] !== undefined) {
                (patch as any)[k] = body[k];
            }
        }
        return Sucess(mountService.update(body.id, patch));
    }

    /** 删除挂载 */
    @Post("/delete")
    async delete(@Body() body: {id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.remove(body.id);
        return Sucess(true);
    }

    /** 测试挂载连接（用挂载表单 + 它引用的凭据试列一次目录） */
    @Post("/test")
    async test(@Body() body: MountSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.test_connection({
            id: body.id,
            driver: body.driver,
            credential_id: body.credential_id,
            root_dir: body.root_dir,
        }));
    }

    /** 列出远程主机上的共享名（SMB 用，供表单下拉选择） */
    @Post("/share/list")
    async share_list(@Body() body: { driver: MountDriverType; config: Record<string, any>; id?: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.list_shares(body.driver, body.config ?? {}, body.id));
    }

    // ==================== 百度网盘授权 ====================

    /**
     * 取授权链接。
     * @param id 百度凭据 id（应用配置已保存在该凭据里）
     * @param mode one_click=回调到 FileCat；oob=手动粘贴授权码
     */
    @Post("/baidu/authorize_url")
    async baidu_authorize_url(@Body() body: {id: string; mode: "one_click" | "oob"}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(mountService.baidu_authorize_url(body.id, body.mode, await this.baidu_callback_url(r)));
    }

    /**
     * 百度 OAuth 回调（一键授权用）。
     * 百度授权后会跳到这里并带上 code，服务端换 token 后重定向回挂载设置页。
     * 注意：这个接口必须能被百度访问到，且地址要与百度控制台登记的回调地址一致。
     * 回调无法带 token，所以用 state 参数把凭据 id 带回来。
     */
    @Get("/baidu/callback")
    async baidu_callback(@QueryParam("code") code: string, @QueryParam("state") state: string,
                         @QueryParam("error") error: string,
                         @QueryParam("error_description") error_description: string,
                         @Res() res: Response) {
        const base = await this.mount_setting_redirect();
        if (error) {
            return res.redirect(`${base}?baidu_auth=failed&reason=${encodeURIComponent(error_description || error)}`);
        }
        if (!code) {
            return res.redirect(`${base}?baidu_auth=failed&reason=${encodeURIComponent("缺少授权码")}`);
        }
        if (!state) {
            return res.redirect(`${base}?baidu_auth=failed&reason=${encodeURIComponent("缺少 state，无法定位凭据")}`);
        }
        try {
            const r = await mountService.baidu_exchange_code(state, code, await this.baidu_callback_url(null));
            return res.redirect(`${base}?baidu_auth=success&name=${encodeURIComponent(r.baidu_name)}`);
        } catch (e) {
            return res.redirect(`${base}?baidu_auth=failed&reason=${encodeURIComponent(e?.message ?? "授权失败")}`);
        }
    }

    /**
     * 手动提交授权码（oob）。
     * @param id 百度凭据 id
     * @param mode 决定换 token 时用的回调地址
     */
    @Post("/baidu/exchange")
    async baidu_exchange(@Body() body: {id: string; code: string; mode: "one_click" | "oob"}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const uri = body.mode === "oob" ? "oob" : await this.baidu_callback_url(r);
        return Sucess(await mountService.baidu_exchange_code(body.id, body.code, uri));
    }

    /** 校验单个百度凭据 */
    @Post("/baidu/verify")
    async baidu_verify(@Body() body: {id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.baidu_verify(body.id));
    }

    /** 批量校验/刷新全部百度凭据 */
    @Post("/baidu/verify/all")
    async baidu_verify_all(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.baidu_verify_all());
    }

    /** 取消授权（清 token，保留凭据，可重新授权） */
    @Post("/baidu/deauthorize")
    async baidu_deauthorize(@Body() body: {id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.baidu_deauthorize(body.id);
        return Sucess(true);
    }

    /** 拼出 FileCat 自己的百度回调地址（用于一键授权，需在百度控制台登记） */
    private async baidu_callback_url(r: any): Promise<string> {
        // 优先用请求头里的 host，这样反向代理下也能拿到外部可访问的地址
        const proto = r.headers?.["x-forwarded-proto"] ?? r.protocol ?? "http";
        const host = r.headers?.["x-forwarded-host"] ?? r.headers?.host;
        const base = await get_sys_base_url_pre();
        return `${proto}://${host}${base}/mount/baidu/callback`;
    }

    /** 授权完成后要跳回的页面路径 */
    private async mount_setting_redirect(): Promise<string> {
        const base = await get_sys_base_url_pre();
        // 前端的挂载设置页路由
        return `${base}/setting/mount_setting/`;
    }
}

/** 凭据脱敏：去掉所有密码类字段，避免返回给前端 */
function mask_credential(item: CredentialItem): CredentialItem & {
    has_password?: boolean;
    authorized?: boolean;
    expired?: boolean;
    obtained_at?: number;
} {
    const SECRET_KEYS = ["password", "private_key", "secret_key"];
    const config: Record<string, any> = {};
    let has_password = false;
    for (const [k, v] of Object.entries(item.config ?? {})) {
        if (SECRET_KEYS.includes(k)) {
            // 只告诉前端「已设置」，不回传实际值（编辑时留空即表示不修改）
            if (v) {
                has_password = true;
            }
            continue;
        }
        // token 属敏感信息，只回传「是否已授权」+ 时间与过期状态
        if (k === "token") {
            continue;
        }
        config[k] = v;
    }
    const token = item.config?.token;
    return {
        ...item,
        config,
        has_password,
        authorized: Boolean(token?.access_token),
        expired: Boolean(token?.access_token && token.expires_at <= Date.now()),
        obtained_at: token?.obtained_at,
    };
}
