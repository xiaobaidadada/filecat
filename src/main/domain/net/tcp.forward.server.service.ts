import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {server_item_type, server_type, tcp_forward_client_type} from "./type";
import net from "net";
import {ServerEvent} from "../../other/config";
import {NetClientUtil} from "./util/NetClientUtil";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {
    server_client_proxy,
    tcp_proxy_client_fig,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config
} from "../../../common/req/common.pojo";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {tcp_forward_client_service} from "./tcp.forward.client.service";


export const server_key = "sockets";



export class TcpForwardServerService {

    private client_map:{
        [key:string]:tcp_forward_client_type // key 是客户端 id
    } = {}


    private global_socket_id = 1;

    get_socket_id() {
        if(this.global_socket_id > 32767) {
            this.global_socket_id = 1
        }
        return this.global_socket_id++
    }

    push_all_client_update_server_info() {
        const info = this.server_fig_get()
        for (const key of Object.keys(this.client_map)) {
            const client = this.client_map[key];
            client.client_util.send_data(NetMsgType.tcp_server_update_client_info, Buffer.from(JSON.stringify({
                token:info.option_keys?.[0],
                server_port:info.port
            })));
        }
    }

    // 获取所有开启的 正在运行的 服务器端口占用
    get_all_open_server_client_proxy_fig() {
        const list:server_client_proxy[] = []
        for (const client_id of Object.keys(this.client_map)) {
            const client = this.client_map[client_id];
            const data_map:server_type = client.client_util.data_map[server_key];
            for (const server_port of Object.keys(data_map.server_map)) {
               const server:server_item_type = data_map.server_map[server_port];
                list.push({
                    server_port:server.proxy_fig.server_port,
                    proxy_host: server.proxy_fig.proxy_host,
                    proxy_port: server.proxy_fig.proxy_port,
                    client_name: server.fig.client_name,
                    server_port_note: server.proxy_fig.note,
                })
            }
        }
        return list
    }

    // 内存删除配置 持久化不删除
    delete_client(client_id:string):void {
        const it = this.client_map[client_id];
        if(it) {
            const aa:server_type = it.client_util.data_map[server_key]
            if(!aa)return;
            for (const server  of Object.values(aa.server_map)) {
                server.server?.close()
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
        const server_info = this.server_fig_get()
        for (const key of server_info.option_keys??[]) {
            let r =  hash_token === NetUtil.get64Key(key);
            if(r ) {
                return  true;
            }
        }
        return false;
    }

    // 开启一个 tcp 转发服务器 服务器
    server_start(port:number) {
        NetServerUtil.start_tcp_server(port,tcp_server_type.tcp_forward,NetMsgType.tcp_connect)
    }


    server_close_client_proxy(old_item:tcp_proxy_server_client) {
        // 先关服务器
        const data_map:server_type = this.client_map[old_item.client_id].client_util.data_map[server_key]
        if(!data_map)return;
        for (const server_port of Object.keys(data_map.server_map)) {
            const server:server_item_type = data_map.server_map[server_port]
            server.server?.close()
        }
    }

    // 服务器向客户端发起一个请求 想要获取 一个socket的建立
    server_open_port_for_client( fig:tcp_proxy_server_client,proxy_fig:tcp_proxy_client_item) {
        const client = this.client_map[fig.client_id];
        if(!client) {
            // 客户端还没有连接
            return;
        }
        const data_map:server_type = client.client_util.data_map[server_key]
        if(data_map.server_map[proxy_fig.server_port]) {
            // 创建过了
            data_map.server_map[proxy_fig.server_port]?.server?.close()
        }
        const server_item:server_item_type = {
            proxy_fig:proxy_fig,
            fig,
            server_socket_map:{}
        }
        data_map.server_map[proxy_fig.server_port] = server_item
        const server = net.createServer((clientSocket) => {
            const socket_id = this.get_socket_id();
            // socket 添加
            server_item.server_socket_map[socket_id] = clientSocket;
            data_map.all_server_socket_map[socket_id] = clientSocket;
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
                // socket 删除
                delete server_item.server_socket_map[socket_id]
                delete data_map?.all_server_socket_map[socket_id]
            })
        });
        server.on("close",()=>{
            for (const key of Object.keys(server_item.server_socket_map)) {
                server_item.server_socket_map[key]?.destroy()
            }
        })
        server.listen(proxy_fig.server_port, () => {
            console.log(`TCP 转发服务器 代理: ${proxy_fig.server_port}`);
        });
        server.on('error', (err) => {
            console.log(err);
        });
        server.on('listening', () => {
            console.log(`TCP 转发服务器 代理正在监听${proxy_fig.server_port}...`);
            server_item.server = server
        });
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
            it.status = !!this.client_map[it.client_id]?.client_util?.connected
        }
        return list;
    }


    server_let_client_to_proxy(item:tcp_proxy_server_client) {
        for (const open_fig of item.proxy_fig_list) {
            if(open_fig.open)
                this.server_open_port_for_client(item,open_fig)
        }
    }

    server_client_del({client_id}:{client_id:string}) {
        const list = this.server_client_get()
        const one = list.find(v=>v.client_id===client_id)
        if(one){
            this.client_map[one.client_id]?.client_util.send_data(NetMsgType.tcp_server_del_client,Buffer.alloc(0))
            this.server_close_client_proxy(one);
            const new_list = list.filter(v=>v.client_id!==client_id);
            DataUtil.set(data_common_key.tcp_proxy_server_client_list,new_list,file_key.tcp_proxy_server_client)
            this.client_map[client_id]?.client_util.get_client().close()
            delete this.client_map[client_id]
            return
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
    server_fig_save(param:{
        fig:tcp_proxy_server_config,
        notice_client:boolean
    }) {
        DataUtil.set(data_common_key.tcp_proxy_server_base,param.fig,file_key.tcp_proxy_server_client)
        if(param.notice_client){
            this.push_all_client_update_server_info()
        }
        this.server_init()
    }







    server_init() {
        const fig = this.server_fig_get()
        // 全部服务端口先关闭
        NetServerUtil.close_server(tcp_server_type.tcp_forward)
        for (const client_id of Object.keys(this.client_map)) {
            const client = this.client_map[client_id];
            const data_map:server_type = client.client_util.data_map[server_key];
            for (const server_port of Object.keys(data_map.server_map)) {
                const server:server_item_type = data_map.server_map[server_port];
                server.server.close()
                for (const socket of Object.values(server.server_socket_map)) {
                    socket.destroy()
                }
            }
        }
        if(fig.open) {
            this.server_start(fig.port);
        }
    }
}

export const tcpForwardService = new TcpForwardServerService();
ServerEvent.on("start", async (data) => {
    tcpForwardService.server_init()
    setTimeout(()=>{
        tcp_forward_client_service.client_init_to_server()
    },500)
    // tcpForwardService.server_start(5678)
    // await tcpForwardService.client_connect_server(5678,"127.0.0.1")
    // tcpForwardService.server_open_port_for_client(5570,"123",5567,"192.168.5.7")
})