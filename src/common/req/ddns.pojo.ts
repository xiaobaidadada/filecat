
export enum getIpType {
    www, // 网络获取
    sys// 本地接口获取
}
export enum DdnsType {
    dnspod,
    tengxun,
    ali
}
export class DdnsIPPojo {
    isIPv4: boolean; //ipv4还是ipv6
    ifaceOrWww:string; //获取ip途径对应的信息来源
    ip?:string; //上次ip信息
    ddnsHost?:string;
}

export class DnsPod {
    id:string;
    token:string;
}
export class Ali {
    accesskey_id:string;
    accesskey_secret:string;
}
export class Tengxun {
    secretid:string;
    secretkey:string;
}

// 保存的连接信息
export class DdnsConnection {
    ips: DdnsIPPojo[] = [];
    ddnsType?: DdnsType;
    isOpen:boolean=false;
    account:DnsPod|Ali|Tengxun;
}

