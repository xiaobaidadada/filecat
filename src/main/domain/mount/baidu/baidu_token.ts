import axios from "axios";
import {DataUtil} from "../../data/DataUtil";
import {data_common_key} from "../../data/data_type";

/** 百度网盘 OAuth 端点 */
export const BAIDU_OAUTH = {
    authorize: "https://openapi.baidu.com/oauth/2.0/authorize",
    token: "https://openapi.baidu.com/oauth/2.0/token",
    /** 百度网盘需要的全部权限：basic（账号信息）+ netdisk（网盘文件） */
    scope: "basic,netdisk",
};

/** 百度要求所有网盘接口的 User-Agent 固定为这个值 */
const BAIDU_UA = "pan.baidu.com";

/** 持久化的 token 结构 */
export interface BaiduTokens {
    access_token: string;
    refresh_token: string;
    /** access_token 过期时间（毫秒时间戳，已提前 5 分钟算过期） */
    expires_at: number;
    /** 获取时间（毫秒时间戳） */
    obtained_at: number;
}

/**
 * 百度开放平台应用配置（全局唯一一份）。
 * 一个应用下可以授权多个百度账号。
 */
export interface BaiduAppConfig {
    /** 应用名（仅展示用） */
    name?: string;
    /** 百度开放平台的 AppID（仅展示用，OAuth 实际用 app_key） */
    app_id?: string;
    /** OAuth client_id */
    app_key?: string;
    /** OAuth client_secret */
    secret_key?: string;
    /**
     * 回调地址。
     * 一键授权时实际使用后端自动推导的地址（必须指向本服务的 /mount/baidu/callback，需在百度控制台登记）；
     * 手动（oob）模式为 "oob" 或不填。
     */
    redirect_uri?: string;
    /** 授权方式：一键授权（自动跳回）/ 手动授权（粘贴 code） */
    auth_mode?: "one_click" | "oob";
    /** 备注 */
    remark?: string;
    /** 网盘总开关：关闭后所有百度挂载不可用 */
    enabled?: boolean;
    /** 是否自动刷新 token */
    auto_refresh?: boolean;
}

/** 已授权的百度账号（含 token，仅后端使用） */
export interface BaiduAccount {
    /** 百度账号唯一标识（主键） */
    uk: number;
    /** 用户自定义的展示名（不填则回退百度账号名） */
    name?: string;
    /** 百度账号名（uinfo 返回） */
    baidu_name?: string;
    /** 网盘昵称 */
    netdisk_name?: string;
    avatar_url?: string;
    /** 备注 */
    remark?: string;
    /** 该账号是否参与使用 */
    enabled?: boolean;
    token: BaiduTokens;
    created_at?: number;
    updated_at?: number;
}

/** 对外脱敏的账号视图（不含 token） */
export interface PublicBaiduAccount {
    uk: number;
    /** 展示名（用户自定义，为空时前端回退 baidu_name） */
    name: string;
    baidu_name?: string;
    netdisk_name?: string;
    avatar_url?: string;
    remark?: string;
    enabled: boolean;
    /** 是否已完成授权（有 access_token） */
    authorized: boolean;
    /** 是否已过期 */
    expired: boolean;
    /** 过期时间（毫秒时间戳，未授权为 0） */
    expires_at: number;
    /** 授权时间（毫秒时间戳） */
    created_at: number;
    updated_at: number;
}

/** 应用配置（脱敏，不含 secret_key） */
export interface PublicBaiduApp {
    name: string;
    app_id: string;
    app_key: string;
    configured: boolean;
    redirect_uri: string;
    /** 授权方式：一键授权（自动跳回）/ 手动授权（粘贴 code） */
    auth_mode: "one_click" | "oob";
    remark: string;
    enabled: boolean;
    auto_refresh: boolean;
}

/**
 * 百度网盘凭据存储与管理。
 *
 * 结构：全局唯一一份「应用配置」+ 多个「授权账号」。
 * 数据存在 data.json 的 data_common_key 下（与项目其它配置一致）：
 *  · mount_baidu_app     —— 应用配置（app_key / secret_key 等）
 *  · mount_baidu_account —— 已授权账号列表（含 token，明文存储）
 *
 * 注意：refresh_token 是一次性的，刷新后必须保存响应里返回的新 refresh_token。
 */
export class BaiduTokenStore {

    // ==================== 应用配置 ====================

    /** 读取应用配置（含 secret_key，仅后端用） */
    get_app(): BaiduAppConfig | null {
        const v = DataUtil.get<BaiduAppConfig>(data_common_key.mount_baidu_app);
        if (!v?.app_key) {
            return null;
        }
        return v;
    }

    /** 对外脱敏的应用配置视图 */
    get_public_app(): PublicBaiduApp {
        const app = this.get_app();
        return {
            name: app?.name ?? "百度网盘",
            app_id: app?.app_id ?? "",
            app_key: app?.app_key ?? "",
            configured: Boolean(app?.app_key && app?.secret_key),
            redirect_uri: app?.redirect_uri ?? "oob",
            // 历史数据没有 auth_mode 时按 redirect_uri 推断：填了真实回调地址即为一键授权
            auth_mode: app?.auth_mode ?? (app?.redirect_uri && app.redirect_uri !== "oob" ? "one_click" : "oob"),
            remark: app?.remark ?? "",
            enabled: app?.enabled !== false,
            auto_refresh: app?.auto_refresh !== false,
        };
    }

    /** 应用是否配置完整（有 app_key 与 secret_key） */
    is_app_configured(): boolean {
        const app = this.get_app();
        return Boolean(app?.app_key && app?.secret_key);
    }

    /** 网盘总开关是否开启（未配置时视为关闭） */
    is_enabled(): boolean {
        const app = this.get_app();
        return Boolean(app?.app_key && app?.secret_key && app?.enabled !== false);
    }

    /**
     * 保存应用配置。
     * secret_key / app_key 传 undefined 时保留原值，避免编辑时被误清空。
     */
    save_app(data: BaiduAppConfig): void {
        const cur = this.get_app() ?? {};
        const next: BaiduAppConfig = {
            name: data.name ?? cur.name,
            app_id: data.app_id ?? cur.app_id,
            // 空字符串视为「不修改」
            app_key: data.app_key || cur.app_key,
            secret_key: data.secret_key || cur.secret_key,
            // 授权方式与回调地址是绑定的，由 auth_mode 推导 redirect_uri
            auth_mode: data.auth_mode ?? cur.auth_mode ?? "oob",
            redirect_uri: (data.auth_mode ?? cur.auth_mode) === "one_click"
                ? (data.redirect_uri ?? cur.redirect_uri ?? "oob")
                : "oob",
            remark: data.remark ?? cur.remark,
            enabled: data.enabled ?? cur.enabled,
            auto_refresh: data.auto_refresh ?? cur.auto_refresh,
        };
        DataUtil.set(data_common_key.mount_baidu_app, next);
    }

    // ==================== 授权账号 ====================

    /** 读取全部已授权账号（含 token） */
    get_accounts(): BaiduAccount[] {
        return DataUtil.get<BaiduAccount[]>(data_common_key.mount_baidu_account) ?? [];
    }

    private set_accounts(list: BaiduAccount[]): void {
        DataUtil.set(data_common_key.mount_baidu_account, list);
    }

    /** 按 uk 取账号（含 token） */
    get_account(uk: number): BaiduAccount | undefined {
        return this.get_accounts().find(v => v.uk === uk);
    }

    /** 对外脱敏的账号列表 */
    get_public_accounts(): PublicBaiduAccount[] {
        return this.get_accounts().map(a => this.to_public(a));
    }

    /** 仅返回启用中的账号（供挂载选择） */
    get_enabled_public_accounts(): PublicBaiduAccount[] {
        return this.get_public_accounts().filter(a => a.enabled);
    }

    private to_public(a: BaiduAccount): PublicBaiduAccount {
        const now = Date.now();
        return {
            uk: a.uk,
            name: a.name || a.baidu_name || String(a.uk),
            baidu_name: a.baidu_name,
            netdisk_name: a.netdisk_name,
            avatar_url: a.avatar_url,
            remark: a.remark,
            enabled: a.enabled !== false,
            authorized: Boolean(a.token?.access_token),
            expired: Boolean(a.token?.access_token) && (a.token?.expires_at ?? 0) <= now,
            expires_at: a.token?.expires_at ?? 0,
            created_at: a.created_at ?? 0,
            updated_at: a.updated_at ?? 0,
        };
    }

    /**
     * 记录/更新账号身份（授权成功后调用）。
     * 已存在时保留用户自定义的 name / remark，只更新百度侧的信息。
     */
    upsert_account(data: {
        uk: number;
        baidu_name?: string;
        netdisk_name?: string;
        avatar_url?: string;
        token?: BaiduTokens;
    }): void {
        const list = this.get_accounts();
        const now = Date.now();
        const i = list.findIndex(v => v.uk === data.uk);
        if (i >= 0) {
            const old = list[i];
            list[i] = {
                ...old,
                // 用户自定义的展示名优先，不覆盖
                name: old.name,
                baidu_name: data.baidu_name ?? old.baidu_name,
                netdisk_name: data.netdisk_name ?? old.netdisk_name,
                avatar_url: data.avatar_url ?? old.avatar_url,
                token: data.token ?? old.token,
                updated_at: now,
            };
        } else {
            list.push({
                uk: data.uk,
                // 展示名默认留空，由用户自己填；前端会回退到 baidu_name
                name: "",
                baidu_name: data.baidu_name,
                netdisk_name: data.netdisk_name,
                avatar_url: data.avatar_url,
                remark: "",
                enabled: true,
                token: data.token ?? {access_token: "", refresh_token: "", expires_at: 0, obtained_at: 0},
                created_at: now,
                updated_at: now,
            });
        }
        this.set_accounts(list);
    }

    /** 编辑账号（展示名 / 备注 / 是否启用） */
    update_account(uk: number, data: {name?: string; remark?: string; enabled?: boolean}): void {
        const list = this.get_accounts();
        const i = list.findIndex(v => v.uk === uk);
        if (i < 0) {
            throw new Error("账号不存在");
        }
        if (data.name !== undefined) {
            list[i].name = data.name;
        }
        if (data.remark !== undefined) {
            list[i].remark = data.remark;
        }
        if (data.enabled !== undefined) {
            list[i].enabled = data.enabled;
        }
        list[i].updated_at = Date.now();
        this.set_accounts(list);
    }

    /** 删除账号 */
    delete_account(uk: number): void {
        this.set_accounts(this.get_accounts().filter(v => v.uk !== uk));
    }

    /** 写入某账号的 token */
    write_tokens(uk: number, token: BaiduTokens): void {
        const list = this.get_accounts();
        const i = list.findIndex(v => v.uk === uk);
        if (i < 0) {
            return;
        }
        list[i].token = token;
        list[i].updated_at = Date.now();
        this.set_accounts(list);
    }

    /** 清空某账号的 token（标记为未授权，但保留账号记录） */
    clear_tokens(uk: number): void {
        this.write_tokens(uk, {access_token: "", refresh_token: "", expires_at: 0, obtained_at: 0});
    }

    /** 某账号是否已完成授权 */
    is_authorized(uk: number): boolean {
        return Boolean(this.get_account(uk)?.token?.access_token);
    }

    // ==================== OAuth 流程 ====================

    /**
     * 生成「一键授权」链接（回调到 FileCat 自己的接口）。
     * 需要用户在百度控制台把回调地址登记为这个 URL。
     */
    build_authorize_url(state: string, callback_url: string): string {
        const app = this.get_app();
        if (!app?.app_key) {
            throw new Error("请先配置百度网盘应用（AppKey / SecretKey）");
        }
        const params = new URLSearchParams({
            response_type: "code",
            client_id: app.app_key,
            redirect_uri: callback_url,
            scope: BAIDU_OAUTH.scope,
        });
        if (state) {
            params.set("state", state);
        }
        return `${BAIDU_OAUTH.authorize}?${params.toString()}`;
    }

    /**
     * 生成 oob（带外）授权链接。
     * 不依赖回调地址，授权后百度会把 code 显示在页面上，用户复制粘贴回来。
     */
    build_oob_authorize_url(): string {
        const app = this.get_app();
        if (!app?.app_key) {
            throw new Error("请先配置百度网盘应用（AppKey / SecretKey）");
        }
        const params = new URLSearchParams({
            response_type: "code",
            client_id: app.app_key,
            redirect_uri: "oob",
            scope: BAIDU_OAUTH.scope,
        });
        return `${BAIDU_OAUTH.authorize}?${params.toString()}`;
    }

    /**
     * 用授权码换取 token 并绑定账号。
     * @param code 授权码（10 分钟有效，仅能用一次）
     * @param redirect_uri 换 token 时用的回调地址；oob 授权传 "oob"，一键授权传实际回调 URL
     */
    async exchange_code(code: string, redirect_uri?: string): Promise<{uk: number; baidu_name: string}> {
        const app = this.get_app();
        if (!app?.app_key || !app?.secret_key) {
            throw new Error("请先配置百度网盘应用");
        }
        const final_uri = redirect_uri ?? app.redirect_uri ?? "oob";
        const params = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: app.app_key,
            client_secret: app.secret_key,
            redirect_uri: final_uri,
        });
        const data = await this.oauth_request(params);

        const tokens = this.to_tokens(data);
        // 用刚拿到的 token 识别账号身份
        const info = await this.get_uinfo(tokens.access_token);
        if (!info.uk) {
            throw new Error("无法识别授权账号（uinfo 未返回 uk），请重新授权");
        }
        this.upsert_account({
            uk: info.uk,
            baidu_name: info.baidu_name,
            netdisk_name: info.netdisk_name,
            avatar_url: info.avatar_url,
            token: tokens,
        });
        return {uk: info.uk, baidu_name: info.baidu_name ?? String(info.uk)};
    }

    /**
     * 获取某账号可用的 access_token。
     * 过期时：若应用开启了自动刷新则用 refresh_token 续期，否则清空 token 并报错。
     */
    async get_access_token(uk: number): Promise<string> {
        const acc = this.get_account(uk);
        if (!acc) {
            throw new Error(`百度账号 ${uk} 不存在，请重新授权`);
        }
        const t = acc.token;
        if (t?.access_token && t.expires_at > Date.now()) {
            return t.access_token;
        }
        // 过期的处理取决于应用是否开启自动刷新（所有账号统一遵循）
        const app = this.get_app();
        const auto_refresh = app?.auto_refresh !== false;
        if (auto_refresh && t?.refresh_token) {
            const refreshed = await this.refresh(uk, t.refresh_token);
            return refreshed.access_token;
        }
        if (!auto_refresh) {
            this.clear_tokens(uk);
            throw new Error("该应用已关闭 token 自动刷新，授权已过期，请手动重新授权");
        }
        throw new Error("未完成百度授权，请先授权");
    }

    /** 用 refresh_token 刷新（refresh_token 一次性，必须保存新的） */
    private async refresh(uk: number, refresh_token: string): Promise<BaiduTokens> {
        const app = this.get_app();
        if (!app?.app_key || !app?.secret_key) {
            throw new Error("百度网盘应用配置已丢失，请重新配置");
        }
        const params = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id: app.app_key,
            client_secret: app.secret_key,
        });
        try {
            const data = await this.oauth_request(params);
            const tokens = this.to_tokens(data);
            this.write_tokens(uk, tokens);
            return tokens;
        } catch (e) {
            // 刷新失败：清空 token，提示重新授权
            this.clear_tokens(uk);
            throw new Error(`百度 token 刷新失败，请重新授权：${e?.message ?? "未知错误"}`);
        }
    }

    /**
     * 校验某账号的授权是否真实有效（调 uinfo 做活性检测）。
     * 失效时：清空 token 标记为未授权（但保留账号记录）。
     */
    async verify_account(uk: number): Promise<{valid: boolean; error?: string; baidu_name?: string}> {
        try {
            // get_access_token 会顺带在过期时刷新；无效会抛错
            const token = await this.get_access_token(uk);
            const info = await this.get_uinfo(token);
            // 顺便同步一下百度侧的信息（昵称可能变过）
            this.upsert_account({
                uk: info.uk ?? uk,
                baidu_name: info.baidu_name,
                netdisk_name: info.netdisk_name,
                avatar_url: info.avatar_url,
            });
            return {valid: true, baidu_name: info.baidu_name};
        } catch (e) {
            const msg = e?.message ?? "校验失败";
            // 百度明确返回的错误才清 token；网络异常保留，避免误清
            if (/errno\s*=\s*-?\d+/.test(msg) || /errno=-6|授权已失效|重新授权|无法刷新|未完成百度授权/.test(msg)) {
                this.clear_tokens(uk);
            }
            return {valid: false, error: msg};
        }
    }

    /** 调 OAuth token 端点 */
    private async oauth_request(params: URLSearchParams): Promise<any> {
        const res = await axios.get(`${BAIDU_OAUTH.token}?${params.toString()}`, {
            headers: {"User-Agent": BAIDU_UA},
            timeout: 30000,
        });
        const data = res.data ?? {};
        if (data.error || !data.access_token) {
            const msg = data.error_description || data.error || "未知错误";
            if (/authorization code/i.test(msg) || /expired/i.test(msg)) {
                throw new Error(`授权失败（授权码无效或已过期，请重新获取）：${msg}`);
            }
            throw new Error(`授权失败：${msg}`);
        }
        return data;
    }

    /** 调用 uinfo 拿账号信息 */
    async get_uinfo(access_token: string): Promise<{
        uk?: number;
        baidu_name?: string;
        netdisk_name?: string;
        avatar_url?: string;
    }> {
        const res = await axios.get("https://pan.baidu.com/rest/2.0/xpan/nas", {
            params: {method: "uinfo", access_token},
            headers: {"User-Agent": BAIDU_UA},
            timeout: 30000,
        });
        const data = res.data ?? {};
        if (data.errno) {
            throw new Error(`获取百度账号信息失败：errno=${data.errno}`);
        }
        return {
            uk: data.uk,
            baidu_name: data.baidu_name,
            netdisk_name: data.netdisk_name,
            avatar_url: data.avatar_url,
        };
    }

    /** 把百度的 token 响应转成内部结构 */
    private to_tokens(data: any): BaiduTokens {
        const now = Date.now();
        // 默认 30 天；提前 5 分钟视为过期，避免临界失效
        const expires_in = data.expires_in ?? 2592000;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? "",
            expires_at: now + expires_in * 1000 - 5 * 60 * 1000,
            obtained_at: now,
        };
    }
}
