import {tcp_client_options} from "./type";
import net from "net";
import {tcp_stream_util} from "./tcp_stream_util";
import {msgClientMap, NetMsgType, NetUtil} from "./NetUtil";
import {net_timeout, NetClientUtil} from "./NetClientUtil";
import {withLock} from "../../../../common/fun.util";
import {CommonUtil} from "../../../../common/common.util";

export class tcp_raw_socket {
    protected client:tcp_stream_util
    protected is_connected = false;

    public data_map :{[key:string]:any}= {}

    constructor(socket?:net.Socket) {
        this.client = new tcp_stream_util(socket??new net.Socket());
        if(socket) {
            this.is_connected = true;
        }
        this.client.set_on_close(()=>{
            this.is_connected = false;
        })
        this.client.get_socket().on("close", ()=>{
            this.is_connected = false;
        });
        this.client.get_socket().on("connect", ()=>{
            this.is_connected = true;
        });
        this.send_data = this.client.send_data.bind(this.client);
    }

    get_client(){
        return this.client;
    }

    get connected() {
        if(!this.client?.get_socket())  {
            return  false;
        }
        return this.is_connected;
    }

    on_close(fun:()=>void) {
        this.client.set_on_close(()=>{
            try {
                fun()
            } catch (e) {
                console.error(`函数错误 ${e?.message??e}`);
            }
        });
    }


    on_connect(fun:()=>void) {
        this.client.get_socket().on("connect", ()=>{
            try {
                fun()
            } catch (e) {
                console.error(`函数错误 ${e?.message??e}`);
            }
        });
    }

    send_data:(code_type: NetMsgType, buffer: Buffer,tag_id?:number)=>void
}

export class tcp_raw_client extends tcp_raw_socket{

    private options: tcp_client_options
    private reconnect_timeout:NodeJS.Timeout; // 客户端重试连接
    private closed = false;

    constructor(
        options: tcp_client_options) {
        super();
        this.options = options;
        this.client.set_on_close(() => {
            this.reconnect();
        })
        this.client.get_socket().on('end', () => {
            console.log('服务器断开连接');
        });
    }

    private reconnect() {
        if(this.closed || this.connected) {
            return ;
        }
        if(this.reconnect_timeout) {
            return;
        }
        console.log('服务器主动断开 10秒后重连tcp服务器');
        this.reconnect_timeout = setTimeout(()=>{
            this.reconnect_timeout = undefined;
            if(this.closed) {
                console.log('客户端主动关闭 定时函数结束 不再连接')
                return ;
            }
            this.connect().catch((e)=>{
                console.log(`-- ${e}`)
                this.reconnect()
            });
        },10*1000)
    }

    close () {
        console.log(`客户端关闭`)
        this.closed = true;
        this.client?.close();
    }



    async connect() {
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
    private options: tcp_client_options
    private register:()=>any

        constructor(
        options: tcp_client_options,register:()=>any) {
        this.register = register;
        this.options = options;
    }

    public get_raw_client(){
        return this.client;
    }

    close() {
        clearInterval(this.heart_fun)
        this.client?.close();
    }

    async connect(){
        if(this.client) {
            this.close();
        }
        this.client = new tcp_raw_client(this.options);
        this.send_data = this.client.send_data.bind(this.client);
        await this.client.connect();
        const client = this.client;
        client.get_client().set_on_data(async (data, tag_id) => {
            const {code, tcpBuffer} = NetUtil.getTcpData(data);
            // console.log(code,tag_id);
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
                console.error(`tcp客户端接受函数报错 ${e?.message??e}` )
            }
        })
        console.log('tcp 服务器 连接 成功')
        await this.register()
        console.log('tcp 服务器 注册 成功')
        const heart_fun = withLock(async ()=>{
            try {
                // console.log(`发送心跳`)
                await this.send_data_async(NetMsgType.heart, Buffer.alloc(0))
            } catch (e) {
                console.log(`心跳超时 tcp 断开 10秒后重连`)
                await CommonUtil.sleep(10*1000)
                this.connect().catch(console.error);
            }
        },-1)
        this.heart_fun =  setInterval(heart_fun, 10_000)
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