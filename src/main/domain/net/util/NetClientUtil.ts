import {msgClientMap, NetMsgType, NetUtil} from "./NetUtil";
import {tcp_client, tcp_raw_client} from "./tcp.client";
import {tcp_client_options} from "./type";


export const net_timeout = 1000 * 15;

export class NetClientUtil {

    static tcp_client_map: {
        [key: string]: tcp_client;
    }


    public static send_for_tcp(server_host: string, server_port: number,type: NetMsgType, data: Buffer,tag_id?:number) {
        try {
            // this.tcp_client.sendToSocket(NetUtil.head_0,buffer);
            // this.tcp_client.fastSendData(NetUtil.geRawTcpBufferList(type, data));
            const v = this.tcp_client_map[this.get_key({
                server_host, server_port
            })];
            if (!v) return
            v.send_data(type,data,tag_id)
        } catch (e) {
            console.log(e)
        }
    }

    // 发送到服务器 并 await 服务器返回的数据 服务器需要 根据 head 返回数据
    public static send_for_tcp_async(server_host: string, server_port: number,type: NetMsgType, data: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const key = this.get_key({
                server_host, server_port
            })
            const v = this.tcp_client_map[key];
            if (!v) {
                reject({message:"未连接"})
                return
            }
            v.send_data_async(type,data).catch(reject).then(resolve)
        })
    }



    public static close_tcp(server_host: string, server_port: number) {
        const key = this.get_key({
            server_host, server_port
        })
        const v = this.tcp_client_map[key];
        if (!v) return
        v.close();
        delete this.tcp_client_map[key];
        console.log(`tcp客户端关闭 ${server_host}:${server_port}`);
    }


    public static is_alive(server_host: string, server_port: number): boolean {
        return this.tcp_client_map[this.get_key({
            server_host, server_port
        })]?.get_raw_client()?.connected
    }

    public static get_key(options: tcp_client_options) {
        return `${options.server_host}:${options.server_port}`;
    }

    public static async start_tcp(serverPort: number, serverIp: string, close_call: () => void, state_call: (state: boolean) => void) {
        const opt = {
            server_host: serverIp,
            server_port: serverPort,
        }
        const key = this.get_key(opt)
        const client = new tcp_client(opt)
        if (this.tcp_client_map[key]) {
            this.tcp_client_map[key].close()
        }
        this.tcp_client_map[key] = client
        await client.connect();
        state_call(true)
        client.get_raw_client().on_connect(() => {
            state_call(true)
        })
        client.get_raw_client().on_close(() => {
            state_call(false)
            close_call();
        })
    }


}
