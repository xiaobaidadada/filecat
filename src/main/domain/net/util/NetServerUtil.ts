import {CmdType} from "../../../../common/frame/WsData";
import net, {Server} from "net";
import {TcpUtil} from "./tcp.util";
import {CLientInfo, virtualClientService} from "../virtual/virtual.client.service";
import stream from "node:stream";
import {msgServerMap, NetMsgType, NetUtil} from "./NetUtil";
import {net_timeout} from "./NetClientUtil";





export class NetServerUtil {

    static tcp_server:Server;
    static socket_timeout_map:Map<net.Socket,any> = new Map<net.Socket, any>();

    static call_resolve_map:{[key:number]:any} = {};
    static call_timeout_map:{[key:number]:any} = {};

    public static connect_success(socket: net.Socket) {
        clearTimeout(this.socket_timeout_map.get(socket));
    }

    public static close_server():void {
        // todo 保证彻底断开 拒绝断开的数据请求
        if(this.tcp_server) {
            this.tcp_server.close();
            this.tcp_server = undefined;
        }
        console.log('关闭tcp服务器')
    }

    public static async send_data_async(socket_util:TcpUtil,type:NetMsgType,data:Buffer):Promise<Buffer> {
        const buffer = NetUtil.getTcpBuffer(type,data);
        return new Promise((resolve, reject) => {
            const head = NetUtil.nextHead();
            this.call_resolve_map[NetUtil.getHeadCurrentValue()] = resolve;
            this.call_timeout_map[NetUtil.getHeadCurrentValue()] = setTimeout(()=>{
                reject(0);
            },net_timeout)
            socket_util.sendToSocket(head,buffer);
        })
    }

    public static  send_data(socket_util:TcpUtil,type:NetMsgType,data:Buffer) {
        const buffer = NetUtil.getTcpBuffer(type,data);
        socket_util.sendToSocket(NetUtil.head_0,buffer);
    }

    // 发送特定 head  用于 需要异步返回的情况
    public static  send_data_head(socket_util:TcpUtil,head:Buffer,data:Buffer) {
        const buffer = NetUtil.getTcpBuffer(NetMsgType.default,data);
        socket_util.sendToSocket(head,buffer);
    }


    /**
     *
     * @param port udp 设置空随机绑定一个端口
     * @param is_tcp
     */
    public static async start_tcp_server(port: number) {
        if(this.tcp_server){
            return;
        }
        this.tcp_server = net.createServer((socket) => {
            console.log('客户端连接');
            const tcpUtil = new TcpUtil(socket,true);
            tcpUtil.setHead(NetUtil.head_len); // 协议头
            let check_token = false;
            this.socket_timeout_map.set(socket,setTimeout(() => {
                if (!check_token) {
                    socket.end();
                }
                tcpUtil.connect_success = false;
            }, 3000));
            // 监听数据事件
            socket.on('data', (buffer) => {
                tcpUtil.handleSocket(buffer)
            });
            socket.on('end', () => {
                tcpUtil.connect_success = false;
                console.log('客户端断开连接',socket.remoteAddress);
            });
            // 处理错误事件
            socket.on('error', (err) => {
                console.log('Socket 错误:',socket.remoteAddress);
                tcpUtil.connect_success = false;
            });
            tcpUtil.setOn((head, bufferData) => {
                try {
                    if(!tcpUtil.connect_success) {
                        socket.end();
                        return;
                    }
                    const {code, tcpBuffer} = NetUtil.getTcpData(bufferData);
                    const h_code = NetUtil.getHedValueByBuffer(head);
                    if (h_code !== 0 && this.call_resolve_map[h_code]) {
                        try {
                            clearTimeout(this.call_timeout_map[h_code]);
                            this.call_resolve_map[h_code](tcpBuffer);
                        } catch (e) {
                            console.log(e)
                        }
                        delete this.call_timeout_map[h_code];
                        delete this.call_resolve_map[h_code];
                        return;
                    }
                    const fun = msgServerMap.get(code);
                    if (!fun) {
                        console.log(`not fun `, code)
                        return;
                    } // 没有处理函数
                    fun(tcpBuffer, tcpUtil,head);
                } catch (e) {
                    console.log(e);
                }
            })
        });
        return new Promise((resolve, reject) => {
            this.tcp_server.listen(port, () => {
                console.log(`tcp服务器运行开始`);
                resolve(1);
            });
        })
    }

}