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
    private proxies: ProxyConfig[] = [];
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
                    const targetSocket = net.createConnection(config.targetPort, config.targetHost, () => {
                        config.status = true;
                        done_call();
                    });
                    port_server.activeSockets.add(targetSocket);

                    // 双向转发
                    clientSocket.pipe(targetSocket);
                    targetSocket.pipe(clientSocket);

                    const destroyBoth = () => {
                        if (!clientSocket.destroyed) clientSocket.destroy();
                        if (!targetSocket.destroyed) targetSocket.destroy();
                        config.status = false;
                    };

                    // 任意一方结束 → 优雅关闭
                    clientSocket.on('end', () => targetSocket.end());
                    targetSocket.on('end', () => clientSocket.end());

                    // 任意一方出错 → 强制关闭
                    clientSocket.on('error', destroyBoth);
                    targetSocket.on('error', destroyBoth);

                    // 任意一方关闭 → 强制兜底
                    clientSocket.on('close', destroyBoth);
                    targetSocket.on('close', destroyBoth);

                    // 清理
                    const cleanup = (socket: net.Socket) => {
                        port_server.activeSockets.delete(socket);
                    };

                    clientSocket.on('close', () => cleanup(clientSocket));
                    targetSocket.on('close', () => cleanup(targetSocket));
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
