import {MountDriverType} from "./driver/file_driver";

/**
 * 凭据（Credential）—— 可被多个挂载复用的「账号/身份信息」。
 *
 * 设计意图：把「怎么连」和「挂载到哪」拆开。
 *  · 凭据在「设置 → 网盘挂载」里统一管理（比如一个 WebDAV 账号、一个百度账号）
 *  · 挂载时只需要选择一个已保存的凭据，不用重复填写
 *  · 同一个凭据可以被挂载到多个本地目录
 */
export interface CredentialItem {
    /** 唯一 id */
    id: string;
    /** 凭据类型：与驱动的 type 对应（baidu_account 为内部派生类型，见下） */
    type: CredentialType;
    /** 展示名称（用户自己起的，便于在挂载时辨认） */
    name: string;
    /** 连接配置（含密码等敏感信息，明文存储） */
    config: Record<string, any>;
    /** 是否启用；停用后引用它的挂载不可用 */
    enabled?: boolean;
    /** 创建者用户 id */
    user_id?: string;
    created_at?: number;
}

/**
 * 凭据类型。
 * 前三个与驱动类型一一对应（普通凭据，在「普通凭据管理」里手动维护）；
 * baidu_account 是内部类型：由百度网盘授权账号派生，不出现在凭据管理里，
 * 仅用于把授权账号包成驱动候选的配置形态。
 */
export type CredentialType =
    | "webdav"
    | "ssh"        // SSH / SFTP
    | "s3"
    | "baidu_account";

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
 * 只列「普通凭据」（用户手填）；baidu_account 不在其中，它由 OAuth 授权派生、不可手填。
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
];

/** 按类型取凭据元信息 */
export function get_credential_meta(type: CredentialType): CredentialMeta | undefined {
    return CREDENTIAL_META_LIST.find(v => v.type === type);
}

/**
 * 驱动类型 → 需要的凭据类型（仅普通凭据）。
 * 百度网盘不在此列：它直接引用 OAuth 授权账号（uk 存在挂载的 credential_id 里），不查凭据表。
 */
export const DRIVER_CREDENTIAL_TYPE: Record<string, CredentialType> = {
    [MountDriverType.webdav]: "webdav",
    [MountDriverType.sftp]: "ssh",
    [MountDriverType.s3]: "s3",
};
