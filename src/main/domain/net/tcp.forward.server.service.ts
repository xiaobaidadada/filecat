import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {server_item_type, server_type, tcp_forward_client_type} from "./type";
import net from "net";
import {ServerEvent} from "../../other/config";
import {NetClientUtil} from "./util/NetClientUtil";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_fig,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config
} from "../../../common/req/common.pojo";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {tcp_forward_client_service} from "./tcp.forward.client.service";
import {tcp_raw_socket} from "./util/tcp.client";
import {generateSaltyUUID} from "../../../common/StringUtil";


export const server_key = "sockets";
export const client_num_id_key = "client_num_id_key";



export class TcpForwardServerService {

    private client_map:{
        [key:string]:tcp_forward_client_type // key 是客户端 id
    } = {}
    public client_num_map:{
        [key:number]:tcp_forward_client_type // key 是客户端 id
    } = {}


    private global_socket_id = 1;

    get_socket_id() {
        // 两字节暂时这么多
        if(this.global_socket_id > 65535) {
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
    delete_client(client_id:string,client_num_id:number):void {
        const it = this.client_map[client_id];
        if(it) {
            const aa:server_type = it.client_util.data_map[server_key]
            if(!aa)return;
            for (const server  of Object.values(aa.server_map)) {
                server.server?.close()
            }
        }
        delete this.client_map[client_id];
        delete  this.client_num_map[client_num_id]
    }

    // 内存添加配置 也做持久化
    add_client(fig:tcp_forward_client_type) {
        fig.client_util.data_map[server_key] = fig.client_util.data_map[server_key]??{}
        const list = this.server_client_get()
        let it = list.find(v=>v.client_id == fig.client_id)
        if(it) {
            if(it.client_num_id == null) {
                it.client_num_id = this.get_new_client_num_id()
                fig.client_num_id = it.client_num_id
            }
            it.client_name  = fig.client_name
        } else {
            it = {
                client_id: fig.client_id,
                client_name: fig.client_name,
                status:fig.client_util.connected,
                proxy_fig_list: [],
                client_num_id: this.get_new_client_num_id()
            }
            list.push(it)
        }
        fig.client_num_id = it.client_num_id
        this.client_map[fig.client_id] = fig
        this.client_num_map[fig.client_num_id] = fig
        this.server_let_client_to_proxy(it)
        DataUtil.set(data_common_key.tcp_proxy_server_client_list,list,file_key.tcp_proxy_server_client)
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

    get_new_client_num_id() {
       let max = 0;
       const list = this.server_client_get()
        for (const item of list) {
            if(item.client_num_id != null && item.client_num_id > max) {
                max = item.client_num_id
            }
        }
        max++;
        return max;
    }


    server_let_client_to_proxy(item:tcp_proxy_server_client) {
        for (const open_fig of item.proxy_fig_list) {
            if(open_fig.open) {
                this.server_open_port_for_client(item, open_fig)
            }
        }
        const list = this.get_all_bridge_config()
        for (const bridge of list) {
            if(bridge.open && bridge.server_client_num_id === item.client_num_id) {
                this.start_bridge_config(bridge)
            }
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
            this.del_bridge_config_by_server_client_id(one.client_num_id)
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

    bridge_client_create_socket_for_server(data:Buffer, util: tcp_raw_socket,tag_id:number) {
        const info : {
            socket_id:number,
            client_proxy_port:number,
            client_proxy_host:string,
            client_num_id:number
        } = JSON.parse(data.toString())
        const client_num_id = util.data_map[client_num_id_key] as number
        const item = tcpForwardService.get_bridge_fig_by_id(client_num_id,info.client_num_id)
        if(!item) {
            // 服务器没有这个配置 就不继续了
            console.log(`不存在的配置 ${JSON.stringify(info)}`)
            return;
        }
        const client = this.client_num_map[info.client_num_id]
        client.client_util.send_data(NetMsgType.bridge_tcp_client_create_socket_for_server,Buffer.from(JSON.stringify({
            socket_id:info.socket_id,
            client_proxy_port:info.client_proxy_port,
            client_proxy_host:info.client_proxy_host,
            server_client_num_id:client_num_id
        })))
        util.send_data_call(tag_id,Buffer.alloc(0))
    }

    bridge_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const client_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        const client = this.client_num_map[client_id]
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(2,4))
        client.client_util?.send_data(NetMsgType.bridge_tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(socket_id),data.subarray(4)]))
    }

    bridge_client_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const client_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        const client = this.client_num_map[client_id]
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(2,4))
        client?.client_util?.send_data(NetMsgType.bridge_client_tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(socket_id),data.subarray(4)]))
    }

    bridge_close_port_for_client(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const fig = JSON.parse(data.toString()) as tcp_proxy_bridge_fig_item
        const server_client = this.client_num_map[fig.server_client_num_id]
        server_client.client_util?.send_data(NetMsgType.bridge_close_port_for_client,data)
    }



    bridge_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const client_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        const client = this.client_num_map[client_id]
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(2,4))
        client.client_util?.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(socket_id));

    }

    get_all_bridge_config(){
        let fig:tcp_proxy_bridge_fig_item[] = DataUtil.get(data_common_key.server_bridge_config_list,file_key.tcp_proxy_server_client);
        if(!fig){
            fig = []
            DataUtil.set(data_common_key.server_bridge_config_list,fig,file_key.tcp_proxy_server_client)
        }
        return fig;
    }

    get_bridge_fig_by_server_id(server_client_num_id:number) {
        const list = this.get_all_bridge_config()
        const r_list:tcp_proxy_bridge_fig_item[] = []
        for (const item of list) {
            if(item.server_client_num_id === server_client_num_id ){
                r_list.push(item)
            }
        }
        return r_list
    }

    get_bridge_fig_by_id(server_client_num_id:number,client_num_id:number) {
        const list = this.get_all_bridge_config()
        for (const item of list) {
            if(item.open) {
                if(item.server_client_num_id === server_client_num_id && item.client_num_id === client_num_id){
                    return item
                }
            }
        }
    }

    // init_bridge_config(){
    //     const list = this.get_all_bridge_config()
    //     for (const item of list) {
    //         this.start_bridge_config(item)
    //     }
    // }

    check_bridge_config(item:tcp_proxy_bridge_fig_item){
        if(!item.server_port || !item.client_proxy_port || !item.client_proxy_host) {
            throw `配置不全`
        }
        // 添加的时候端口不能冲突
        const list = this.get_all_bridge_config()
        for (const it of list) {
            if(it.server_port === item.server_port && item.id !== it.id && it.open){
                throw ` ${item.server_port} is already in use`
            }
        }
    }

    edit_bridge_config(item:tcp_proxy_bridge_fig_item){
        const list = this.get_all_bridge_config()
        const fig  = list.find(v=>v.id === item.id)
        this.close_bridge_config(item) // 先关闭老的
        this.check_bridge_config(item)
        Object.assign(fig,item)
        DataUtil.set(data_common_key.server_bridge_config_list,list,file_key.tcp_proxy_server_client)
        if(item.open) {
            setTimeout(()=>{
                this.start_bridge_config(item)
            },1000)
        }
    }

    add_bridge_config(item:tcp_proxy_bridge_fig_item){
        this.check_bridge_config(item)
        const server = this.client_num_map[item.server_client_num_id]
        const client = this.client_num_map[item.client_num_id]
        if(!server){
            throw `服务客户端不在线`
        }
        if(!client) {
            throw `代理客户端不在线`
        }
        const list = this.get_all_bridge_config()
        item.client_name = client.client_name
        item.server_client_name = server.client_name
        item.id = generateSaltyUUID()
        list.push(item)
        this.start_bridge_config(item)
        // 真实保存
        DataUtil.set(data_common_key.server_bridge_config_list,list,file_key.tcp_proxy_server_client)
    }

    del_bridge_config_by_server_client_id(server_client_num_id:number){
        const list = this.get_all_bridge_config()
        const new_list = []
        for (const item of list) {
            if(item.server_client_num_id !== server_client_num_id){
                new_list.push(item)
            }
        }
        DataUtil.set(data_common_key.server_bridge_config_list,new_list,file_key.tcp_proxy_server_client)
    }

    del_bridge_config(id:string){
        const list = this.get_all_bridge_config()
        const new_list = []
        for (const item of list) {
            if(item.id === id){
                this.close_bridge_config(item)
            } else {
                new_list.push(item)
            }
        }
        DataUtil.set(data_common_key.server_bridge_config_list,new_list,file_key.tcp_proxy_server_client)
    }

    close_bridge_config(item:tcp_proxy_bridge_fig_item){
        const client = this.client_num_map[item.client_num_id]
        client.client_util?.send_data(NetMsgType.bridge_close_port_for_client,Buffer.from(JSON.stringify(item)));
    }

    start_bridge_config(item:tcp_proxy_bridge_fig_item){
        if(item.open) {
            const client = this.client_num_map[item.client_num_id]
            client.client_util?.send_data(NetMsgType.bridge_open_port_for_client,Buffer.from(JSON.stringify(item)));
        } else {
            this.close_bridge_config(item)
        }
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
    // setTimeout(()=>{
    //     // tcpForwardService.init_bridge_config()
    //     tcpForwardService.add_bridge_config({
    //         server_port: 888,
    //         client_proxy_host: "127.0.0.1",
    //         client_proxy_port: 5567,
    //         client_num_id: 0,
    //         server_client_num_id: 0,
    //         open: true,
    //     })
    // },1000)
    // tcpForwardService.server_start(5678)
    // await tcpForwardService.client_connect_server(5678,"127.0.0.1")
    // tcpForwardService.server_open_port_for_client(5570,"123",5567,"192.168.5.7")
})