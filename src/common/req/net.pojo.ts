export class NetPojo {
    // 要代理的url
    targetProxyUrl: string;
    // 返回给浏览器的代理端口
    proxyPort: number;
    // 系统代理端口
    sysProxyPort: number;
}

export enum VirServerEnum {
    tcp,
    udp
}

export class VirServerPojo {
    open: boolean = false; // 开启状态
    model:VirServerEnum = VirServerEnum.udp; // 运行模式
    port:number; // 服务器的端口
    key:string = ""; // 通信密钥
}

export class VirClientPojo {
    open: boolean = false;
    ip:string;
    mask:number;
    serverIp:string;
    serverPort:number;
    key:string = "";
}

export class VirNetItem {
    vir_ip:string;
    real_ip:string;
    online:boolean = false;
}
