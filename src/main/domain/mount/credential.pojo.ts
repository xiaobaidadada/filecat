import {MountDriverType} from "./driver/file_driver";

/** OAuth token 结构（目前百度使用） */
export interface OAuthTokens {
    access_token: string;
    refresh_token: string;
    /** access_token 过期时间（毫秒时间戳，已提前 5 分钟算过期） */
    expires_at: number;
    /** 获取时间（毫秒时间戳） */
    obtained_at: number;
}

/**
 * 凭据下的子账号。
 *
 * 只有「一个应用可授权多个账号」的类型才有（目前仅百度网盘）：
 * 凭据本体存应用配置（AppKey/SecretKey），账号独立存在 accounts 数组里。
 * 挂载时先选凭据，选中这类凭据后再选具体账号（FileMountItem.account_id）。
 */
export interface MountAccount {
    /** 账号唯一 id（百度用 uk） */
    id: string;
    /** 账号备注（用户自己起，展示用；为空时回退到账号名） */
    note?: string;
    /** OAuth token（refresh_token 一次性，刷新后必须保存新的） */
    token?: OAuthTokens;
    /** 账号名（如百度账号名） */
    account_name?: string;
    /** 昵称（如百度网盘昵称） */
    nickname?: string;
    avatar_url?: string;
    /** 是否启用；停用后引用它的挂载不可用 */
    enabled?: boolean;
}

/**
 * 凭据（Credential）—— 可被多个挂载复用的「账号/身份信息」。
 *
 * 设计意图：把「怎么连」和「挂载到哪」拆开。
 *  · 凭据在「设置 → 网盘挂载」里统一管理（比如一个 WebDAV 账号、一个百度应用）
 *  · 挂载时只需要选择一个已保存的凭据，不用重复填写
 *  · 同一个凭据可以被挂载到多个本地目录
 *  · 一个应用能授权多个账号的类型（百度），账号放在 accounts 里
 */
export interface CredentialItem {
    /** 唯一 id */
    id: string;
    /** 凭据类型：与驱动的 type 对应 */
    type: CredentialType;
    /** 备注（用户自己起的，便于在挂载时辨认） */
    note: string;
    /**
     * 连接配置（含密码等敏感信息，明文存储）。
     * 百度这里只放应用配置（app_id/app_key/secret_key），账号信息在 accounts 里。
     */
    config: Record<string, any>;
    /** 子账号列表；只有「一个应用多账号」的类型才有（百度） */
    accounts?: MountAccount[];
    /** 是否启用；停用后引用它的挂载不可用 */
    enabled?: boolean;
    /** 创建者用户 id */
    user_id?: string;
    created_at?: number;
}

/**
 * 凭据类型。
 * 与驱动类型一一对应，都在「凭证管理」里维护；
 * baidu 分两步：先填应用配置（AppKey 等），再 OAuth 授权账号（可授权多个）。
 */
export type CredentialType =
    | "webdav"
    | "ssh"        // SSH / SFTP
    | "smb"        // SMB / Windows 共享
    | "s3"
    | "baidu";     // 百度网盘（凭据=应用配置，账号在 accounts 里）

/** 凭据字段描述（供设置页动态渲染表单） */
export interface CredentialField {
    key: string;
    label: string;
    type: "text" | "password";
    required?: boolean;
    placeholder?: string;
    tip?: string;
}

/** 凭据类型元信息 */
export interface CredentialMeta {
    type: CredentialType;
    name: string;
    fields: CredentialField[];
}

/**
 * 各凭据类型的配置字段定义。
 * baidu 的字段只用于第 1 步（应用配置），第 2 步的 OAuth 授权由前端单独渲染。
 */
export const CREDENTIAL_META_LIST: CredentialMeta[] = [
    {
        type: "webdav",
        name: "WebDAV",
        fields: [
            {key: "url", label: "服务地址", type: "text", required: true, placeholder: "https://example.com/dav"},
            {key: "username", label: "用户名", type: "text"},
            {key: "password", label: "密码", type: "password", tip: "坚果云/群晖等请使用应用密码"},
        ],
    },
    {
        type: "ssh",
        name: "SSH / SFTP",
        fields: [
            {key: "host", label: "主机", type: "text", required: true},
            {key: "port", label: "端口", type: "text", placeholder: "默认 22"},
            {key: "username", label: "用户名", type: "text", required: true},
            {key: "password", label: "密码", type: "password", tip: "与私钥二选一"},
            {key: "private_key", label: "私钥内容", type: "password", tip: "与密码二选一"},
        ],
    },
    {
        type: "smb",
        name: "SMB / Windows 共享",
        fields: [
            {key: "server", label: "主机", type: "text", required: true, placeholder: "192.168.1.10 或 nas.local"},
            {key: "share", label: "共享目录", type: "text", required: true, placeholder: "如 public"},
            {key: "username", label: "用户名", type: "text"},
            {key: "password", label: "密码", type: "password"},
        ],
    },
    {
        type: "s3",
        name: "S3 兼容对象存储",
        fields: [
            {
                key: "endpoint",
                label: "服务地址",
                type: "text",
                required: true,
                placeholder: "https://s3.amazonaws.com",
                tip: "阿里云OSS/腾讯COS/MinIO 等填各自的 endpoint",
            },
            {key: "bucket", label: "存储桶", type: "text", required: true},
            {key: "region", label: "区域", type: "text", placeholder: "us-east-1"},
            {key: "access_key", label: "AccessKey", type: "text", required: true},
            {key: "secret_key", label: "SecretKey", type: "password", required: true},
            {key: "force_path_style", label: "强制路径风格", type: "text", placeholder: "填 1 开启（MinIO 通常需要）"},
        ],
    },
    {
        // 百度网盘第 1 步的应用配置表单；第 2 步的 OAuth 授权由前端单独渲染
        type: "baidu",
        name: "百度网盘",
        fields: [
            {key: "app_id", label: "AppID", type: "text"},
            {key: "app_key", label: "AppKey", type: "text", required: true},
            {key: "secret_key", label: "SecretKey", type: "password", required: true},
        ],
    },
];

/** 按类型取凭据元信息 */
export function get_credential_meta(type: CredentialType): CredentialMeta | undefined {
    return CREDENTIAL_META_LIST.find(v => v.type === type);
}

/**
 * 驱动类型 → 需要的凭据类型。
 * 所有驱动都走凭据表：挂载只保存 credential_id。
 */
export const DRIVER_CREDENTIAL_TYPE: Record<string, CredentialType> = {
    [MountDriverType.webdav]: "webdav",
    [MountDriverType.sftp]: "ssh",
    [MountDriverType.smb]: "smb",
    [MountDriverType.s3]: "s3",
    [MountDriverType.baidu]: "baidu",
};
