export enum TokenTimeMode {
    close,
    length,//指定长度
    forver // 永不过期
}

export class TokenSettingReq {
    mode: TokenTimeMode;
    length: number; // 秒
    persist?: boolean; // 是否持久化到磁盘（服务重启后还能用）
}

export class FileSettingItem {
    path: string;
    default: boolean = false;
    note: string;
    index: number;
}

export class QuickCmdItem {
    cmd: string;
    note: string;
    index?: number;
    father_index?: number;
}

export class FileQuickCmdItem {
    file_suffix: string;
    cmd: string;
    note: string;
    params: string;
}

export enum SysSoftware {
    ffmpeg = "ffmpeg",
    smartmontools = "smartctl",
    // ntfs_3g = "ntfs-3g"
}

export class SysSoftwareItem {
    id: SysSoftware;
    installed: boolean; // 是否安装
    path?: string; // 如果没有在path环境变量内可以使用这个
}

export class systemdPojo {
    name: string;
    load_state: string; // 装载状态
    active_state: string; // 激活状态
    unit_state: string; // 存活状态
    comm: string; // 执行命令
    user: string; // 所属用户
    isSys: boolean; // 是系统创建的(或者加入到filecat监管的)
}

// HTTPS 设置
export class HttpsSettingReq {
    open: boolean = false;
    cert_path: string = ''; // SSL 证书文件路径 (fullchain/cert.pem)
    key_path: string = '';  // SSL 私钥文件路径 (privkey.pem)
}

// 自动升级设置
export class AutoUpgradeSettingReq {
    open: boolean = false;
    // 统一的系统版本检测地址（npm registry 或镜像），用于获取最新版本号
    // 默认 https://registry.npmjs.org，npm 升级时也作为 registry 地址
    version_check_url: string = 'https://registry.npmjs.org';
    // exe 模式：下载地址模板（用户可自定义，留空则用官方默认）
    exe_download_url: string = '';
    // 定时检测频率，单位秒，默认 180 秒（3分钟）
    check_interval_seconds: number = 180;
}

// 系统设置类型
export const enum sys_setting_type {
    auth,
    cmd,
    cyc, // 垃圾站
    sys_env= 3,
    private_sys_env,
    https = 5,
    auto_upgrade = 6,
}

export interface dir_upload_max_num_item {
    path: string,
    user_upload_num?: number, // 单个用户最大并发数量
    sys_upload_num?: number, // 系统最大并发数量

    open_ws_file?: boolean, // 开启用ws处理大文件 也就是断点传输 和分块
    ws_file_standard_size?: number, // 大文件判断的标准大小
    ws_file_parallel_num?: number, // 并发的ws数量
    ws_file_block_mb_size?: number, // 文件的块大小 用 Mb做单位

    index?: number,
    note?: string,
}
