/** 挂载相关组件共用的类型与常量 */

/** 凭据（脱敏：不含密码明文） */
export interface CredentialRow {
    id: string;
    type: string;
    name: string;
    config: Record<string, any>;
    enabled?: boolean;
    /** 是否已设置过密码类字段（编辑时留空表示不修改） */
    has_password?: boolean;
    /** 前端标记：新加的行，尚未保存 */
    is_new?: boolean;
}

/** 凭据类型元信息 */
export interface CredentialMeta {
    type: string;
    name: string;
    fields: {
        key: string;
        label: string;
        type: "text" | "password";
        required?: boolean;
        placeholder?: string;
        tip?: string;
    }[];
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
 * 百度网盘不在此列：它直接选「百度网盘」面板里已授权的账号。
 */
export const DRIVER_CREDENTIAL_TYPE: Record<string, string> = {
    webdav: "webdav",
    sftp: "ssh",
    smb: "smb",
    s3: "s3",
};

/** 百度驱动标识（挂载时凭据来源切换为授权账号列表） */
export const BAIDU_DRIVER = "baidu";

/**
 * 当前驱动类型可选的凭据来源。
 * 百度：直接用已授权的百度账号（value 用 uk，后端按账号解析）。
 * 其余：按驱动所要求的凭据类型严格过滤，不匹配的凭据不出现。
 */
export function credential_options(driver: string, creds: CredentialRow[], baidu_accounts: BaiduAccountRow[]) {
    if (driver === BAIDU_DRIVER) {
        return baidu_accounts.map(a => ({
            title: a.name || a.baidu_name || String(a.uk),
            value: String(a.uk),
        }));
    }
    const need = DRIVER_CREDENTIAL_TYPE[driver];
    return creds.filter(c => c.type === need).map(c => ({title: c.name, value: c.id}));
}

/** 百度授权账号（/baidu/app/get 返回的 accounts 子集） */
export interface BaiduAccountRow {
    /** 账号唯一标识（uk），挂载时写入 credential_id */
    uk: number;
    /** 用户自定义名称 */
    name?: string;
    /** 百度昵称 */
    baidu_name?: string;
    /** 是否启用 */
    enabled?: boolean;
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

/**
 * 百度授权的两种方式。
 * one_click：授权后自动跳回本服务（需在百度控制台登记回调地址）
 * oob：不依赖回调，授权后在百度页面复制授权码回来粘贴
 */
export function baidu_auth_mode_options(t: (s: string) => string) {
    return [
        {title: t("outh_at"), value: "one_click"},
        {title: t("outhpst"), value: "oob"},
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
