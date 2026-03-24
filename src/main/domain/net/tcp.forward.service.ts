import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {server_type, tcp_forward_client_type} from "./type";
import {is_port_available} from "../../../common/node/findPort";
import net from "net";
import {ServerEvent} from "../../other/config";
import {NetClientUtil} from "./util/NetClientUtil";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {
    tcp_proxy_client_fig,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config
} from "../../../common/req/common.pojo";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {tcp_raw_socket} from "./util/tcp.client";


export const server_key = "sockets";



export class TcpForwardService {

    private client_map:{
        [key:string]:tcp_forward_client_type // key 是客户端 id
    } = {}

    public server_client_socket_map:{
        [key:number]:tcp_raw_socket
    } = {}
    private server_list:server_type[] = []

    public client_socket_map:{
        [key:number]:net.Socket
    } = {}

    private global_socket_id = 1;


    // 内存删除配置 持久化不删除
    delete_client(client_id:string):void {
        const it = this.client_map[client_id];
        if(it) {
            const aa:server_type = it.client_util.data_map[server_key]
            if(!aa)return;
            for (const k  of Object.keys(aa.server_socket_map)) {
                aa.server_socket_map[k].destroy()
            }
        }
        delete this.client_map[client_id];
    }

    // 内存添加配置 也做持久化
    add_client(fig:tcp_forward_client_type) {
        fig.client_util.data_map[server_key] = fig.client_util.data_map[server_key]??{}
        const list = this.server_client_get()
        const it = list.find(v=>v.client_id == fig.client_id)
        this.client_map[fig.client_id] = fig
        if(it) {
            it.client_name  = fig.client_name
            this.server_let_client_to_proxy(it)
        } else {
            list.push({
                client_id: fig.client_id,
                client_name: fig.client_name,
                status:fig.client_util.connected,
                proxy_fig_list: []
            })
            DataUtil.set(data_common_key.tcp_proxy_server_client_list,list,file_key.tcp_proxy_server_client)
        }
    }

    public is_ok_token(hash_token:string){
        const k = this.server_fig_get().key
        if(k == null) return false;
        return hash_token === NetUtil.get64Key(k);
    }

    // 开启一个 tcp 转发服务器 服务器
    server_start(port:number) {
        NetServerUtil.start_tcp_server(port,tcp_server_type.tcp_forward,NetMsgType.tcp_connect)
    }


    // 服务器向客户端发起一个请求 想要获取 一个socket的建立
    server_open_port_for_client( fig:tcp_proxy_server_client,proxy_fig:tcp_proxy_client_item) {
        if(!is_port_available(proxy_fig.server_port)){
            throw `server ${proxy_fig.server_port} is not available`;
        }
        const client = this.client_map[fig.client_id];
        if(!client) {
            throw ` client not found`;
        }
        this.server_close_client_proxy(fig)
        const server_item:server_type = {
            proxy_fig:proxy_fig,
            fig,
            server_socket_map:{}
        }
        client.client_util.data_map[server_key] = server_item
        const server = net.createServer((clientSocket) => {
            const socket_id = this.global_socket_id++;
            server_item.server_socket_map[socket_id] = clientSocket;
            client.client_util.send_data(NetMsgType.tcp_client_create_socket_for_server,Buffer.from(JSON.stringify({
                socket_id,
                client_proxy_port:proxy_fig.proxy_port,
                client_proxy_host:proxy_fig.proxy_host,
            })))
            // todo  on("drain", 内存优化
            clientSocket.on("data", (chunk) => {
                // 用户访问服务器建立的客户端
                client.client_util.send_data(NetMsgType.tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(socket_id),Buffer.from(chunk)]));
            })
            clientSocket.on("close",()=>{
                client.client_util.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(socket_id));
                delete server_item.server_socket_map[socket_id]
            })
        });
        server.listen(proxy_fig.server_port, () => {
            console.log(`TCP 转发服务器 代理: ${proxy_fig.server_port}`);
        });
        server.on('error', (err) => {
            console.log(err);
        });
        server.on('listening', () => {
            console.log(`TCP 转发服务器 代理正在监听${proxy_fig.server_port}...`);
            server_item.server = server
            this.server_list.push(server_item)
        });
    }

    close_client() {
        const fig = this.client_fig_get()
        if(fig.serverIp && fig.open && fig.serverPort) {
            NetClientUtil.close_tcp(fig.serverIp,fig.serverPort)
        }
    }

    async client_init_to_server() {
        const fig = this.client_fig_get()
        if(fig.open) {
            const register = async ()=>{
                const info :tcp_forward_client_type = {
                    hash_token: NetUtil.get64Key(fig.key),
                    client_id: fig.client_id,
                    client_name: fig.client_name
                }
                const data = await NetClientUtil.send_for_tcp_async(fig.serverIp,fig.serverPort,NetMsgType.tcp_connect, Buffer.from(JSON.stringify(info)));
                const r_info = JSON.parse(data.toString());
                this.client_fig_save({client_id:r_info.client_id})
            }
            await NetClientUtil.start_tcp(fig.serverPort, fig.serverIp, register,
                (state) => {
                    this.client_staus = state
                    this.push_client_status()
                });
        }
    }

    client_on_data(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        try {
            this.write_socket( this.client_socket_map[socket_id],data)
        } catch(err) {
            console.error(` tcp 转发服务器 写失败 ${err?.message}`);
        }
    }

    write_socket( socket:net.Socket,data:Buffer) {
        if (!socket || socket.destroyed) {
            // console.warn(`socket  已关闭，丢弃数据`);
            return;
        }
        try {
            socket.write(data.subarray(2),(err)=>{
                if(err) {
                    console.error(` tcp 转发服务器 写失败 ${err?.message}`);
                }
            });
        } catch(err) {
            console.log(` tcp err: ${err?.message}`);
        }
    }

    client_tcp_socket_close(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        this.client_socket_map[socket_id]?.destroy()
        delete this.client_socket_map[socket_id]
    }

    server_fig_get() {
        let v:tcp_proxy_server_config = DataUtil.get(data_common_key.tcp_proxy_server_base,file_key.tcp_proxy_server_client)
        if(!v){
            v = new tcp_proxy_server_config()
            DataUtil.set(data_common_key.tcp_proxy_server_base,v,file_key.tcp_proxy_server_client)
        }
        return v;
    }

    server_client_get() {
        let list :tcp_proxy_server_client[]=  DataUtil.get(data_common_key.tcp_proxy_server_client_list,file_key.tcp_proxy_server_client)
        if(!list){
            list = [];
            DataUtil.set(data_common_key.tcp_proxy_server_client_list,list,file_key.tcp_proxy_server_client)
        }
        for (const it of list) {
            it.status = !!this.server_client_socket_map[it.client_id]
        }
        return list;
    }

    server_close_client_proxy(old_item:tcp_proxy_server_client) {
        // 先关服务器
        const new_server_list:server_type[] = []
        for (const server of this.server_list) {
            if(server.fig.client_id !== old_item.client_id){
                new_server_list.push(server)
                continue
            }
            server.server.close()
            for (const key of Object.keys(server.server_socket_map)) {
                server.server_socket_map[key].destroy()
            }
        }
        this.server_list = new_server_list
    }

    server_let_client_to_proxy(item:tcp_proxy_server_client) {
        for (const open_fig of item.proxy_fig_list) {
            if(open_fig.open)
                this.server_open_port_for_client(item,open_fig)
        }
    }

    server_client_save(item:tcp_proxy_server_client) {
        const list = this.server_client_get()
        const one = list.find(v=>v.client_id===item.client_id)
        if(one){
            this.server_close_client_proxy(one);
            for (const key of Object.keys(item)) {
                one[key] = item[key];
            }
            DataUtil.set(data_common_key.tcp_proxy_server_client_list,list,file_key.tcp_proxy_server_client)
            this.server_let_client_to_proxy(item)
            const client = this.client_map[one.client_id];
            client?.client_util.send_data(NetMsgType.tcp_server_update_client_info,Buffer.from(JSON.stringify({
                client_name:item.client_name
            })))
            return
        }
        throw "不存在的客户端"
    }

    // 服务器开启配置保存
    server_fig_save(fig:tcp_proxy_server_config) {
        DataUtil.set(data_common_key.tcp_proxy_server_base,fig,file_key.tcp_proxy_server_client)
        this.server_init()
    }

    client_fig_get() {
        let v:tcp_proxy_client_fig = DataUtil.get(data_common_key.tcp_proxy_client_fig,file_key.tcp_proxy_server_client)
        if(!v) {
            v = {client_name: "", key: "", open: false, serverIp: "", serverPort: 0}
            DataUtil.set(data_common_key.tcp_proxy_client_fig,v,file_key.tcp_proxy_server_client)
        }
        return v;
    }

    wssSet: Set<Wss> = new Set();
    client_staus:boolean = false;

    tcp_proxy_client_status(data: WsData<any>) {
        this.wssSet.add(data.wss)
        data.wss.setClose(()=>{
            this.wssSet.delete(data.wss)
        })
        return this.push_client_status()
    }

    push_client_status( ){
        const info = {
            status:this.client_staus
        }
        for (const wss of this.wssSet.values()) {
            wss.send(CmdType.tcp_proxy_client_status, info);
        }
        return info;
    }

    client_fig_save(fig:tcp_proxy_client_fig|any) {
        const old_fig = this.client_fig_get()
        for (const key of Object.keys(fig)) {
            old_fig[key] = fig[key];
        }
        DataUtil.set(data_common_key.tcp_proxy_client_fig,old_fig,file_key.tcp_proxy_server_client)
    }

    server_init() {
        const fig = this.server_fig_get()
        // 全部服务端口先关闭
        NetServerUtil.close_server(tcp_server_type.tcp_forward)

        for (const server of this.server_list) {
            for (const key of Object.keys(server.server_socket_map)) {
                server.server_socket_map[key].destroy();
            }
            server.server.close()
        }
        this.server_list = []
        if(fig.open) {
            this.server_start(fig.port);
        }
        setTimeout(()=>{
            const list = this.server_client_get()
            for (const item of list) {
                this.server_let_client_to_proxy(item)
            }
        },3000)
    }
}

export const tcpForwardService = new TcpForwardService();
ServerEvent.on("start", async (data) => {
    tcpForwardService.server_init()
    setTimeout(()=>{
         tcpForwardService.client_init_to_server()
    },500)
    // tcpForwardService.server_start(5678)
    // await tcpForwardService.client_connect_server(5678,"127.0.0.1")
    // tcpForwardService.server_open_port_for_client(5570,"123",5567,"192.168.5.7")
})