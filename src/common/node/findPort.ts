const net = require('net');

// 查找端口
export async function find_available_port(startPort, endPort) {
    for (let port = startPort; port <= endPort; port++) {
        try {
            // 创建一个服务器尝试监听指定端口
            await new Promise((resolve, reject) => {
                const server = net.createServer();
                server.unref();
                server.on('error', reject);
                server.listen(port, () => {
                    server.close(() => resolve(port));
                });
            });
            return port; // 如果端口可用，返回该端口
        } catch (error) {
            // 如果端口不可用，继续尝试下一个端口
        }
    }
    return null; // 如果未找到可用端口，返回 null
}

export async function is_port_available(port: number, host = "0.0.0.0"): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.unref(); // 不阻塞进程退出

        server.once("error", () => {
            // 端口被占用 or 无权限
            resolve(false);
        });

        server.listen(port, host, () => {
            // 能监听说明端口可用
            server.close(() => {
                resolve(true);
            });
        });
    });
}

// 例子：查找 3000 到 4000 范围内的未使用端口
// findAvailablePort(3000, 4000)
//     .then((port) => {
//         if (port !== null) {
//             console.log(`Found available port: ${port}`);
//         } else {
//             console.log('No available port found.');
//         }
//     })
//     .catch((error) => {
//         console.error('Error:', error);
//     });
// async function main(){
//     const a = await findAvailablePort(3000, 4000);
//     console.log(a);
// }
// main()