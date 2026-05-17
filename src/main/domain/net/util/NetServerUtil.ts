import net, {Server} from "net";
import {msgServerMap, NetMsgType, NetUtil, tcp_server_type} from "./NetUtil";
import {tcp_raw_socket} from "./tcp.client";


export class NetServerUtil {

    static tcp_server_map: Partial<{
        [s in tcp_server_type]: {
            server?: Server,
            socket_set:Set<tcp_raw_socket>,
            call_timeout_map: { [key: number]: any },
            call_resolve_map: { [key: number]: any }
        }
    }> = {};

    static socket_timeout_map: Map<net.Socket, any> = new Map<net.Socket, any>();
    static socket_timeout_resolve_map: Map<net.Socket, any> = new Map<net.Socket, any>();
    static socket_heart_timeout_map: Map<tcp_raw_socket, NodeJS.Timeout> = new Map();
    static socket_heart_last_time_map: Map<tcp_raw_socket, number> = new Map();


    // 授权成功
    public static connect_success(socket: net.Socket) {
        if(this.socket_timeout_map) {
            clearTimeout(this.socket_timeout_map.get(socket));
            this.socket_timeout_map.delete(socket);
        }
        if(this.socket_timeout_resolve_map.has(socket)) {
            this.socket_timeout_resolve_map.get(socket)(1);
            this.socket_timeout_resolve_map.delete(socket);
        }
    }

    public static close_server(server_type: tcp_server_type): void {
        if(!this.tcp_server_map[server_type]?.server?.listening) return
        this.tcp_server_map[server_type]?.server.close()
        console.log('服务器已停止接受新的连接');
        for (const v of this.tcp_server_map[server_type].socket_set) {
            const heart_timeout = this.socket_heart_timeout_map.get(v);
            if (heart_timeout) {
                clearInterval(heart_timeout);
                this.socket_heart_timeout_map.delete(v);
            }
            this.socket_heart_last_time_map.delete(v);
            v.get_client().close()
        }
        console.log('服务器已停止关闭所有连接');
    }

    public static server_is_running(server_type: tcp_server_type) {
        return !!this.tcp_server_map[server_type]?.server?.listening
    }

    public static close_client(server_type: tcp_server_type,util:tcp_raw_socket) {
        this.tcp_server_map[server_type]?.socket_set?.delete(util)
        const heart_timeout = this.socket_heart_timeout_map.get(util);
        if (heart_timeout) {
            clearInterval(heart_timeout);
            this.socket_heart_timeout_map.delete(util);
        }
        this.socket_heart_last_time_map.delete(util);
        util.get_client().close()
    }


    /**
     *
     * @param port udp 设置空随机绑定一个端口
     * @param server_type
     * @param auth_code
     */
    public static  start_tcp_server(port: number, server_type: tcp_server_type,auth_code:NetMsgType) {
        if (!this.tcp_server_map[server_type]) {
            this.tcp_server_map[server_type] = {
                socket_set:new Set(),
                call_resolve_map:{},
                call_timeout_map:{}
            }
        }
        const _map = this.tcp_server_map[server_type];
        const start_heart = (util:tcp_raw_socket)=>{
            const old_timeout = this.socket_heart_timeout_map.get(util);
            if (old_timeout) {
                clearInterval(old_timeout);
            }
            this.socket_heart_last_time_map.set(util, Date.now())
            const heart_timeout = setInterval(() => {
                const last_connect_time = this.socket_heart_last_time_map.get(util);
                if (typeof last_connect_time !== "number") {
                    clearInterval(heart_timeout);
                    this.socket_heart_timeout_map.delete(util);
                    return;
                }
                if(Date.now() - last_connect_time > 30 * 1000) {
                    clearInterval(heart_timeout)
                    this.socket_heart_timeout_map.delete(util);
                    this.socket_heart_last_time_map.delete(util);
                    NetServerUtil.close_client(server_type,util)
                }
            },10 * 1000)
            this.socket_heart_timeout_map.set(util, heart_timeout)
        }
        _map.server = net.createServer(async (socket) => {

                // console.log(`tcp 客户端连接 ${socket.remoteAddress}`);
                const raw_socket = new tcp_raw_socket(socket);
                _map.socket_set.add(raw_socket)
                    socket.on("close", () => {
                        _map.socket_set.delete(raw_socket)
                        const heart_timeout = this.socket_heart_timeout_map.get(raw_socket);
                        if (heart_timeout) {
                            clearInterval(heart_timeout);
                            this.socket_heart_timeout_map.delete(raw_socket);
                        }
                        this.socket_heart_last_time_map.delete(raw_socket)
                    })
                let auth = false
                socket.on('end', () => {
                    raw_socket.get_client().close();
                    // console.log('客户端断开连接', socket.remoteAddress);
                });
                // 处理错误事件
                socket.on('error', (err) => {
                    console.log('Socket 错误:', socket.remoteAddress);
                });
                start_heart(raw_socket)
                // 等待授权
                new Promise((resolve,reject) => {
                    const  timeout = setTimeout(() => {
                        // 超时未验证
                        raw_socket.get_client().close();
                        // console.log(`超时未验证 ${socket.remoteAddress}:${socket.remotePort}`);
                        this.socket_timeout_map.delete(socket)
                        this.socket_timeout_resolve_map.delete(socket)
                    }, 3000)
                    this.socket_timeout_map.set(socket, timeout)
                    this.socket_timeout_resolve_map.set(socket,resolve );
                }).then(()=>{
                    // console.log(`tcp 授权成功 ${socket.remoteAddress}`);
                    auth = true
                })
                raw_socket.get_client().add_on_data(async (data, tag_id) => {
                    try {
                        const {code, tcpBuffer} = NetUtil.getTcpData(data);
                        if(auth === false && code !== auth_code) {
                            return;
                        }
                        if(NetMsgType.heart === code) {
                            this.socket_heart_last_time_map.set(raw_socket, Date.now())
                            raw_socket.send_data_call(tag_id, Buffer.alloc(0))
                            return;
                        }
                        if(_map.call_resolve_map[tag_id]) {
                            _map.call_resolve_map[tag_id](tcpBuffer)
                            clearTimeout(_map.call_timeout_map[tag_id])
                            delete _map.call_resolve_map[tag_id]
                            delete _map.call_timeout_map[tag_id];
                            return;
                        }
                        const fun = msgServerMap[server_type][code]
                        if (!fun) return; // 没有处理函数
                        try {
                            await fun(tcpBuffer, raw_socket,tag_id);
                        } catch (e) {
                            console.error(e)
                        }
                    } catch (e) {
                        console.log(e);
                    }
                })
        });
        _map.server.listen(port, () => {
            console.log(`tcp服务器运行开始 ${port}`);
        });
    }

}
