
export enum TokenTimeMode {
    close,
    length,//指定长度
    forver // 永不过期
}
export class TokenSettingReq {
    mode:TokenTimeMode;
    length:number ; // 秒
}