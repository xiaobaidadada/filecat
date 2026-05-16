import {NetServerUtil} from "./util/NetServerUtil";
import net from "net";
import {netService} from "./net.service";
import {NetMsgType, NetUtil, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";
import {https_tunnel_server_key} from "../../../common/req/net.pojo";


let key_used_size_map: {[key:string]:number} = {}
let socket_key_map: {[key:number]:string} = {}

export class HttpsTunnel {



    // public client_socket_map:{
    //     [key:number]:net.Socket
    // } = {}

    private global_socket_id = 1;

    get_socket_id() {
        // 两字节暂时这么多
        if(this.global_socket_id > 65535) {
            this.global_socket_id = 1
        }
        return this.global_socket_id++
    }

    private find_key_info(key_value:string): https_tunnel_server_key | undefined {
        const fig = netService.get_https_tunnel_fig()
        for (const key of fig.keys ?? []) {
            if (key.key === key_value) {
                return key;
            }
        }
        return undefined;
    }

    private get_key_used_size(key_info:https_tunnel_server_key) {
        if (key_info.size == null) {
            return 0;
        }
        const key_value = key_info.key;
        if (key_used_size_map[key_value] == null) {
            key_used_size_map[key_value] = key_info.used_size ?? 0;
        }
        return key_used_size_map[key_value];
    }

    private can_use_traffic(key_info:https_tunnel_server_key, data_size:number) {
        if (key_info.size == null) {
            return true;
        }
        return this.get_key_used_size(key_info) + data_size <= key_info.size;
    }

    private add_key_traffic(key_info:https_tunnel_server_key, data_size:number) {
        if (key_info.size == null) {
            return;
        }
        const key_value = key_info.key;
        key_used_size_map[key_value] = this.get_key_used_size(key_info) + data_size;
    }

    private is_forbid_target(key_info:https_tunnel_server_key, host:string, port:number) {
        const list = key_info.forbid_regexp_list;
        if (!list?.length) {
            return false;
        }
        const full_url = `https://${host}:${port}/`;
        for (const pattern of list) {
            if (!pattern) {
                continue;
            }
            try {
                const regexp = new RegExp(pattern);
                if (regexp.test(host) || regexp.test(full_url)) {
                    return true;
                }
            } catch (e) {
                console.error(`https tunnel 禁止访问正则无效`, pattern, e);
            }
        }
        return false;
    }

    private cleanup_socket(socket_id:number, clientSocket:net.Socket, remoteSocket?:net.Socket) {
        delete socket_key_map[socket_id];
        clientSocket.destroy();
        if (remoteSocket) {
            remoteSocket.destroy();
        }
    }

    public persist_traffic_stats() {
        const fig = netService.get_https_tunnel_fig()
        let need_save = false;
        for (const key of fig.keys ?? []) {
            if (key.size == null) {
                continue;
            }
            const used_size = key_used_size_map[key.key];
            if (used_size != null && key.used_size !== used_size) {
                key.used_size = used_size;
                need_save = true;
            }
        }
        if (need_save) {
            netService.save_https_tunnel_fig(fig);
        }
    }

    public clear_runtime_traffic_stats() {
        key_used_size_map = {}
        socket_key_map = {}
    }


    @tcp_server_msg(NetMsgType.https_tunnel_tcp_connect,tcp_server_type.https_tunnel)
    https_tunnel_server_connect(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as {
            key:string,
            target_proxy_port:number,
            target_proxy_host:string
        }
        const key_info = this.find_key_info(info.key);
        if(!key_info) {
            console.log(`未验证请求`)
            return;
        }
        if (this.is_forbid_target(key_info, info.target_proxy_host, info.target_proxy_port)) {
            console.log(`禁止访问网站 ${info.target_proxy_host}`)
            return;
        }
        if (!this.can_use_traffic(key_info, 0)) {
            console.log(`流流量用完 ${key_info.key}`)
            return;
        }
        const clientSocket = util.get_client().get_socket();
        const socket_id = this.get_socket_id()
        NetServerUtil.connect_success(util.get_client().get_socket());
        let cleaned = false;

        const cleanup = (reason?: string) => {
            if (cleaned) return;
            cleaned = true;
            try {
                util.get_client()?.close()
                delete util.data_map[socket_id];
                delete socket_key_map[socket_id];
                clientSocket.destroy();
            } catch {}
            try {
                remoteSocket.destroy();
            } catch {}
            // 可选 debug
            // console.log(`cleanup socket ${socket_id}`, reason);
        };
        let remoteSocket: any;
        try {
            remoteSocket = net.connect(info.target_proxy_port, info.target_proxy_host);
            util.data_map[socket_id] = remoteSocket;

            remoteSocket.setTimeout(15000);
            remoteSocket.on('timeout', () => cleanup('timeout'));

            remoteSocket.on('connect', () => {
                socket_key_map[socket_id] = key_info.key;
                util.send_data_call( tag_id,NetUtil.int16_to_buffer(socket_id))
                //  双向稳定转发
                // remoteSocket.pipe(clientSocket);
                remoteSocket.on('data', data => {
                    if (!this.can_use_traffic(key_info, data.length)) {
                        console.log(`流流量用完 ${key_info.key}`)
                        cleanup('traffic limit');
                        // this.cleanup_socket(socket_id, clientSocket, remoteSocket);
                        return;
                    }
                    this.add_key_traffic(key_info, data.length);
                    const ok = util.send_data(NetMsgType.https_tunnel_tcp_data,data as Buffer)
                    if (!ok) {
                        remoteSocket.pause();
                        clientSocket.once('drain', () => {
                            if (!cleaned) remoteSocket.resume();
                        });
                    }
                })
            });

            // ===== error 兜底（关键）=====
            remoteSocket.on('error', (err: any) => {
                cleanup('remote error');
            });

            clientSocket.on('error', () => cleanup('client error'));

            remoteSocket.on('close', () => cleanup('remote close'));
            clientSocket.on('close', () => cleanup('client close'));

            remoteSocket.on('end', () => cleanup('remote end'));
            clientSocket.on('end', () => cleanup('client end'));
        } catch (err) {
            cleanup('exception');
        }
    }

    @tcp_server_msg(NetMsgType.https_tunnel_tcp_data,tcp_server_type.https_tunnel)
    https_tunnel_tcp_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const socket_id = NetUtil.buffer_to_int16(data.subarray(0,2))
        const socket:net.Socket = util.data_map[socket_id];
        if(!socket) {
            return
        }
        const key_value = socket_key_map[socket_id];
        const key_info = key_value ? this.find_key_info(key_value) : undefined;
        const real_data = data.subarray(2);
        if (key_info) {
            if (!this.can_use_traffic(key_info, real_data.length)) {
                console.log(`流流量用完 ${key_info.key}`)
                delete util.data_map[socket_id];
                this.cleanup_socket(socket_id, util.get_client().get_socket(), socket);
                return;
            }
            this.add_key_traffic(key_info, real_data.length);
        }
        const ok = socket.write(real_data)
        if(!ok) {
            util.get_client().get_socket().pause()
            socket.once('drain',()=>{
                util.get_client().get_socket().resume()
            })
        }
    }

}

// 不作为http controller
export const https_tunnel = new HttpsTunnel();
