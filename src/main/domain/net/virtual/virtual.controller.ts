import {NetServerUtil} from "../util/NetServerUtil";
import {CLientInfo, virtualClientService} from "./virtual.client.service";
import net from "net";
import {TcpUtil} from "../util/tcp.util";
import {NetClientUtil} from "../util/NetClientUtil";
import dgram from "dgram";
import {virtualServerService} from "./virtual.server.service";
import {tcpServerMsg, NetMsgType, tcpClientMsg, udpMsg, NetUtil} from "../util/NetUtil";

// tcp 连接信息
export const clientMap = new Map<string, CLientInfo>(); // 虚拟ip与对方信息


class VirtualController {


    // @tcpServerMsg(NetMsgType.get_server_info)
    // async get_server_info(data: Buffer, util: TcpUtil, head: Buffer) {
    //     const info = {
    //         udp_port: 0
    //     };
    //     if (NetClientUtil.udp_client) {
    //         info.udp_port = await NetClientUtil.start_dup_client();
    //     }
    //     NetServerUtil.send_data_head(util, head, Buffer.from(JSON.stringify(info)))
    // }

    // 注册ip信息 与鉴权
    @tcpServerMsg(NetMsgType.register)
    register(data: Buffer, util: TcpUtil) {
        const socket = util.getSocket();
        const tcpData:{client_name:string,ip:string,hashKey:string,guid:string } = JSON.parse(data.toString());
        const hashKey = tcpData.hashKey;
        const serverHashKey = virtualClientService.getServerHashKey();
        if (hashKey !== serverHashKey) {
            socket.end();
            util.close();
            return;
        }
        util.start();
        let info = clientMap.get(tcpData.ip);
        if(info) {
            if(info.guid !== tcpData.guid){
                util.close();
                return;
            }
        } else {
            info = new CLientInfo();
        }
        // info.heart = true;
        info.guid = tcpData.guid;
        info.vir_ip = tcpData.ip;
        info.tcp_real_port = socket.remotePort;
        info.tcp_real_address = socket.remoteAddress;
        info.tcpUtil = util;
        info.client_name = tcpData.client_name;
        clientMap.set(tcpData.ip, info); // 更新会覆盖之前的值
        // info.checkTimerInterval = setInterval(() => {
        //     if(Date.now() - info.last_connect_time > 2000) {
        //         info.heart = false; // 上次通信小于2秒
        //     }
        // },1000 * 2);
        NetServerUtil.connect_success(util.getSocket());
        util.add_close_call(()=>{
            virtualServerService.pushConnectInfo();
        })
        // util.extra_data_map.set('info', info);
        virtualServerService.pushConnectInfo();
    }

    @tcpServerMsg(NetMsgType.heart)
    heart(data:Buffer,util:TcpUtil) {
        util.update_heart_time();
    }

    @tcpServerMsg(NetMsgType.trans_data)
    trans_data(tcpBuffer: Buffer, util: TcpUtil) {
        const {data, vir_ip} = NetUtil.getTransData(tcpBuffer);
        // 获取对象的tcp连接对象 并转发
        const info = clientMap.get(vir_ip) as CLientInfo;
        if (!info) {
            return;
        }
        // info.tcpUtil.sendData(NetUtil.getTcpBuffer(NetMsgType.data, data));
        info.tcpUtil.fastSendData(NetUtil.geRawTcpBufferList(NetMsgType.data, data));
    }

    // 写入数据
    @tcpClientMsg(NetMsgType.data)
    data(data: Buffer, util: TcpUtil) {
        virtualClientService.writeToTun(data);
    }

    // 客户端注册 udp 信息
    @tcpClientMsg(NetMsgType.client_register_udp)
    async client_register_udp(data: Buffer, util: TcpUtil,head: Buffer) {
        const d = await virtualClientService.client_register_udp();
        NetServerUtil.send_data_head(util, head, Buffer.from(JSON.stringify(d)))
    }

    // 注册自己的udp服务信息 使用 udp 注册
    @udpMsg(NetMsgType.register_udp_info)
    async register_udp_info(data: Buffer, r_info: dgram.RemoteInfo, head: Buffer) {
        const tcpData: { vir_ip: string } = JSON.parse(data.toString());
        const info = clientMap.get(tcpData.vir_ip);
        if(!info) {
            console.log(`注册udp 找不到虚拟对象`,tcpData.vir_ip);
            return;
        }
        info.udp_real_port = r_info.port;
        info.udp_real_address = r_info.address;
        console.log(`注册udp`,info.udp_real_address,info.udp_real_port,tcpData.vir_ip)
        await NetClientUtil.send_for_udp_head(Buffer.from(JSON.stringify({
            udp_real_port: info.udp_real_port,
            udp_real_address: info.udp_real_address
        })), head, info.udp_real_address, info.udp_real_port)
    }

    // 获取对方 udp 信息
    @tcpServerMsg(NetMsgType.get_udp_info)
    async get_udp_info(data: Buffer, util: TcpUtil, head: Buffer) {
        const tcpData: { dest_vir_ip: string } = JSON.parse(data.toString());
        const dest_info = clientMap.get(tcpData.dest_vir_ip);
        console.log('获取对方',tcpData.dest_vir_ip);
        if (!dest_info) {
            console.log(`获取对方 找不到虚拟对象`,tcpData.dest_vir_ip);
            return;
        }
        if (!dest_info.udp_real_address) {
            console.log('开始获取对象信息',dest_info.vir_ip)
            // 对方还没有注册过自己的 udp 信息
            const d_buffer = await NetServerUtil.send_data_async(dest_info.tcpUtil,NetMsgType.client_register_udp,Buffer.alloc(0));
            console.log(`获取到对方信息`)
            const d_data:{udp_real_address:string,udp_real_port:number}  = JSON.parse(d_buffer.toString());
            dest_info.udp_real_port = d_data.udp_real_port;
            dest_info.udp_real_address = d_data.udp_real_address;
        }
        NetServerUtil.send_data_head(util, head, Buffer.from(JSON.stringify({udp_real_address:dest_info.tcp_real_address,udp_real_port:dest_info.udp_real_port} )));
    }

    // 写入数据
    @udpMsg(NetMsgType.udp_data)
    udp_data(data: Buffer, r_info: dgram.RemoteInfo,) {
        virtualClientService.writeToTunByUdp(data,`${r_info.address}${r_info.port}`);
    }

}
