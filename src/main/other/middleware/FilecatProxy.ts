import { Request, Response, NextFunction } from 'express';
import { Duplex } from 'stream';
import HttpProxy from 'http-proxy';
import { NetMsgType, NetUtil } from "../../domain/net/util/NetUtil";
import { Env } from "../../../common/node/Env";
import { tcpForwardService } from "../../domain/net/tcp.forward.server.service";
const urlUtil = require('url');
const cookieUtil = require('cookie');

// 实例化 http-proxy 核心代理对象
const httpProxyServer = HttpProxy.createProxyServer({});

/**
 * 🔥 核心桥接器：将你的私有穿透多路复用通道 包装成 标准的 Node.js 双向流（Socket）
 */
export class TunnelDuplexStream extends Duplex {
    private client: any;
    private socket_id: number;
    private isDestroyed: boolean = false;

    constructor(client: any, socket_id: number) {
        super({
            allowHalfOpen: false,
            emitClose: true
        });
        this.client = client;
        this.socket_id = socket_id;
    }

    _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) {
        if (this.isDestroyed) return callback(new Error('Stream already destroyed'));

        const idBuffer = NetUtil.int16_to_buffer(this.socket_id);
        const payload = Buffer.concat([idBuffer, chunk]);

        const ok = this.client.client_util.send_data(NetMsgType.tcp_socket_data, payload);

        if (!ok) {
            this.client.client_util.get_client().get_socket().once('drain', () => {
                callback();
            });
        } else {
            callback();
        }
    }

    _read(size: number) {
        // 等待 receiveFromTunnel 异步灌入数据
    }

    receiveFromTunnel(rawTcpBuffer: Buffer) {
        if (this.isDestroyed) return;
        this.push(rawTcpBuffer);
    }

    _destroy(err: Error | null, callback: (error: Error | null) => void) {
        if (this.isDestroyed) return callback(null);
        this.isDestroyed = true;

        this.push(null);

        try {
            this.client.client_util.send_data(NetMsgType.tcp_socket_close, NetUtil.int16_to_buffer(this.socket_id));
        } catch (e) {
            console.error('[TunnelStream] Send close signal error:', e);
        }

        callback(err);
    }
}

/**
 * 🚀 完全修复后的 Express 穿透代理中间件
 */
export const use_filecat_middleware = (sys_pre: string) => {

    return async (req: Request, res: Response, next: NextFunction) => {
        const hasAbcQuery = !!(req.query && req.query.tcp_client_num_id);
        const hasAbcCookie = !!(req.cookies && req.cookies.tcp_client_num_id);

        if (hasAbcQuery || hasAbcCookie) {

            if (hasAbcQuery) {
                res.cookie('tcp_client_num_id', `${req.query.tcp_client_num_id}`, { path: '/', maxAge: 86400000, httpOnly: false });
                const cleanUrl = req.originalUrl.split('?')[0];
                return res.redirect(cleanUrl);
            }

            const client_num_id: number = parseInt(req.cookies.tcp_client_num_id as string);

            const client_config = tcpForwardService.get_tcp_filecat(client_num_id);
            if (!client_config) {
                return next();
            }

            if (client_config.filecat_use_local_page) {
                if (!(req.originalUrl && (req.originalUrl.startsWith(sys_pre)))) {
                    return next();
                }
            }

            const client = tcpForwardService.client_num_map[client_num_id];
            if (!client) {
                if (!res.headersSent) res.status(502).send('Client Offline');
                return;
            }

            // 检查当前请求是否是 WebSocket 升级请求
            const isWebSocket = req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket';

            // 2. 申请唯一的 socket_id
            const socket_id = tcpForwardService.get_socket_id();

            // 3. 实例化桥接流
            const tunnelStream = new TunnelDuplexStream(client, socket_id);

            // 4. 底层 TCP 私有数据捕获闭包
            const on_data = (data: Buffer, tag_id: any) => {
                const { code, tcpBuffer } = NetUtil.getTcpData(data);

                if (NetMsgType.tcp_socket_data === code) {
                    const call_socket_id = NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2));
                    if (call_socket_id === socket_id) {
                        const call_data = tcpBuffer.subarray(2);
                        tunnelStream.receiveFromTunnel(call_data);
                    }
                }

                if (NetMsgType.tcp_socket_close === code) {
                    const call_socket_id = NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2));
                    if (call_socket_id === socket_id) {
                        cleanup();
                    }
                }
            };

            client.client_util.get_client().add_on_data(on_data);

            // 🔥【核心修复点1】：深度销毁闭包，确保浏览器感知到连接结束
            const cleanup = () => {
                client.client_util.get_client().delete_on_data(on_data);

                if (!tunnelStream.writableEnded) {
                    tunnelStream.destroy();
                }

                // 如果是普通的 HTTP 请求，在穿透链路断开时，必须强制掐断物理响应，防止转圈
                if (!isWebSocket) {
                    if (!res.writableEnded) {
                        try {
                            res.end(); // 核心：体面地结束 HTTP 响应
                        } catch (e) {
                            req.socket.destroy(); // 备用方案：暴力破坏物理 Socket
                        }
                    }
                }
            };

            req.on('error', () => cleanup());
            res.on('error', () => cleanup());
            if (!isWebSocket) {
                res.on('finish', () => cleanup());
            }

            try {
                // 5. 通知内网建连
                await client.client_util.send_data_async(NetMsgType.tcp_client_create_socket_for_server, Buffer.from(JSON.stringify({
                    socket_id,
                    is_filecat: true
                })));

                // 公共代理配置项
                const proxyOptions = {
                    target: {
                        host: '127.0.0.1',
                        port: Env.port || 80
                    },
                    agent: new (class extends (require('http').Agent) {
                        createConnection(options: any, callback: any) {
                            callback(null, tunnelStream);
                            return tunnelStream;
                        }
                    })()
                };

                // 在组装请求前统一拦截改写 Headers
                httpProxyServer.once('proxyReq', (proxyReq) => {
                    // 如果是普通 HTTP 强行 Close，如果是 WS 则保留 Upgrade 链
                    if (!isWebSocket) {
                        proxyReq.setHeader('Connection', 'close'); // 告诉目标内网不要保持 Keep-Alive
                    }
                    proxyReq.setHeader('Host', `127.0.0.1:${Env.port}`);
                    proxyReq.removeHeader('Cookie');
                });

                // 🔥【核心修复点2】：强行拦截远端返回给浏览器的响应头，抹除 Keep-Alive，并强制要求浏览器关闭长连接
                httpProxyServer.once('proxyRes', (proxyRes, req, res) => {
                    proxyRes.headers['connection'] = 'close';
                    proxyRes.headers['proxy-connection'] = 'close';
                });

                // 6. 分流处理：判断是走普通 Web 代理还是走 WebSocket 代理
                if (isWebSocket) {
                    httpProxyServer.ws(req, req.socket, req.headers, proxyOptions, (err) => {
                        console.error('[HttpProxy WS Error]:', err);
                        cleanup();
                    });
                    return;
                } else {
                    // 普通 HTTP 代理
                    httpProxyServer.web(req, res, proxyOptions, (err) => {
                        console.error('[HttpProxy Error]:', err);
                        cleanup();
                        if (!res.headersSent) {
                            res.status(502).send('Gateway Error: Tunnel Broken');
                        }
                    });
                    return;
                }

            } catch (error) {
                console.error('[穿透通道激活失败]:', error);
                cleanup();
                if (!res.headersSent) res.status(502).send('Client Offline');
                return;
            }
        }

        next();
    };
}


export const use_ws_filecat_middleware = (sys_pre) =>{

    return async (request, socket, head) =>{

        const parsedUrl = urlUtil.parse(request.url || '', true);
        const cookies = cookieUtil.parse(request.headers.cookie || '');

        const hasAbcQuery = !!(parsedUrl.query && parsedUrl.query.tcp_client_num_id);
        const hasAbcCookie = !!(cookies && cookies.tcp_client_num_id);

        if (!(hasAbcQuery || hasAbcCookie)) {
            return 'contiue';
        }

        const client_num_id_str = parsedUrl.query.tcp_client_num_id || cookies.tcp_client_num_id;
        const client_num_id = parseInt(client_num_id_str as string);

        const client_config = tcpForwardService.get_tcp_filecat(client_num_id);
        const client = tcpForwardService.client_num_map[client_num_id];

        if (client_config && client) {
            if (client_config.filecat_use_local_page) {
                if (!(request.url && request.url.startsWith(sys_pre))) {
                    socket.destroy();
                    return;
                }
            }

            console.log(`[穿透通道 - 强流直连] -> 正在通过底层双向管道直接穿透 WS 连接`);

            // 1. 申请穿透链路唯一的 socket_id
            const socket_id = tcpForwardService.get_socket_id();

            // 2. 创建用于桥接的虚拟 Socket 双向流
            const tunnelStream = new TunnelDuplexStream(client, socket_id);

            // 3. 挂载数据总线订阅
            const on_data = (data: Buffer, tag_id: any) => {
                const { code, tcpBuffer } = NetUtil.getTcpData(data);
                if (NetMsgType.tcp_socket_data === code) {
                    const call_socket_id = NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2));
                    if (call_socket_id === socket_id) {
                        tunnelStream.receiveFromTunnel(tcpBuffer.subarray(2));
                    }
                }
                if (NetMsgType.tcp_socket_close === code) {
                    const call_socket_id = NetUtil.buffer_to_int16(tcpBuffer.subarray(0, 2));
                    if (call_socket_id === socket_id) {
                        cleanup();
                    }
                }
            };
            client.client_util.get_client().add_on_data(on_data);

            const cleanup = () => {
                client.client_util.get_client().delete_on_data(on_data);

                // 解绑 pipe 映射，防止触发多重循环销毁
                try {
                    socket.unpipe(tunnelStream);
                    tunnelStream.unpipe(socket);
                } catch (e) {}

                if (!tunnelStream.writableEnded) {
                    tunnelStream.destroy();
                }
                // 🔥 核心：确保外网前端物理 Socket 能够被真正切断释放
                if (!socket.destroyed) {
                    socket.end();
                    socket.destroy();
                }
            };

            // 绑定两端物理与虚拟链路的销毁事件
            socket.on('error', () => cleanup());
            socket.on('close', () => cleanup());
            tunnelStream.on('error', () => cleanup());
            tunnelStream.on('close', () => cleanup());

            try {
                // 4. 异步通知客户端建立对远端目标的物理连接
                await client.client_util.send_data_async(NetMsgType.tcp_client_create_socket_for_server, Buffer.from(JSON.stringify({
                    socket_id,
                    is_filecat: true
                })));

                // 5. 🔥【神来之笔】：绕过 http-proxy，将前端握手头还原回二进制流发往穿透通道
                // 构造原始的、最纯粹的 HTTP Upgrade 握手报文头
                let rawHttpHeader = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
                for (let i = 0; i < request.rawHeaders.length; i += 2) {
                    const key = request.rawHeaders[i];
                    const val = request.rawHeaders[i+1];

                    // 过滤掉原有的 Cookie 防串，和 Host 改写，保持标准代理行为
                    if (key.toLowerCase() === 'cookie') continue;
                    if (key.toLowerCase() === 'host') {
                        rawHttpHeader += `Host: 127.0.0.1:${Env.port}\r\n`;
                    } else {
                        rawHttpHeader += `${key}: ${val}\r\n`;
                    }
                }
                rawHttpHeader += '\r\n'; // 标准 HTTP Header 结束符

                // 首先将握手头部报文灌进内网
                tunnelStream.write(Buffer.from(rawHttpHeader));

                // 如果升级请求中附带了初始 Body（部分旧标准或变体），一并灌入
                if (head && head.length > 0) {
                    tunnelStream.write(head);
                }

                // 6. ⚔️ 双流会师（Pipe 机制核心）：
                // 前端物理 Socket 的后续数据直接流向穿透通道；穿透通道回传的数据直接流回浏览器物理 Socket
                socket.pipe(tunnelStream);
                tunnelStream.pipe(socket);

                return; // 💥拦截成功，直接退出升级处理函数，绝不挂起！

            } catch (err) {
                console.error('[WS强流穿透建连失败]:', err);
                cleanup();
                return;
            }
        }
    }
}