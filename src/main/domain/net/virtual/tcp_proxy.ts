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
    private serverList: net.Server[]; // 服务器列表 本机的tcp服务器端口

    get_all_status() {
        return this.proxies.map(v=> {
            return {
                param:v.param,
                status:v.status,
            }
        });
    }

    constructor(proxies: ProxyConfig[]) {
        this.proxies = proxies;
        this.serverList = [];
    }

    // 启动所有代理
    start(done_call:() => void) {
        for (const config of this.proxies) {
            try {
                const server = net.createServer((clientSocket) => {
                    console.log(`客户端连接到代理端口: ${config.proxyPort}`);
                    // 创建与目标服务器的连接
                    const targetSocket = net.createConnection(config.targetPort, config.targetHost, () => {
                        console.log(`已连接到目标服务器: ${config.targetHost}:${config.targetPort}`);
                        config.status = true; // 目标 会经常断开连接 但是只要请求服务器端口 就会重连
                        done_call();
                    });
                    // 客户端到目标服务器的数据转发
                    clientSocket.on('data', (data) => {
                        targetSocket.write(data);
                    });
                    // 目标服务器到客户端的数据转发
                    targetSocket.on('data', (data) => {
                        // console.log(`接收到目标服务器的数据，转发到客户端`);
                        clientSocket.write(data);
                    });

                    // 错误处理
                    clientSocket.on('error', (err) => {
                        console.error(`客户端连接错误: ${err.message}`);
                        targetSocket.end();
                    });

                    targetSocket.on('error', (err) => {
                        console.error(`目标服务器连接错误: ${err.message}`);
                        clientSocket.end();
                    });

                    // 客户端关闭连接
                    clientSocket.on('end', () => {
                        console.log('客户端已关闭连接');
                        targetSocket.end();
                        config.status = false;
                    });

                    // 目标服务器关闭连接
                    targetSocket.on('end', () => {
                        console.log('目标服务器已关闭连接');
                        clientSocket.end();
                        config.status = false;
                    });
                });

                // 启动代理服务器
                server.listen(config.proxyPort, () => {
                    console.log(`TCP 代理服务器启动，监听端口: ${config.proxyPort}`);
                });
                // 将 server 保存到列表，便于后续关闭
                this.serverList.push(server);
            } catch(err) {
                console.log(err)
            }

        }
    }

    // 关闭所有代理
    close() {
        this.serverList.forEach((server) => {
            server.close(() => {
                console.log('代理服务器已关闭');
            });
        });
    }
}

// 示例：代理配置数组
// const proxyConfigs: ProxyConfig[] = [
//     { proxyPort: 1080, targetHost: 'example.com', targetPort: 80 },
//     { proxyPort: 1081, targetHost: 'example.org', targetPort: 80 }
// ];
//
// // 创建并启动代理
// const tcpProxy = new TcpProxy(proxyConfigs);
// tcpProxy.start();

// 关闭所有代理服务器
// 在需要的时候可以调用 tcpProxy.close();
