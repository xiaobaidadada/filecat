import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {tcp_forward_client_type} from "./type";
import {is_port_available} from "../../../common/node/findPort";
import net from "net";
import {ServerEvent} from "../../other/config";
import {NetClientUtil} from "./util/NetClientUtil";
import {tcp_raw_socket} from "./util/tcp.client";


export class TcpForwardService {

    private server_set_token:string = "123";
    public client_map:{
        [key:string]:tcp_forward_client_type // key 是客户端 id
    } = {}

    private server_service_port:number; // 服务器的服务端口给tcp的

    public server_socket_map:{
        [key:number]:net.Socket
    } = {}
    public client_socket_map:{
        [key:number]:net.Socket
    } = {}

    private global_socket_id = 1;

    public is_ok_token(hash_token:string){
        if(this.server_set_token == null) return false;
        return hash_token === NetUtil.get64Key(this.server_set_token);
    }

    // 开启一个 tcp 转发服务器 服务器
    server_start(port:number) {
        NetServerUtil.start_tcp_server(port,tcp_server_type.tcp_forward,NetMsgType.tcp_connect)
    }

    async client_connect_server(server_port:number,server_host:string) {
        const register = ()=>{
            const info :tcp_forward_client_type = {
                hash_token: NetUtil.get64Key("123")
            }
            return NetClientUtil.send_for_tcp_async(server_host,server_port,NetMsgType.tcp_connect, Buffer.from(JSON.stringify(info)));
        }
        await NetClientUtil.start_tcp(server_port, server_host, register,
            (state) => {

            });
    }

    // 服务器向客户端发起一个请求 想要获取 一个socket的建立
    server_open_port_for_client(server_same_port:number,client_id:string,client_proxy_port:number,client_proxy_host:string) {
        if(!is_port_available(server_same_port)){
            throw `server ${server_same_port} is not available`;
        }
        const client = this.client_map[client_id];
        if(!client) {
            throw ` client not found`;
        }
        const server = net.createServer((clientSocket) => {
            const socket_id = this.global_socket_id++;
            this.server_socket_map[socket_id] = clientSocket;
            client.client_util.send_data(NetMsgType.tcp_client_create_socket_for_server,Buffer.from(JSON.stringify({
                socket_id,
                client_proxy_port,
                client_proxy_host,
            })))
            // todo  on("drain", 内存优化
            clientSocket.on("data", (chunk) => {
                // 用户访问服务器建立的客户端
                client.client_util.send_data(NetMsgType.tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(socket_id),Buffer.from(chunk)]));
            })
            clientSocket.on("close",()=>{
                client.client_util.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(socket_id));
                delete this.server_socket_map[socket_id]
            })
        });
        server.listen(server_same_port, () => {
            console.log(`TCP 转发服务器 代理: ${server_same_port}`);
        });
        server.on('error', (err) => {
            console.log(err);
        });
        server.on('listening', () => {
            console.log(`TCP 转发服务器 代理正在监听${server_same_port}...`);

        });
    }

    server_on_data(data: Buffer, is_server:boolean) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        try {
            if(is_server){
                this.write_socket(  this.server_socket_map[socket_id],data)
            } else {
                this.write_socket( this.client_socket_map[socket_id],data)
            }
        } catch(err) {
            console.error(` tcp 转发服务器 写失败 ${err?.message}`);
        }
    }

    private write_socket( socket:net.Socket,data:Buffer) {
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

    server_tcp_socket_close(data: Buffer, is_server:boolean) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        if(is_server){
            this.server_socket_map[socket_id]?.destroy()
            delete this.server_socket_map[socket_id]
        } else {
            this.client_socket_map[socket_id]?.destroy()
            delete this.client_socket_map[socket_id]
        }
    }
}

export const tcpForwardService = new TcpForwardService();
ServerEvent.on("start", async (data) => {
    tcpForwardService.server_start(5678)
    await tcpForwardService.client_connect_server(5678,"127.0.0.1")
    tcpForwardService.server_open_port_for_client(5570,"123",5567,"192.168.5.7")
})