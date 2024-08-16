import {SysSoftware, SysSoftwareItem} from "./setting.req";

export class UserLogin {
    username: string;
    password: string;
}

export enum SysEnum {
    win,
    linux
}

export class UserBaseInfo {
    language:string;
    sys:SysEnum; // 系统
    sysSoftWare:{[key in SysSoftware]:SysSoftwareItem}|{};
}
