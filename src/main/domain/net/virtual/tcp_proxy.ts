import * as net from 'net';
import {tcpSocketProxy} from "./tcp.socket.proxy";

interface ProxyConfig {
    proxyPort: number;  // 代理端口
    targetHost: string; // 目标服务器的 IP 地址
    targetPort: number; // 目标服务器的端口
    param?:any;
    status?:boolean;
}

export class TcpProxy {
    private proxies: ProxyConfig[];

    constructor(proxies: ProxyConfig[]) {
        this.proxies = proxies;
    }


    start() {
        for (const config of this.proxies) {
            try {
                tcpSocketProxy.get_proxy_server(config.proxyPort,config.targetPort,config.targetHost)
            } catch (err) {
                console.error(err);
            }
        }
    }

    close() {
        tcpSocketProxy.close_all()
    }
}
