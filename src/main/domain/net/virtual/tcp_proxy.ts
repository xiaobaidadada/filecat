import * as net from 'net';

interface ProxyConfig {
    proxyPort: number;  // 代理端口
    targetHost: string; // 目标服务器的 IP 地址
    targetPort: number; // 目标服务器的端口
    param?:any;
    status?:boolean;
}
interface port_server_type {
    server?:net.Server,
    config:ProxyConfig,
    activeSockets:Set<net.Socket>;
}
export class TcpProxy {
    private proxies: ProxyConfig[];
    // private serverList: net.Server[];
    // private activeSockets: Set<net.Socket>; // 用来强制关闭所有连接
    private port_server_list:port_server_type[] = []

    constructor(proxies: ProxyConfig[]) {
        this.proxies = proxies;
        // this.serverList = [];
        // this.activeSockets = new Set();
    }

    get_all_status() {
        return this.proxies.map(v => ({
            param: v.param,
            status: v.status,
        }));
    }

    start(done_call: () => void) {
        for (const config of this.proxies) {
            try {
                const port_server:port_server_type = {
                    activeSockets: new Set(),
                    config
                }
                const server = net.createServer((clientSocket) => {
                    port_server.activeSockets.add(clientSocket);
                    clientSocket.on('close', () => port_server.activeSockets.delete(clientSocket));

                    const targetSocket = net.createConnection(config.targetPort, config.targetHost, () => {
                        config.status = true;
                        done_call();
                    });

                    port_server.activeSockets.add(targetSocket);
                    targetSocket.on('close', () => port_server.activeSockets.delete(targetSocket));

                    clientSocket.pipe(targetSocket);
                    targetSocket.pipe(clientSocket);

                    clientSocket.on('error', () => targetSocket.end());
                    targetSocket.on('error', () => clientSocket.end());

                    clientSocket.on('end', () => {
                        targetSocket.end();
                        config.status = false;
                    });

                    targetSocket.on('end', () => {
                        clientSocket.end();
                        config.status = false;
                    });
                });

                server.listen(config.proxyPort, () => {
                    console.log(`TCP 代理服务器启动，监听端口: ${config.proxyPort}`);
                });
                server.on('error', (err) => {
                    console.log(err);
                });
                server.on('listening', () => {
                    console.log(`TCP 服务器正在监听${config.proxyPort}...`);
                    port_server.server = server;
                    this.port_server_list.push(port_server);
                });
            } catch (err) {
                console.error(err);
            }
        }
    }

    close_for_port(port:number) {
        for (const server of this.port_server_list) {
            if(server.config.proxyPort == port) {
                this.kill_server(server);
                break;
            }
        }
    }

    private kill_server(server:port_server_type) {
        server.server.close(() => {
            console.log(`代理服务器已关闭 ${server.config.proxyPort} => ${server.config.targetHost}:${server.config.targetPort}`);
        });
        for (const socket of server.activeSockets) {
            socket.destroy(); // 立即关闭所有连接
        }
    }

    close() {
        for (const server of this.port_server_list) {
            this.kill_server(server);
        }
    }
}
