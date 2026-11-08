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
 * 只有「一凭据多账号」的类型才有（百度网盘、内网穿透 FileCat）：
 * 凭据本体存应用配置（AppKey/SecretKey），账号独立存在 accounts 数组里。
 * 挂载时先选凭据，选中这类凭据后再选具体账号（FileMountItem.account_id）。
 */
export interface MountAccount {
    /** 账号唯一 id（百度用 uk，tcp_proxy 用生成的 uuid） */
    id: string;
    /** 账号备注（用户自己起，展示用；为空时回退到账号名） */
    note?: string;
    /** OAuth token（refresh_token 一次性，刷新后必须保存新的） */
    token?: OAuthTokens;
    /** 账号名（如百度账号名、对端 FileCat 登录名） */
    account_name?: string;
    /** 登录密码（tcp_proxy 用；明文保存，与项目其他凭据一致） */
    password?: string;
    /** S3 的 Secret Key（access_key 存在 account_name 里） */
    secret_key?: string;
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
 *  · 一凭据多账号的类型（百度、内网穿透），账号放在 accounts 里
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
    /** 子账号列表；「一凭据多账号」的类型才有（百度、内网穿透） */
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
 * local 是本地目录映射：凭据只保存一个本地绝对路径，挂载后可被多处复用。
 * tcp_proxy 通过内网穿透客户端访问对端 FileCat：凭据只记客户端 id，对端账号密码在 accounts 里。
 */
export type CredentialType =
    | "webdav"
    | "ssh"        // SSH / SFTP
    | "smb"        // SMB / Windows 共享
    | "s3"
    | "local"      // 本地目录（用于 filecat 内部的目录链接）
    | "baidu"      // 百度网盘（凭据=应用配置，账号在 accounts 里）
    | "tcp_proxy"; // 内网穿透客户端（凭据=客户端，对端账号在 accounts 里）

/** 凭据字段描述（供设置页动态渲染表单） */
export interface CredentialField {
    key: string;
    label: string;
    type: "text" | "password";
    required?: boolean;
    placeholder?: string;
    tip?: string;
    /**
     * 字段取值来自动态选项而非手填（目前只有 tcp_proxy 的客户端下拉）。
     * 前端据此渲染成下拉，选项由后端 options 接口提供。
     */
    options_source?: "tcp_client";
}

/** 凭据类型元信息 */
export interface CredentialMeta {
    type: CredentialType;
    name: string;
    fields: CredentialField[];
    /**
     * 该凭据维护「名称 → 本地路径」映射列表，而不是简单的文本字段。
     *
     * 本地目录没有认证信息，一个凭据里可以登记多个常用源目录，
     * 挂载时只从里面挑一个；这和 SMB 一个凭据下多个共享、S3 一个凭据下多个桶是同一类概念。
     */
    sources?: boolean;
    /**
     * 该凭据维护「多账号」列表（accounts），而不是在 config 里存单套账号密码。
     *
     * 账号字段由 account_fields 描述；挂载时用 account_id 选中其中一条，
     * 由 build_config 把 account_name/password（S3 还有 secret_key）并进连接配置。
     */
    accounts?: boolean;
    /** accounts 为真时，每个账号要填的字段（不含备注） */
    account_fields?: CredentialField[];
    /** accounts 里表示账号标识的字段 key（列表里作为主列显示） */
    account_key?: string;
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
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "用户名", type: "text"},
            {key: "password", label: "密码", type: "password", tip: "坚果云/群晖等请使用应用密码"},
        ],
    },
    {
        type: "ssh",
        name: "SSH / SFTP",
        fields: [
            {key: "host", label: "主机", type: "text", required: true},
            {key: "port", label: "端口", type: "text", placeholder: "默认 22"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "用户名", type: "text", required: true},
            {key: "password", label: "密码", type: "password", tip: "与私钥二选一"},
            {key: "private_key", label: "私钥内容", type: "password", tip: "与密码二选一"},
        ],
    },
    {
        type: "smb",
        name: "SMB / Windows 共享",
        fields: [
            {key: "server", label: "主机", type: "text", required: true, placeholder: "192.168.1.10 或 nas.local"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "用户名", type: "text"},
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
            {key: "region", label: "区域", type: "text", placeholder: "us-east-1"},
            {key: "force_path_style", label: "强制路径风格", type: "text", placeholder: "填 1 开启（MinIO 通常需要）"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "AccessKey", type: "text", required: true},
            {key: "secret_key", label: "SecretKey", type: "password", required: true},
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
    {
        // 本地目录没有认证信息；一个凭据里登记多个「名称 → 路径」映射，挂载时挑一个
        type: "local",
        name: "本地目录",
        fields: [],
        sources: true,
    },
    {
        // 内网穿透客户端：凭据只记客户端，对端 FileCat 的账号密码存在 accounts 里（可多个）
        type: "tcp_proxy",
        name: "内网穿透 FileCat",
        fields: [
            {
                key: "client_num_id",
                label: "穿透客户端",
                type: "text",
                required: true,
                options_source: "tcp_client",
                tip: "从内网穿透客户端列表里选择",
            },
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
    [MountDriverType.local]: "local",
    [MountDriverType.tcp_proxy]: "tcp_proxy",
};
