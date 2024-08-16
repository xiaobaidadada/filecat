
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
}
export class SysSoftwareItem {
    id:SysSoftware;
    installed:boolean; // 是否安装
    path?:string; // 如果没有在path环境变量内可以使用这个
}
