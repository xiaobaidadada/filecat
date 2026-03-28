import {tcp_proxy_client_fig, tcp_proxy_server_client, tcp_proxy_server_config} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {NetClientUtil} from "./util/NetClientUtil";
import {NetServerUtil} from "./util/NetServerUtil";
import {NetMsgType, NetUtil, tcp_server_type} from "./util/NetUtil";
import {server_type, tcp_forward_client_type} from "./type";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import net from "net";


export class tcp_forward_server_service {



    public client_socket_map:{
        [key:number]:net.Socket
    } = {}




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

    client_on_data(data: Buffer) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        try {
            this.write_socket( this.client_socket_map[socket_id],data)
        } catch(err) {
            console.error(` tcp 转发服务器 写失败 ${err?.message}`);
        }
    }

    client_fig_get() {
        let v:tcp_proxy_client_fig = DataUtil.get(data_common_key.tcp_proxy_client_fig,file_key.tcp_proxy_server_client)
        if(!v) {
            v = {client_name: "", key: "", open: false, serverIp: "", serverPort: 0}
            DataUtil.set(data_common_key.tcp_proxy_client_fig,v,file_key.tcp_proxy_server_client)
        }
        return v;
    }

    close_client() {
        const fig = this.client_fig_get()
        if(fig.serverIp && fig.open && fig.serverPort) {
            NetClientUtil.close_tcp(fig.serverIp,fig.serverPort)
        }
    }

    client_fig_save(fig:tcp_proxy_client_fig|any) {
        const old_fig = this.client_fig_get()
        for (const key of Object.keys(fig)) {
            if(fig[key] == null) continue;
            old_fig[key] = fig[key];
        }
        DataUtil.set(data_common_key.tcp_proxy_client_fig,old_fig,file_key.tcp_proxy_server_client)
    }



    wssSet: Set<Wss> = new Set();
    // client_staus:boolean = false;

    push_client_status( ){
        const fig = this.client_fig_get()
        const info = {
            status: NetClientUtil.is_alive(fig.serverIp,fig.serverPort),
        }
        for (const wss of this.wssSet.values()) {
            wss.send(CmdType.tcp_proxy_client_status, info);
        }
        return info;
    }


    tcp_proxy_client_status(data: WsData<any>) {
        this.wssSet.add(data.wss)
        data.wss.setClose(()=>{
            this.wssSet.delete(data.wss)
        })
        return this.push_client_status()
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
                    // this.client_staus = state
                    this.push_client_status()

                });
        }
    }
}

export const tcp_forward_client_service = new tcp_forward_server_service();