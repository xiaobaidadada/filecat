import * as net from 'net';

interface ProxyConfig {
    proxyPort: number;  // 代理端口
    targetHost: string; // 目标服务器的 IP 地址
    targetPort: number; // 目标服务器的端口
    param?:any;
    status?:boolean;
}

export class TcpProxy {
    private proxies: ProxyConfig[];
    private serverList: net.Server[];
    private activeSockets: Set<net.Socket>; // 用来强制关闭所有连接

    constructor(proxies: ProxyConfig[]) {
        this.proxies = proxies;
        this.serverList = [];
        this.activeSockets = new Set();
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
                const server = net.createServer((clientSocket) => {
                    this.activeSockets.add(clientSocket);
                    clientSocket.on('close', () => this.activeSockets.delete(clientSocket));

                    const targetSocket = net.createConnection(config.targetPort, config.targetHost, () => {
                        config.status = true;
                        done_call();
                    });

                    this.activeSockets.add(targetSocket);
                    targetSocket.on('close', () => this.activeSockets.delete(targetSocket));

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
                    this.serverList.push(server);
                });
            } catch (err) {
                console.error(err);
            }
        }
    }

    close(force = false) {
        if (force) {
            console.log('强制关闭所有代理及连接...');
            this.activeSockets.forEach((socket) => {
                socket.destroy(); // 立即关闭所有连接
            });
        }

        this.serverList.forEach((server) => {
            server.close(() => {
                console.log('代理服务器已关闭');
            });
        });
    }
}
