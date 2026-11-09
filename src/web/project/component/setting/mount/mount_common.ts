/** 挂载相关组件共用的类型与常量 */

/** 凭据下的子账号（百度网盘、内网穿透 FileCat 使用「一凭据多账号」） */
export interface MountAccountRow {
    /** 账号唯一 id（百度用 uk，内网穿透用生成 id） */
    id: string;
    /** 账号备注（用户自己起；为空时展示账号名） */
    note?: string;
    /** 账号名（百度账号名 / 对端 FileCat 登录名） */
    account_name?: string;
    /** 昵称（如百度网盘昵称） */
    nickname?: string;
    avatar_url?: string;
    /** OAuth token（百度用；有 token 即表示已授权） */
    token?: {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        obtained_at: number;
    };
    enabled?: boolean;
}

/** 凭据 */
export interface CredentialRow {
    id: string;
    type: string;
    /** 备注（便于挂载时辨认） */
    note: string;
    /** 子账号列表；「一凭据多账号」的类型才有（百度、内网穿透） */
    accounts?: MountAccountRow[];
    enabled?: boolean;
    /** 前端标记：新加的行，尚未保存 */
    is_new?: boolean;

    // WebDAV
    webdav_url?: string;
    // SSH / SFTP
    ssh_host?: string;
    ssh_port?: number;
    ssh_private_key?: string;
    // SMB
    smb_server?: string;
    // S3
    s3_endpoint?: string;
    s3_region?: string;
    s3_force_path_style?: boolean;
    // 百度网盘（应用配置）
    baidu_app_id?: string;
    baidu_app_key?: string;
    baidu_secret_key?: string;
    // 本地目录
    local_sources?: LocalSourceRow[];
    // 内网穿透
    tcp_client_num_id?: string;
    tcp_base_url?: string;
}

/** 本地目录凭据下的一条「名称 → 路径」映射 */
export interface LocalSourceRow {
    name: string;
    path: string;
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
    /** 字段取值来自动态选项（目前只有穿透客户端下拉），选项由后端返回 */
    options_source?: "tcp_client";
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
    /** 引用的子账号 id（一凭据多账号的类型需要：百度、内网穿透） */
    account_id?: string;
    /** 挂载备注；为空时展示本地目录名 */
    note?: string;
    root_dir?: string;
    readonly?: boolean;
    color?: string;
    enabled?: boolean;
    /** 转发到对端：该挂载目录下的终端、workflow 等请求在对端 FileCat 执行 */
    forward_to_remote?: boolean;
    /** 前端标记：新加的行，尚未保存 */
    is_new?: boolean;
}

/** 驱动元信息 */
export interface DriverMeta {
    type: string;
    name: string;
    has_root: boolean;
    /** 位置选择方式：share 可远程列出供挑选，dir 手填路径，local 从凭据的映射里挑 */
    location?: "dir" | "share" | "local" | "none";
    /** 远程可列出时的列表语义 */
    location_label?: "smb_share" | "s3_bucket";
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
    local: "local",
    tcp_proxy: "tcp_proxy",
};

/**
 * 当前驱动类型可选的凭据来源：按驱动所要求的凭据类型严格过滤，不匹配的不出现。
 */
export function credential_options(driver: string, creds: CredentialRow[]) {
    const need = DRIVER_CREDENTIAL_TYPE[driver];
    return creds.filter(c => c.type === need).map(c => ({title: c.note, value: c.id}));
}

/**
 * 某个凭据可选的具体账号。
 * 除本地目录（用 sources 描述多个目录）外，其余凭据都是「一份连接信息 + 若干账号」。
 * 账号可以为空：SMB/WebDAV 服务端允许匿名，此时不选账号也能连。
 */
export function account_options(credential_id: string, creds: CredentialRow[]) {
    const cred = creds.find(c => c.id === credential_id);
    const list = (cred?.accounts ?? []).map(a => ({
        title: a.note || a.account_name || a.nickname || a.id,
        value: a.id,
    }));
    // 有账号可选时，额外给一个「不使用账号」项，用于免密服务
    return list.length ? [{title: "not use account", value: ""}, ...list] : list;
}

/**
 * 该凭据类型的挂载是否需要选账号。
 * 本地目录用 sources 选目录，不需要账号；其余凭据有账号才需要选，没有账号就是匿名访问。
 */
export function need_account_of(credential_id: string, creds: CredentialRow[]) {
    const cred = creds.find(c => c.id === credential_id);
    if (!cred) {
        return false;
    }
    return cred.type !== "local" && (cred.accounts ?? []).length > 0;
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


/** 时间戳 → yyyy-MM-dd HH:mm */
export function fmt_time(ts?: number): string {
    if (!ts) {
        return "-";
    }
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
