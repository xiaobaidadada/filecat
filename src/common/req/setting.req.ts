export enum TokenTimeMode {
    close,
    length,//指定长度
    forver // 永不过期
}

export class TokenSettingReq {
    mode: TokenTimeMode;
    length: number; // 秒
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
    father_index?:number;
}

export enum SysSoftware {
    ffmpeg = "ffmpeg",
    smartmontools = "smartmontools",
    ntfs_3g = "ntfs_3g"
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

// 系统设置类型
export const enum sys_setting_type {
    auth,
    cmd,
    cyc, // 垃圾站
    sys_env
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
