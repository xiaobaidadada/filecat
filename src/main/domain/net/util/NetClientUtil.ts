import net from "net";
import {TcpUtil} from "./tcp.util";
import dgram, {Socket} from "dgram";
import {msgClientMap, msgUdpMap, NetMsgType, NetUtil} from "./NetUtil";


export const net_timeout = 1000 * 5;

export class NetClientUtil {

    static tcp_client:TcpUtil;
    static tcp_client_interval; // 客户端心跳
    static tcp_client_timeout; // 客户端重试连接

    static udp_client:Socket;
    static is_run:boolean = false;

    static call_resolve_map:{[key:number]:any} = {}; // 临时方案 下次改成 uuid
    static call_timeout_map:{[key:number]:any} = {}; // 临时方案 下次改成 uuid

    public static send_for_tcp(type:NetMsgType,data:Buffer) {
        // const buffer = NetUtil.getTcpBuffer(type,data);
        try {
            // this.tcp_client.sendToSocket(NetUtil.head_0,buffer);
            this.tcp_client.fastSendData(NetUtil.geRawTcpBufferList(type, data));
        }catch(e){
            console.log(e)
        }
    }

    // 发送到服务器 并 await 服务器返回的数据 服务器需要 根据 head 返回数据
    public static send_for_tcp_async(type:NetMsgType, data:Buffer):Promise<Buffer> {
        const buffer = NetUtil.getTcpBuffer(type,data);
        return new Promise((resolve, reject) => {
            const head = NetUtil.nextHead();
            this.call_resolve_map[NetUtil.getHeadCurrentValue()] = resolve;
            this.call_timeout_map[NetUtil.getHeadCurrentValue()] = setTimeout(()=>{
                reject(0);
            },net_timeout);
            this.tcp_client.sendToSocket(head,buffer);
        })
    }

    public static async send_for_udp(type:NetMsgType,data:Buffer,address:string,port:number) {
        if(!this.udp_client) {
            await this.start_dup_client();
        }
        this.udp_client.send(NetUtil.getUdpBuffer(type,NetUtil.head_0, data), port, address, (err) => {
        });
    }

    // 用于异步返回
    public static async send_for_udp_head(data:Buffer,head:Buffer,address:string,port:number) {
        if(!this.udp_client) {
            await this.start_dup_client();
        }
        this.udp_client.send(NetUtil.getUdpBuffer(NetMsgType.default,head, data), port, address, (err) => {
        });
    }

    public static async send_for_udp_async(type:NetMsgType,data:Buffer,address:string,port:number):Promise<Buffer> {
        if(!this.udp_client) {
            await this.start_dup_client();
        }
        return new Promise((resolve, reject) => {
            const head = NetUtil.nextHead();
            this.call_resolve_map[NetUtil.getHeadCurrentValue()] = resolve;
            this.udp_client.send(NetUtil.getUdpBuffer(type,head, data), port, address, (err) => {
            });
        })
    }


    public static async start_dup_client(port?:number):Promise<number> {
        if(this.udp_client) {
            return this.udp_client.address().port;
        }
        this.udp_client = dgram.createSocket('udp4');
        this.udp_client.on('message', (udpBuffer, rinfo) => {
            try {
                const {code, buffer,head} = NetUtil.getUdpData(udpBuffer);
                const head_v = NetUtil.getHedValueByBuffer(head);
                if(head_v !== 0 && this.call_resolve_map[head_v]) {
                    try {
                        this.call_resolve_map[head_v](buffer);
                    } catch (e) {
                        console.log(e)
                    }
                    delete this.call_resolve_map[head_v];
                    return;
                }
                const fun = msgUdpMap.get(code);
                if(!fun) return; // 没有处理函数
                fun(buffer,rinfo,head);
            } catch (e) {
                console.log(e);
                return;
            }

        });
        return new Promise((resolve, reject)=>{
            this.udp_client.bind(port); // 随机一个端口
            this.udp_client.on('listening', () => {
                const { port ,address,family } = this.udp_client.address();
                resolve(port);
                console.log("udp对等点运行开始:",address,port,family )
            });
        })
    }

    public static is_alive():boolean {
        return !!this.tcp_client?.is_alive;
    }

    public static async start_tcp(serverPort: number, serverIp: string,close_call:()=>void,state_call:(state:boolean)=>void) {
        // todo 暂时只支持单服务器
        if(this.tcp_client) {
            // 先关闭
            this.close_tcp();
        }
        this.is_run = true;
        await this.start_tcp_client(serverPort,serverIp,close_call,state_call);
    }

    private static success_connect_handle() {
        // 客户端重试连接
        if(this.tcp_client_timeout) {
            clearTimeout(this.tcp_client_timeout);
            this.tcp_client_timeout = undefined;
        }
        // 心跳
        this.tcp_client_interval = setInterval(()=>{
            if(this.is_run === false) {
                clearInterval(this.tcp_client_interval);
                this.tcp_client_interval = undefined;
                return;
            }
            this.send_for_tcp(NetMsgType.heart,Buffer.alloc(0));
        },3000)
    }

    private static try_fun (serverPort: number, serverIp: string,close_call:()=>void,state_call:(state:boolean)=>void){
        if(this.tcp_client != null && this.tcp_client_timeout == null) {
            // 不是主动关闭
            console.log('30秒后重连tcp服务器');
            clearInterval(this.tcp_client_interval);
            this.tcp_client_timeout = setTimeout(async ()=>{
                try {
                    this.tcp_client_timeout = undefined;
                    if(this.is_run) {
                        await this.start_tcp_client(serverPort,serverIp,close_call,state_call);
                        close_call();
                    }
                } catch (e) {
                    console.log(e);
                }
            },30 *1000)
        }
    }

    private static async  start_tcp_client(serverPort: number, serverIp: string,close_call:()=>void,state_call:(state:boolean)=>void) {
        try {
            if((this.tcp_client != null && this.tcp_client.is_alive ) || !this.is_run) return ;
            console.log('开始尝试连接tcp服务器');
            const client = new net.Socket();
            const tcpUtil = new TcpUtil(client);
            tcpUtil.setHead(NetUtil.head_len);
            this.tcp_client = tcpUtil;
            tcpUtil.add_close_call(()=>{
                clearTimeout(this.tcp_client_interval);
                this.tcp_client_interval = undefined;
                state_call(false);
            })
            // 客户端不做超时处理了
            // 监听数据事件
            client.on('data', (buffer) => {
                tcpUtil.handleSocket(buffer as Buffer);
            });
            // 监听连接关闭事件
            client.on('close', () => {
                console.log('服务器关闭或者异常');
                tcpUtil.close();
                this.try_fun(serverPort,serverIp,close_call,state_call);
            });
            // 处理错误事件
            client.on('error', (err) => {
                console.error('Socket 错误:', err);
                // 如果有域名解析失败之类的错误 不做重连
            });
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(()=>{
                    this.try_fun(serverPort,serverIp,close_call,state_call);
                    reject(false);
                },3000)
                client.connect(serverPort, serverIp, () => {
                    clearTimeout(timeout);
                    tcpUtil.start();
                    this.success_connect_handle();
                    tcpUtil.setOn((head:Buffer,bufferData:Buffer)=>{
                        const {code, tcpBuffer} = NetUtil.getTcpData(bufferData);
                        try {
                            const head_v = NetUtil.getHedValueByBuffer(head);
                            if(head_v !== 0 && this.call_resolve_map[head_v]) {
                                try {
                                    clearTimeout(this.call_timeout_map[head_v]);
                                    this.call_resolve_map[head_v](tcpBuffer);
                                } catch (e) {
                                    console.log(e)
                                } finally {
                                    delete this.call_resolve_map[head_v];
                                    delete this.call_timeout_map[head_v];
                                }
                                return;
                            }
                            const fun = msgClientMap.get(code);
                            if(!fun) return; // 没有处理函数
                            fun(tcpBuffer,tcpUtil);
                        } catch (e) {
                            console.log(e)
                        }
                    })
                    state_call(true);
                    console.log('tcp服务器握手完成');
                    resolve (true);
                });

            })
        } catch(err) {
            console.log(err);
            return ;
        }
    }

    public static  close_tcp() {
        this.is_run = false;
        clearTimeout(this.tcp_client_timeout);
        this.tcp_client_timeout = undefined;
        if(this.tcp_client) {
            this.tcp_client.close();
            this.tcp_client = undefined;
        }
        console.log('tcp客户端关闭')
    }

}
