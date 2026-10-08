/** 挂载相关组件共用的类型与常量 */

/** 凭据（脱敏：不含密码明文与 token） */
export interface CredentialRow {
    id: string;
    type: string;
    name: string;
    config: Record<string, any>;
    enabled?: boolean;
    /** 是否已设置过密码类字段（编辑时留空表示不修改） */
    has_password?: boolean;
    /** 百度凭据：是否已完成 OAuth 授权（token 不返回前端，只回传这两个标记） */
    authorized?: boolean;
    /** 百度凭据：access_token 是否已过期 */
    expired?: boolean;
    /** 百度凭据：授权时间戳 */
    obtained_at?: number;
    /** 前端标记：新加的行，尚未保存 */
    is_new?: boolean;
}

/** 凭据类型元信息 */
/** 凭据字段描述（与后端 CredentialField 对应，供动态渲染表单） */
export interface CredentialField {
    key: string;
    label: string;
    type: "text" | "password" | "switch";
    required?: boolean;
    placeholder?: string;
    tip?: string;
    /** 开关类字段的默认值（未填写时生效） */
    default?: boolean;
}

export interface CredentialMeta {
    type: string;
    name: string;
    fields: CredentialField[];
}

/** 挂载记录 */
export interface MountRow {
    id: string;
    driver: string;
    mount_path: string;
    credential_id: string;
    name?: string;
    root_dir?: string;
    readonly?: boolean;
    color?: string;
    enabled?: boolean;
    /** 前端标记：新加的行，尚未保存 */
    is_new?: boolean;
}

/** 驱动元信息 */
export interface DriverMeta {
    type: string;
    name: string;
    has_root: boolean;
}

/**
 * 驱动类型 → 需要的凭据类型（与后端 DRIVER_CREDENTIAL_TYPE 保持一致）。
 */
export const DRIVER_CREDENTIAL_TYPE: Record<string, string> = {
    webdav: "webdav",
    sftp: "ssh",
    smb: "smb",
    s3: "s3",
    baidu: "baidu",
};

/**
 * 当前驱动类型可选的凭据来源：按驱动所要求的凭据类型严格过滤，不匹配的不出现。
 */
export function credential_options(driver: string, creds: CredentialRow[]) {
    const need = DRIVER_CREDENTIAL_TYPE[driver];
    return creds.filter(c => c.type === need).map(c => ({title: c.name, value: c.id}));
}

/** 挂载目录默认标识色 */
export const DEFAULT_COLOR = "#4a9eff";

/** 表格/表单里下拉用的启用/停用选项（文案走 t()） */
export function mount_enable_options(t: (s: string) => string) {
    return [
        {title: t("启用"), value: true},
        {title: t("停用"), value: false},
    ];
}

/** 挂载类型候选项（后端 driver/list 会覆盖，这里仅作兜底） */
export const DRIVER_OPTIONS = [
    {title: "WebDAV", value: "webdav"},
    {title: "SSH / SFTP", value: "sftp"},
    {title: "S3 兼容对象存储", value: "s3"},
    {title: "百度网盘", value: "baidu"},
];

/** 时间戳 → yyyy-MM-dd HH:mm */
export function fmt_time(ts?: number): string {
    if (!ts) {
        return "-";
    }
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
