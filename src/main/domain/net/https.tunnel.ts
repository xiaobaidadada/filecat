import {NetServerUtil} from "./util/NetServerUtil";
import net from "net";
import {netService} from "./net.service";
import {NetMsgType, NetUtil, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";


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


    @tcp_server_msg(NetMsgType.https_tunnel_tcp_connect,tcp_server_type.https_tunnel)
    https_tunnel_server_connect(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const fig = netService.get_https_tunnel_fig()
        const info = JSON.parse(data.toString()) as {
            key:string,
            target_proxy_port:number,
            target_proxy_host:string
        }
        let ok = false;
        for (const key of fig.keys??[]) {
            if(info.key == key) {
                ok = true;
                break;
            }
        }
        if(!ok) {
            return;
        }
        // token校验成功 连接成功
        NetServerUtil.connect_success(util.get_client().get_socket());
        const clientSocket = util.get_client().get_socket();
        const socket_id = this.get_socket_id()
        try {
            const remoteSocket = net.connect(info.target_proxy_port, info.target_proxy_host);
            remoteSocket.on('connect', () => {
                util.send_data_call( tag_id,NetUtil.int16_to_buffer(socket_id))
                //  双向稳定转发
                // remoteSocket.pipe(clientSocket);
                remoteSocket.on('data', data => {
                    const ok = util.send_data(NetMsgType.https_tunnel_tcp_data,data as Buffer)
                    if(!ok) {
                        remoteSocket.pause()
                        util.get_client().get_socket().on('drain',()=>{
                            remoteSocket.resume()
                        })
                    }
                })
            });
            util.data_map[socket_id] = remoteSocket;
            const cleanup = () => {
                clientSocket.destroy();
                if (remoteSocket) remoteSocket.destroy();
            };
            clientSocket.on('error', cleanup);
            remoteSocket.on('error', cleanup);
            clientSocket.on('close', cleanup);
        } catch (err) {
            clientSocket.destroy();
        }
    }

    @tcp_server_msg(NetMsgType.https_tunnel_tcp_data,tcp_server_type.https_tunnel)
    https_tunnel_tcp_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const socket_id = NetUtil.buffer_to_int16(data.subarray(0,2))
        const socket:net.Socket = util.data_map[socket_id];
        if(!socket) {
            return
        }
        const ok = socket.write(data.subarray(2))
        if(!ok) {
            util.get_client().get_socket().pause()
            socket.on('drain',()=>{
                util.get_client().get_socket().resume()
            })
        }
    }

}

// 不作为http controller
export const https_tunnel = new HttpsTunnel();