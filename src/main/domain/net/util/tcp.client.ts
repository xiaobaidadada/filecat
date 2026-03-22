import {tcp_client_options} from "./type";
import net from "net";
import {tcp_stream_util} from "./tcp_stream_util";
import {msgClientMap, NetMsgType, NetUtil} from "./NetUtil";
import {net_timeout, NetClientUtil} from "./NetClientUtil";
import {withLock} from "../../../../common/fun.util";
import {CommonUtil} from "../../../../common/common.util";

export class tcp_raw_socket {
    protected client:tcp_stream_util

    constructor(socket?:net.Socket) {
        this.client = new tcp_stream_util(socket??new net.Socket());
        this.send_data = this.client.send_data.bind(this.client);
    }

    get_client(){
        return this.client;
    }

    on_close(fun:()=>void) {
        this.client.get_socket().on("close", ()=>{
            try {
                fun()
            } catch (e) {
                console.error(e);
            }
        });
    }


    on_connect(fun:()=>void) {
        this.client.get_socket().on("connect", ()=>{
            try {
                fun()
            } catch (e) {
                console.error(e);
            }
        });
    }

    send_data:(code_type: NetMsgType, buffer: Buffer,tag_id?:number)=>void
}

export class tcp_raw_client extends tcp_raw_socket{

    private options: tcp_client_options
    private reconnect_timeout:NodeJS.Timeout; // 客户端重试连接
    private closed = false;
    private is_connected = false;

    constructor(
        options: tcp_client_options) {
        super();
        this.options = options;
    }

    reconnect() {
        if(this.closed) {
            return ;
        }
        if(this.reconnect_timeout) {
            return;
        }
        console.log('10秒后重连tcp服务器');
        this.reconnect_timeout = setTimeout(()=>{
            this.reconnect_timeout = undefined;
            if(this.closed) {
                return ;
            }
            this.connect().then(console.error);
        },10*1000)
    }

    close () {
        console.log(`客户端关闭`)
        this.closed = true;
        this.client?.close();
    }

    get connected() {
        return this.is_connected;
    }

    async connect() {
        this.client.get_socket().on("close", () => {
            this.is_connected = false;
            this.reconnect();
        })
        this.client.get_socket().on('end', () => {
            this.close();
            console.log('服务器断开连接');
        });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(()=>{
                reject(new Error(`tcp 客户端 连接超时 ${this.options.server_host}  ${this.options.server_port}`));
                this.close()
            }, 10_000)
            this.client.get_socket().connect(this.options.server_port, this.options.server_host, () => {
                clearTimeout(timeout);
                console.log('tcp服务器握手完成');
                this.is_connected = true;
                resolve (true);
            });
        })
    }


}


export class tcp_client {

    private client:tcp_raw_client
    private heart_fun:NodeJS.Timeout;
    private call_resolve_map: { [key: number]: any } = {}
    private call_resolve_timeout_map: { [key: number]: any } = {}

    constructor(
        options: tcp_client_options) {
        this.client = new tcp_raw_client(options);
        this.send_data = this.client.send_data.bind(this.client);
    }

    public get_raw_client(){
        return this.client;
    }

    close() {
        clearInterval(this.heart_fun)
        this.client?.close();
    }

    async connect(){
        await this.client.connect();
        const client = this.client;
        this.heart_fun = setInterval(withLock(async ()=>{
            try {
                await this.send_data_async(NetMsgType.heart, Buffer.alloc(0))
            } catch (e) {
                console.log(`心跳超时 tcp 断开 10秒后重连`)
                await CommonUtil.sleep(10*1000)
                this.client.reconnect()
            }
        },-1), 10_000)
        client.get_client().set_on_data(async (data, tag_id) => {
            const {code, tcpBuffer} = NetUtil.getTcpData(data);
            if (this.call_resolve_map[tag_id]) {
                this.call_resolve_map[tag_id](tcpBuffer)
                clearTimeout(this.call_resolve_timeout_map[tag_id])
                delete this.call_resolve_timeout_map[tag_id]
                delete this.call_resolve_map[tag_id];
                return;
            }
            const fun = msgClientMap.get(code);
            if (!fun) return; // 没有处理函数
            try {
                await fun(tcpBuffer, client,tag_id);
            } catch (e) {
                console.error(e)
            }
        })
    }

    send_data:(code_type: NetMsgType, buffer: Buffer,tag_id?:number)=>void;

    async send_data_async(code_type: NetMsgType, buffer: Buffer):Promise<any> {
        return new Promise((resolve, reject) => {
            const tag_id = NetUtil.next_tag_id();
            this.call_resolve_map[tag_id] = resolve;
            this.call_resolve_timeout_map[tag_id] = setTimeout(() => {
                reject({message:"超时"});
                delete  this.call_resolve_map[tag_id]
                delete  this.call_resolve_timeout_map[tag_id]
            }, net_timeout);
            this.client.send_data(code_type,buffer,tag_id)
        })
    }

}