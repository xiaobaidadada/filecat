import axios from "axios";
import {DataUtil} from "../../data/DataUtil";
import {data_common_key} from "../../data/data_type";
import {CredentialItem} from "../credential.pojo";

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
 * 百度网盘凭据的 config 结构。
 * 一条 baidu 凭据 = 一份应用配置 + 一个已授权账号。
 */
export interface BaiduCredConfig {
    /** 百度开放平台的 AppID（仅展示用，OAuth 实际用 app_key） */
    app_id?: string;
    /** OAuth client_id */
    app_key?: string;
    /** OAuth client_secret */
    secret_key?: string;
    /** 备注 */
    remark?: string;
    /** 百度账号唯一标识（授权成功后写入） */
    uk?: number;
    /** 百度账号名（uinfo 返回） */
    baidu_name?: string;
    /** 网盘昵称 */
    netdisk_name?: string;
    avatar_url?: string;
    token?: BaiduTokens;
}

const EMPTY_TOKEN: BaiduTokens = {access_token: "", refresh_token: "", expires_at: 0, obtained_at: 0};

/**
 * 百度网盘凭据管理。
 *
 * 一条 baidu 凭据存在 data_common_key.mount_credential_list 里，config 即 BaiduCredConfig：
 *  · 第 1 步填 app_id / app_key / secret_key
 *  · 第 2 步 OAuth 授权后写入 uk / baidu_name / token
 *
 * 注意：refresh_token 是一次性的，刷新后必须保存响应里返回的新 refresh_token。
 */
export class BaiduTokenStore {

    /** 凭据 id；为空表示「尚未落库的新凭据」，此时配置只存在于内存里 */
    private readonly cred_id: string;

    constructor(cred_id?: string) {
        this.cred_id = cred_id ?? "";
    }

    // ==================== 凭据读写 ====================

    /** 读取本条凭据（含 secret_key，仅后端用） */
    private get_item(): CredentialItem | undefined {
        if (!this.cred_id) {
            return undefined;
        }
        const list = DataUtil.get<CredentialItem[]>(data_common_key.mount_credential_list) ?? [];
        const item = list.find(v => v.id === this.cred_id);
        if (!item || item.type !== "baidu") {
            return undefined;
        }
        return item;
    }

    /** 取 config */
    get_config(): BaiduCredConfig {
        return (this.get_item()?.config ?? {}) as BaiduCredConfig;
    }

    /** 局部更新 config；config 里传空字符串的字段保留旧值（避免编辑时误清空密码） */
    private patch_config(patch: Partial<BaiduCredConfig>): void {
        const item = this.get_item();
        if (!item) {
            throw new Error("百度网盘凭据不存在");
        }
        const list = DataUtil.get<CredentialItem[]>(data_common_key.mount_credential_list) ?? [];
        const i = list.findIndex(v => v.id === this.cred_id);
        const config = {...item.config};
        for (const [k, v] of Object.entries(patch)) {
            if (v === "" || v === undefined) {
                continue;
            }
            config[k] = v;
        }
        list[i] = {...item, config};
        DataUtil.set(data_common_key.mount_credential_list, list);
    }

    /** 应用配置是否完整（有 app_key 与 secret_key） */
    is_app_configured(): boolean {
        const c = this.get_config();
        return Boolean(c.app_key && c.secret_key);
    }

    /** 是否已完成授权 */
    is_authorized(): boolean {
        return Boolean(this.get_config().token?.access_token);
    }

    // ==================== OAuth 流程 ====================

    /**
     * 生成「一键授权」链接（回调到 FileCat 自己的接口）。
     * 需要用户在百度控制台把回调地址登记为这个 URL。
     */
    build_authorize_url(state: string, callback_url: string): string {
        const c = this.get_config();
        if (!c.app_key) {
            throw new Error("请先配置百度网盘应用（AppKey / SecretKey）");
        }
        const params = new URLSearchParams({
            response_type: "code",
            client_id: c.app_key,
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
        const c = this.get_config();
        if (!c.app_key) {
            throw new Error("请先配置百度网盘应用（AppKey / SecretKey）");
        }
        const params = new URLSearchParams({
            response_type: "code",
            client_id: c.app_key,
            redirect_uri: "oob",
            scope: BAIDU_OAUTH.scope,
        });
        return `${BAIDU_OAUTH.authorize}?${params.toString()}`;
    }

    /**
     * 用授权码换取 token 并写入本条凭据。
     * @param code 授权码（10 分钟有效，仅能用一次）
     * @param redirect_uri 换 token 时用的回调地址，必须与生成授权链接时一致；oob 授权传 "oob"
     */
    async exchange_code(code: string, redirect_uri: string): Promise<{uk: number; baidu_name: string}> {
        const c = this.get_config();
        if (!c.app_key || !c.secret_key) {
            throw new Error("请先配置百度网盘应用");
        }
        const params = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: c.app_key,
            client_secret: c.secret_key,
            redirect_uri,
        });
        const data = await this.oauth_request(params);

        const tokens = this.to_tokens(data);
        // 用刚拿到的 token 识别账号身份
        const info = await this.get_uinfo(tokens.access_token);
        if (!info.uk) {
            throw new Error("无法识别授权账号（uinfo 未返回 uk），请重新授权");
        }
        this.patch_config({
            uk: info.uk,
            baidu_name: info.baidu_name,
            netdisk_name: info.netdisk_name,
            avatar_url: info.avatar_url,
            token: tokens,
        });
        return {uk: info.uk, baidu_name: info.baidu_name ?? String(info.uk)};
    }

    /**
     * 取本条凭据可用的 access_token。
     * 过期时用 refresh_token 续期；没有 refresh_token 说明从未授权，报错让用户去授权。
     */
    async get_access_token(): Promise<string> {
        const t = this.get_config().token;
        if (t?.access_token && t.expires_at > Date.now()) {
            return t.access_token;
        }
        if (t?.refresh_token) {
            const refreshed = await this.refresh(t.refresh_token);
            return refreshed.access_token;
        }
        throw new Error("未完成百度授权，请先授权");
    }

    /** 用 refresh_token 刷新（refresh_token 一次性，必须保存新的） */
    /**
     * 强制刷新：本地判断可能因时钟偏差失效，接口报 token 无效时用这个重试。
     */
    async force_refresh(): Promise<string> {
        const t = this.get_config().token;
        if (!t?.refresh_token) {
            throw new Error("未完成百度授权，请先授权");
        }
        const refreshed = await this.refresh(t.refresh_token);
        return refreshed.access_token;
    }

    private async refresh(refresh_token: string): Promise<BaiduTokens> {
        const c = this.get_config();
        if (!c.app_key || !c.secret_key) {
            throw new Error("百度网盘应用配置已丢失，请重新配置");
        }
        const params = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id: c.app_key,
            client_secret: c.secret_key,
        });
        try {
            const data = await this.oauth_request(params);
            const tokens = this.to_tokens(data);
            this.patch_config({token: tokens});
            return tokens;
        } catch (e) {
            // 刷新失败：清空 token，提示重新授权
            this.clear_tokens();
            throw new Error(`百度 token 刷新失败，请重新授权：${e?.message ?? "未知错误"}`);
        }
    }

    /**
     * 校验授权是否真实有效（调 uinfo 做活性检测）。
     * 失效时：清空 token 标记为未授权（但保留凭据）。
     */
    async verify(): Promise<{valid: boolean; error?: string; baidu_name?: string}> {
        try {
            // get_access_token 会顺带在过期时刷新；无效会抛错
            const token = await this.get_access_token();
            const info = await this.get_uinfo(token);
            // 顺便同步一下百度侧的信息（昵称可能变过）
            this.patch_config({
                baidu_name: info.baidu_name,
                netdisk_name: info.netdisk_name,
                avatar_url: info.avatar_url,
            });
            return {valid: true, baidu_name: info.baidu_name};
        } catch (e) {
            const msg = e?.message ?? "校验失败";
            // 百度明确返回的错误才清 token；网络异常保留，避免误清
            if (/errno\s*=\s*-?\d+/.test(msg) || /errno=-6|授权已失效|重新授权|无法刷新|未完成百度授权/.test(msg)) {
                this.clear_tokens();
            }
            return {valid: false, error: msg};
        }
    }

    /** 清空 token（标记为未授权，但保留应用配置） */
    clear_tokens(): void {
        this.patch_config({token: EMPTY_TOKEN});
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
            throw new Error(`获取百度账号信息失败：errno=${data.errno}${data.errmsg ? ` ${data.errmsg}` : ""}`);
        }
        return {
            uk: data.uk,
            baidu_name: data.baidu_name,
            netdisk_name: data.netdisk_name,
            avatar_url: data.avatar_url,
        };
    }

    /** OAuth 响应 → 持久化 token 结构（提前 5 分钟视为过期，留出刷新窗口） */
    private to_tokens(data: any): BaiduTokens {
        const now = Date.now();
        const expires_in = Number(data.expires_in ?? 0) * 1000;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: now + Math.max(expires_in - 5 * 60 * 1000, 0),
            obtained_at: now,
        };
    }
}
