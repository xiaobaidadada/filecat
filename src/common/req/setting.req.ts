
export enum TokenTimeMode {
    close,
    length,//指定长度
    forver // 永不过期
}
export class TokenSettingReq {
    mode:TokenTimeMode;
    length:number ; // 秒
}

export class FileSettingItem {
    path:string;
    default:boolean = false;
    note:string;
    index:number;
}

export enum SysSoftware {
    ffmpeg="ffmpeg",
    smartmontools = "smartmontools",
    ntfs_3g = "ntfs_3g"
}
export class SysSoftwareItem {
    id:SysSoftware;
    installed:boolean; // 是否安装
    path?:string; // 如果没有在path环境变量内可以使用这个
}

export class systemdPojo {
    name:string;
    load_state:string; // 装载状态
    active_state:string; // 激活状态
    unit_state:string; // 存活状态
    comm:string; // 执行命令
    user:string; // 所属用户
    isSys:boolean; // 是系统创建的(或者加入到filecat监管的)
}

export const enum status_open  {
    auth,
    cmd,
    cyc, // 垃圾站
}