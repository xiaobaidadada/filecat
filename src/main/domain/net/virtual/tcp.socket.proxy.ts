import net from "net";


export class TcpSocketProxy {
    private activeSockets: Set<net.Socket> = new Set(); // 用来强制关闭所有连接
    private serverList: net.Server[] = [];

    public get_proxy_server(port: number, target_port: number, target_host: string) {
        const server = net.createServer((clientSocket) => {
            this.activeSockets.add(clientSocket);
            clientSocket.on('close', () => this.activeSockets.delete(clientSocket));

            const targetSocket = net.createConnection(target_port, target_host, () => {
                // config.status = true;
                // done_call();
            });

            this.activeSockets.add(targetSocket);
            targetSocket.on('close', () => this.activeSockets.delete(targetSocket));

            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);

            clientSocket.on('error', () => targetSocket.end());
            targetSocket.on('error', () => clientSocket.end());

            clientSocket.on('end', () => {
                targetSocket.end();
                // config.status = false;
            });

            targetSocket.on('end', () => {
                clientSocket.end();
                // config.status = false;
            });
        });

        server.listen(port, () => {
            console.log(`TCP 代理服务器启动，监听端口: ${port}`);
        });
        server.on('error', (err) => {
            console.log(err);
        });
        server.on('listening', () => {
            console.log(`TCP 服务器正在监听${port}...`);
            this.serverList.push(server);
        });
        return server;
    }

    close_all() {
        console.log('强制关闭所有代理及连接...');
        this.activeSockets.forEach((socket) => {
            socket.destroy(); // 立即关闭所有连接
        });
        this.activeSockets.clear();
        this.serverList.forEach((server) => {
            server.close(() => {
                console.log('代理服务器已关闭');
            });
        });
        this.serverList =[]
    }
}

export const tcpSocketProxy = new TcpSocketProxy();