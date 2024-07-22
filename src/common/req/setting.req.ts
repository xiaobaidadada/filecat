
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
