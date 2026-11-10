import {Body, Get, JsonController, Post, QueryParam, Req, Res} from "routing-controllers";
import {Response} from "express";
import {Sucess} from "../../other/Result";
import {userService} from "../user/user.service";
import {get_sys_base_url_pre} from "../bin/bin";
import {UserAuth} from "../../../common/req/user.req";
import {mountService} from "./mount.service";
import {FileMountItem} from "./mount.pojo";
import {CredentialItem, CredentialType, MountAccount} from "./credential.pojo";
import {MountDriverType} from "./driver/file_driver";
import {tcpForwardService} from "../net/tcp.forward.server.service";

/** 挂载保存请求体 */
export interface MountSaveReq {
    id?: string;
    driver?: MountDriverType;
    mount_path?: string;
    credential_id?: string;
    /** 引用的子账号 id（一凭据多账号的类型需要：百度、内网穿透） */
    account_id?: string;
    /** 挂载备注；为空时用本地目录名 */
    note?: string;
    root_dir?: string;
    readonly?: boolean;
    color?: string;
    enabled?: boolean;
    /** 转发到对端：该挂载目录下的终端、workflow 等请求在对端 FileCat 执行 */
    forward_to_remote?: boolean;
}

/** 凭据保存请求体：除 id 外的凭据字段都是可选的，按类型填 */
export type CredentialSaveReq = Partial<CredentialItem> & {id?: string};




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

    /** 取凭据列表 */
    @Post("/credential/list")
    async credential_list(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const list = mountService.list_credentials();
        return Sucess(list);
    }

    /** 新增凭据 */
    @Post("/credential/add")
    async credential_add(@Body() body: CredentialSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        if (!body.type) {
            throw new Error("缺少凭据类型");
        }
        const item = mountService.add_credential({
            ...body,
            type: body.type,
            note: body.note ?? "",
            accounts: mountService.normalize_accounts(body.accounts),
            enabled: body.enabled !== false,
        } as Omit<CredentialItem, "id" | "created_at">);
        return Sucess(item);
    }

    /** 修改凭据 */
    @Post("/credential/update")
    async credential_update(@Body() body: CredentialSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        if (!body.id) {
            throw new Error("缺少凭据 id");
        }
        const patch: Partial<CredentialItem> = {...body};
        if (body.accounts !== undefined) {
            patch.accounts = mountService.normalize_accounts(body.accounts);
        }
        return Sucess(mountService.update_credential(body.id, patch));
    }

    /** 删除凭据（仍被挂载引用时会报错） */
    @Post("/credential/delete")
    async credential_delete(@Body() body: {id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.remove_credential(body.id);
        return Sucess(true);
    }

    /** 测试凭据可用性（不保存，直接用传入的凭据试连一次） */
    @Post("/credential/test")
    async credential_test(@Body() body: CredentialSaveReq & {driver?: MountDriverType; account_id?: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        // 凭据测试需要知道用哪个驱动，前端会带上
        return Sucess(await mountService.test_credential({
            type: body.type,
            credential: body,
            driver: body.driver,
            account_id: body.account_id,
        }));
    }

    /**
     * 凭据字段的下拉选项（目前只有 tcp_proxy 的穿透客户端）。
     * 列出所有穿透客户端并标注在线状态：
     * 挂载用的是隧道本身（驱动发 is_filecat 建连），不依赖 open_filecat 那个浏览器入口开关，
     * 所以不按 open_filecat 过滤，只把离线标出来，避免用户以为服务器出错。
     */
    @Post("/credential/options")
    async credential_options(@Body() body: { source: string }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        if (body?.source !== "tcp_client") {
            return Sucess([]);
        }
        const list = tcpForwardService.server_client_get()
            .map(v => {
                const online = Boolean(tcpForwardService.client_num_map[v.client_num_id]);
                const name = v.note || v.client_name || `客户端${v.client_num_id}`;
                return {
                    value: String(v.client_num_id),
                    label: `${name}${online ? "" : "（离线）"}`,
                };
            });
        return Sucess(list);
    }

    /** 内网穿透凭据下的对端账号列表 */
    @Post("/credential/account_list")
    async tcp_proxy_account_list(@Body() body: { credential_id: string }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(mountService.list_accounts(body?.credential_id ?? ""));
    }

    /** 新增 / 修改内网穿透凭据下的对端账号（密码留空表示不修改） */
    @Post("/credential/account_save")
    async tcp_proxy_account_save(@Body() body: {
        credential_id: string;
        account_id?: string;
        note?: string;
        account_name: string;
        password?: string;
    }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const acc = await mountService.save_tcp_proxy_account(body);
        return Sucess({id: acc.id});
    }

    /** 删除内网穿透凭据下的对端账号 */
    @Post("/credential/account_remove")
    async tcp_proxy_account_remove(@Body() body: { credential_id: string; account_id: string }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        await mountService.remove_tcp_proxy_account(body?.credential_id, body?.account_id);
        return Sucess(true);
    }

    /** 验证某个对端账号能否登录（密码错了立刻能看出来） */
    @Post("/credential/account_verify")
    async tcp_proxy_account_verify(@Body() body: {
        credential_id: string;
        account_id: string;
        account_name?: string;
        password?: string;
    }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const cred = mountService.get_credential(body?.credential_id);
        if (!cred) {
            return Sucess({ok: false, error: "凭据不存在"});
        }
        const acc = (cred.accounts ?? []).find(v => v.id === body?.account_id);
        if (!acc) {
            return Sucess({ok: false, error: "账号不存在"});
        }
        // 把要验证的那个账号放进凭据，驱动才能拿到账号密码
        const rs = await mountService.test_credential({
            type: "tcp_proxy",
            credential: {
                tcp_client_num_id: cred.tcp_client_num_id,
                accounts: [{
                    id: acc.id,
                    account_name: body.account_name || acc.account_name,
                    password: body.password || acc.password,
                }],
            },
            account_id: acc.id,
        });
        return Sucess(rs);
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
        return Sucess(mountService.list_raw( ));
    }

    /** 新增挂载 */
    @Post("/add")
    async add(@Body() body: MountSaveReq, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const item = await mountService.add({
            driver: body.driver as MountDriverType,
            mount_path: body.mount_path ?? "",
            credential_id: body.credential_id ?? "",
            account_id: body.account_id,
            note: body.note,
            root_dir: body.root_dir,
            readonly: body.readonly,
            color: body.color,
            enabled: body.enabled !== false,
            forward_to_remote: body.forward_to_remote === true,
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
            "driver", "mount_path", "credential_id", "account_id", "note",
            "root_dir", "readonly", "color", "enabled", "forward_to_remote",
        ];
        for (const k of keys) {
            if (body[k] !== undefined) {
                (patch as any)[k] = body[k];
            }
        }
        return Sucess(await mountService.update(body.id, patch));
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
            account_id: body.account_id,
            root_dir: body.root_dir,
        }));
    }

    /** 列出远程主机上的共享名（SMB 用，供表单下拉选择） */
    @Post("/share/list")
    async share_list(@Body() body: { driver: MountDriverType; credential_id: string; path?: string; account_id?: string }, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.list_shares(body.driver, body.credential_id, body.path, body.account_id));
    }

    // ==================== 百度网盘授权 ====================

    /**
     * 取授权链接。
     * @param body
     * @param r
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
     * @param body
     * @param r
     */
    @Post("/baidu/exchange")
    async baidu_exchange(@Body() body: {id: string; code: string; mode: "one_click" | "oob"}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        const uri = body.mode === "oob" ? "oob" : await this.baidu_callback_url(r);
        return Sucess(await mountService.baidu_exchange_code(body.id, body.code, uri));
    }

    /** 校验某个百度账号 */
    @Post("/baidu/verify")
    async baidu_verify(@Body() body: {id: string; account_id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.baidu_verify(body.id, body.account_id));
    }

    /** 批量校验/刷新全部百度账号 */
    @Post("/baidu/verify/all")
    async baidu_verify_all(@Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        return Sucess(await mountService.baidu_verify_all());
    }

    /** 取消某个百度账号的授权（清 token，保留应用配置与凭据，可重新授权） */
    @Post("/baidu/deauthorize")
    async baidu_deauthorize(@Body() body: {id: string; account_id: string}, @Req() r) {
        userService.have_user_auth(r.headers.authorization, UserAuth.file_mount);
        mountService.baidu_deauthorize(body.id, body.account_id);
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

