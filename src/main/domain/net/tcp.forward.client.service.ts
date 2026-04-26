import {
    tcp_proxy_bridge_fig_item,
    tcp_proxy_client_all_fig,
    tcp_proxy_client_fig,
    tcp_proxy_client_item
} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {NetClientUtil} from "./util/NetClientUtil";
import {NetMsgType, NetUtil} from "./util/NetUtil";
import {bridge_server_item_type, server_item_type, server_type, tcp_forward_client_type} from "./type";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import net from "net";
import {server_key} from "./tcp.forward.server.service";
import {tcp_raw_socket} from "./util/tcp.client";
import {TcpForwardUtil} from "./tcp.forward.util";


export class tcp_forward_server_service {



    // 用于对方需要自己创建的
    public client_socket_map:{
        [key:number]:net.Socket
    } = {}
    // 用作服务器内自己创建的
    public server_socket_map:{
        [key:number]:net.Socket
    } = {}

    public bridge_server_client_map:{
        [key:number]:bridge_server_item_type // key 服务器端口
    } = {}


    client_bridge_get_all_fig() {
        const list:tcp_proxy_bridge_fig_item[] = []
        for (const value of Object.values(this.bridge_server_client_map)) {
            list.push(value.fig)
        }
        return list
    }


    client_tcp_socket_close(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        this.client_socket_map[socket_id]?.destroy()
        delete this.client_socket_map[socket_id]
    }

    client_bridge_tcp_socket_close(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        this.server_socket_map[socket_id]?.destroy()
        delete this.server_socket_map[socket_id]
    }


    client_bridge_close_port_for_client(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const fig = JSON.parse(data.toString()) as tcp_proxy_bridge_fig_item
        for (const port of Object.keys(this.bridge_server_client_map)) {
            const server:bridge_server_item_type = this.bridge_server_client_map[port]
            if(fig.server_port !== server.fig.server_port) {
                continue;
            }
            console.log(`关闭服务器 ${fig.server_port}` )
            for (const socket of Object.values(server.server_socket_map)) {
                socket?.destroy()
            }
            server.server?.close()
            console.log( `关闭 tcp server ${port}` )
            delete this.bridge_server_client_map[port];
            break
        }
        this.push_client_status()
    }

    client_on_data(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        try {
            TcpForwardUtil.write_socket(this.client_socket_map[socket_id],data)
            // this.write_socket( this.client_socket_map[socket_id],data)
        } catch(err) {
            console.error(` tcp client 转发服务器 写失败 ${err?.message}`);
        }
    }

    server_client_on_data(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        try {
            TcpForwardUtil.write_socket(this.server_socket_map[socket_id],data)
            // this.write_socket( this.server_socket_map[socket_id],data)
        } catch(err) {
            console.error(` tcp server 转发服务器 写失败 ${err?.message}`);
        }
    }

    client_fig_get() {
        const fig:tcp_proxy_client_all_fig = DataUtil.get(data_common_key.tcp_proxy_client_all_fig,file_key.tcp_proxy_server_client)??{list:[]}
        // let v:tcp_proxy_client_fig = DataUtil.get(data_common_key.tcp_proxy_client_fig,file_key.tcp_proxy_server_client)
        // if(!v) {
        //     v = {client_name: "", key: "", open: false, serverIp: "", serverPort: 0}
        //     DataUtil.set(data_common_key.tcp_proxy_client_fig,v,file_key.tcp_proxy_server_client)
        // }
        for (const f of fig.list) {
            f.status = NetClientUtil.is_alive(f.serverIp,f.serverPort)
        }
        return fig;
    }

    del_client_try_timer(fig:tcp_proxy_client_fig)  {
        const open_try_timer_key = `${fig.serverIp}_${fig.serverPort}`
        clearTimeout(this.open_try_timer_map[open_try_timer_key])
        delete this.open_try_timer_map[open_try_timer_key]
    }

    close_client() {
        const all = this.client_fig_get()
        for (const fig of all.list) {
            if(fig.serverIp && fig.open && fig.serverPort) {
                NetClientUtil.close_tcp(fig.serverIp,fig.serverPort)
            }
            this.del_client_try_timer(fig)
        }
        for (const port of Object.keys(this.bridge_server_client_map)) {
            const server:bridge_server_item_type =  this.bridge_server_client_map[port];
            for (const socket of Object.values(server.server_socket_map)) {
                socket?.destroy()
            }
            server.server?.close()
            console.log( `关闭 tcp server ${port}` )
            delete this.bridge_server_client_map[port];
        }
        this.push_client_status()
    }

    check_ip_port(list:tcp_proxy_client_fig[],fig:tcp_proxy_client_fig) {
        for (const f of list) {
            if(f.serverIp === fig.serverIp && f.serverPort === fig.serverPort) {
                throw "Same configuration already exists"
            }
        }
    }

    client_fig_save(fig:tcp_proxy_client_fig) {
        const old_fig = this.client_fig_get()
        if(fig.client_num_id != null) {
            for (const f of old_fig.list) {
                if(f.client_num_id === fig.client_num_id) {
                    for (const key of Object.keys(fig)) {
                        if(fig[key] == null) continue;
                        f[key] = fig[key];
                    }
                }
            }
        } else if(fig.index != null) {
            if(fig.index === old_fig.list.length) {
                this.check_ip_port(old_fig.list,fig)
                old_fig.list.push(fig)
            } else {
                const f = old_fig.list[fig.index];
                for (const key of Object.keys(fig)) {
                    if(fig[key] == null) continue;
                    f[key] = fig[key];
                }
            }
        }
        DataUtil.set(data_common_key.tcp_proxy_client_all_fig,old_fig,file_key.tcp_proxy_server_client)
    }



    wssSet: Set<Wss> = new Set();
    // client_staus:boolean = false;

    push_client_status( ){
        for (const wss of this.wssSet.values()) {
            wss.send(CmdType.tcp_proxy_client_status, {});
        }
    }


    tcp_proxy_client_status(data: WsData<any>) {
        this.wssSet.add(data.wss)
        data.wss.setClose(()=>{
            this.wssSet.delete(data.wss)
        })
        return this.push_client_status()
    }

    open_try_timer_map:{[key:string]:NodeJS.Timeout} = {}

    async open_client(fig:tcp_proxy_client_fig) {
        if (fig.open) {
            const register = async () => {
                const info: tcp_forward_client_type = {
                    hash_token: NetUtil.get64Key(fig.key),
                    // client_id: fig.client_id,
                    client_num_id: fig.client_num_id,
                    client_name: fig.client_name
                }
                const data = await NetClientUtil.send_for_tcp_async(fig.serverIp, fig.serverPort, NetMsgType.tcp_connect, Buffer.from(JSON.stringify(info)));
                const r_info = JSON.parse(data.toString());
                fig.client_num_id = r_info.client_num_id
                this.client_fig_save(fig);
            }
            const open_try_timer_key = `${fig.serverIp}_${fig.serverPort}`
            this.del_client_try_timer(fig)
            try {
                await NetClientUtil.start_tcp(fig.serverPort, fig.serverIp, register,
                    (state) => {
                        // this.client_staus = state
                        this.push_client_status()
                    });
            } catch (err) {
                console.log(`第一次尝试连接失败 10秒后重试 ${open_try_timer_key} ${err?.message}`);
                this.open_try_timer_map[open_try_timer_key] = setTimeout(() => {
                    this.open_client(fig).catch(err => console.log(err));
                }, 10_000)
                throw `第一次尝试连接失败 10秒后重试 ${open_try_timer_key} ${err?.message}`;
            }
        } else {
            this.del_client_try_timer(fig)
        }
    }

    async client_init_to_server() {
        const fig_all = this.client_fig_get()
        for (const fig of fig_all.list??[]) {
            await this.open_client(fig).catch(console.error)
        }
    }



    async open_port_for_client( fig:tcp_proxy_bridge_fig_item,util: tcp_raw_socket) {
        let server_item = this.bridge_server_client_map[fig.server_port];
        if(!server_item) {
            server_item = {
                fig,
                server_socket_map: {},
            }
            this.bridge_server_client_map[fig.server_port] = server_item;
        }
        // const client_fig = this.client_fig_get()
        const server_socket = util.get_client();

        const server = net.createServer(async (clientSocket) => {
            const socket_id = NetUtil.buffer_to_int16(( await server_socket.send_data_async(NetMsgType.get_global_socket_id, Buffer.alloc(0))).tcpBuffer)

            // socket 添加
            server_item.server_socket_map[socket_id] = clientSocket;
            this.server_socket_map[socket_id] = clientSocket;

            const info = {
                socket_id,
                client_proxy_port:fig.client_proxy_port,
                client_proxy_host:fig.client_proxy_host,
                client_num_id:fig.client_num_id,
                server_client_num_id:fig.server_client_num_id
            }
            await server_socket.send_data_async(NetMsgType.bridge_client_create_socket_for_server, Buffer.from(JSON.stringify(info)))

            clientSocket.on("data", (chunk) => {
                // 用户访问服务器建立的客户端
                const ok = server_socket.send_data(NetMsgType.bridge_client_tcp_socket_data,
                    Buffer.concat([NetUtil.int16_to_buffer(fig.client_num_id),NetUtil.int16_to_buffer(socket_id),Buffer.from(chunk)]))
                if(!ok) {
                    clientSocket.pause()
                    server_socket.get_socket().once('drain',()=>{
                        clientSocket.resume()
                    })
                }
            })
            clientSocket.on("close",()=>{
                server_socket.send_data(NetMsgType.bridge_tcp_socket_close,
                    Buffer.concat([NetUtil.int16_to_buffer(fig.client_num_id),NetUtil.int16_to_buffer(socket_id)]))
                delete server_item.server_socket_map[socket_id]
                delete this.server_socket_map[socket_id]
            })
        });
        // 先关闭如果有的话
        await NetUtil.close_server(server_item.server,server_item.server_socket_map)
        server.on("close",()=>{
            for (const key of Object.keys(server_item.server_socket_map)) {
                server_item.server_socket_map[key]?.destroy()
            }
        })
        server.listen(fig.server_port, () => {
            console.log(`TCP 转发服务器 代理: ${fig.server_port}`);
        });
        server_item.server = server
        server.on('error', (err) => {
            console.log(err);
        });
        server.on('listening', () => {
            console.log(`TCP 转发服务器 代理正在监听${fig.server_port}...`);
            this.push_client_status()
        });
    }
}

export const tcp_forward_client_service = new tcp_forward_server_service();