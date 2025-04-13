import {DataUtil} from "../../data/DataUtil";
import {VirClientPojo, VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {sysType} from "../../shell/shell.service";
import {ServerEvent} from "../../../other/config";
import {UdpUtil} from "../util/udp.util";
import {findAvailablePort} from "../../../../common/findPort";
import {TcpUtil} from "../util/tcp.util";
import {Wss} from "../../../../common/frame/ws.server";
import {get_wintun_dll_path} from "../../bin/bin";
import {data_common_key} from "../../data/data_type";
import {virtualServerService} from "./virtual.server.service";
import {NetMsgType, NetUtil} from "../util/NetUtil";
import {NetClientUtil} from "../util/NetClientUtil";

const crypto = require('crypto');
const {LinuxTun, LinuxTap, Wintun} = require('@xiaobaidadada/node-tuntap2-wintun');
const path = require("path");

export const vir_server_data_key = data_common_key.vir_server_data_key;
export const vir_client_data_key = data_common_key.vir_client_data_key;


export const vir_data_client_hash_key = data_common_key.vir_data_client_hash_key;
export const vir_data_server_hash_key = data_common_key.vir_data_server_hash_key;


const checkClientHeartTimes = 1000 * 15;
export const haertTime = 2000;

export class CLientInfo extends UdpUtil {
    // 基本tcp工具变量
    tcpUtil: TcpUtil;

    vir_ip: string; // 虚拟ip
    tcp_real_address: string; // 物理ip
    tcp_real_port: number;

    udp_real_port: number; // udp 真实端口
    udp_real_address: string;

    close: Function;

}

interface TunInfo {
    linuxTun: any
}

export class VirtualClientService extends UdpUtil {

    clientIPAndUdpMap = new Map<string, CLientInfo>(); // 对方虚拟 ip和地址
    udp_addr_allow_set:Set<string> = new Set(); // 合法的udp 地址


    // client
    heartInterval;
    udpReceiveRegisterClient;
    // register_call_stamp: number = Date.now();
    // udpToInfo: CLientInfo;
    // connect_call_stamp: number = Date.now();
    tun: TunInfo = {} as TunInfo;
    clientStatus: boolean = false;

    wss: Wss;


    public virClientGet(): VirClientPojo {
        let pojo: VirClientPojo = DataUtil.get(vir_client_data_key);
        if (pojo) {
            return pojo;
        }
        pojo = new VirClientPojo();
        DataUtil.set(vir_client_data_key, pojo);
        return pojo;
    }



    getClientHashKey(): string {
        return DataUtil.get(vir_data_client_hash_key);
    }

    getServerHashKey(): string {
        return DataUtil.get(vir_data_server_hash_key);
    }

    async getRandomAblePort() {
        await findAvailablePort(49152, 65535)
    }

    async client_register_udp() {
        // 被动注册
        const udp_buffer = await NetClientUtil.send_for_udp_async(NetMsgType.register_udp_info, Buffer.from(JSON.stringify({vir_ip: this.server_info.self_vir_ip})), this.server_info.server_tcp_ip, this.server_info.server_tcp_port);
        const udp_data:{udp_real_address:string,udp_real_port:number} = JSON.parse(udp_buffer.toString());
        this.server_info.self_udp_ip = udp_data.udp_real_address;
        this.server_info.self_udp_port = udp_data.udp_real_port;
        console.log('被动注册');
        return udp_data;
    }

    // 获取对象的udp信息
    private async udpClientCreateAndGet(destIP: string): Promise<CLientInfo> {
        return new Promise(async (resolve) => {
            let info = this.clientIPAndUdpMap.get(destIP);
            if (info) {
                resolve(info as CLientInfo);
                return;
            }
            // 注册自己的 udp 信息
            const udp_buffer = await NetClientUtil.send_for_udp_async(NetMsgType.register_udp_info, Buffer.from(JSON.stringify({vir_ip: this.server_info.self_vir_ip})), this.server_info.server_tcp_ip, this.server_info.server_udp_port);
            const udp_data:{udp_real_address:string,udp_real_port:number} = JSON.parse(udp_buffer.toString());
            this.server_info.self_udp_ip = udp_data.udp_real_address;
            this.server_info.self_udp_port = udp_data.udp_real_port;
            // 获取对方的信息
            const t_buffer = await NetClientUtil.send_for_tcp_async(NetMsgType.get_udp_info, Buffer.from(JSON.stringify({dest_vir_ip:destIP})));
            const t_data:{udp_real_address:string,udp_real_port:number} = JSON.parse(t_buffer.toString());
            const t = new CLientInfo();
            t.udp_real_port = t_data.udp_real_port;
            t.udp_real_address = t_data.udp_real_address;
            this.clientIPAndUdpMap.set(destIP, t);
            this.udp_addr_allow_set.add(`${t_data.udp_real_address}${t_data.udp_real_port}`)
            console.log('获取到对方数据',t)
            return t;
        })
    }

    public async init() {
        const serverData = DataUtil.get(vir_server_data_key) as VirServerPojo;
        if (serverData) {
            virtualServerService.serverStatus = serverData.open;
            if (serverData.open) {
                await virtualServerService.tcpServerStart(serverData.port);
                // if (serverData.udp_port) {
                //     await virtualServerService.udpServerStart(serverData.udp_port);
                // }
            }
        }
        const clientData = DataUtil.get(vir_client_data_key) as VirClientPojo;
        if (clientData) {
            if (clientData.open) {
                this.clientStatus = clientData.open;
                this.tunStart(clientData);
            }
        }
    }


    ipToBuffer(ip) {
        // 将IP地址分割为4个部分，并转换为数字
        const octets = ip.split('.').map(Number);

        // 将这些数字转换为 Buffer
        return Buffer.from(octets);
    }

    ipToInt(ipBuffer) {
        return ipBuffer.readUInt32BE(0);
    }

    private getClientIp() {
        let ip = this['client_ip_int'];
        if (ip) {
            return ip;
        }
        let pojo: VirClientPojo = DataUtil.get(vir_client_data_key);
        ip = this.ipToInt(this.ipToBuffer(pojo.ip));
        this['client_ip_int'] = ip;
        return ip;
    }

    private getClientMask() {
        let mask = this['client_mask_int'];
        if (mask) {
            return mask;
        }
        let pojo: VirClientPojo = DataUtil.get(vir_client_data_key);
        mask = this.ipToInt(this.cidrToBinary(pojo.mask));
        this['client_mask_int'] = mask;
        return mask;
    }

    cidrToBinary(cidr) {
        // 生成一个32位的二进制数，其中前 `cidr` 位是 `1`
        const binaryMask = (0xFFFFFFFF << (32 - cidr)) >>> 0;

        // 将32位二进制数分成四个字节
        const octets = [
            (binaryMask >>> 24) & 0xFF,
            (binaryMask >>> 16) & 0xFF,
            (binaryMask >>> 8) & 0xFF,
            binaryMask & 0xFF
        ];

        // 转换为 Buffer
        return Buffer.from(octets);
    }

    isSameSubnet(ipBuffer) {
        const ip1 = this.getClientIp();
        const ip2 = this.ipToInt(ipBuffer);
        const mask = this.getClientMask();

        return (ip1 & mask) === (ip2 & mask) && ip2 !== ip1;
    }

    private getDestIpByTunPackage(buffer: Buffer) {
        // 解析 IP 头部
        const version = buffer[0] >> 4;
        // const headerLength = (buf[0] & 0x0f) * 4;
        // const protocol = buf[9];
        if (version !== 4) {
            return;
        }
        // const sourceIP = buf.slice(12, 16).join('.');
        // 目的ip
        const ipBuffer = buffer.subarray(16, 20);
        if (!this.isSameSubnet(ipBuffer)) {
            return;
        }
        return ipBuffer.join('.');
    }

    // 处理ip信息
    private async handleTunPackage(buffer: Buffer,is_tcp:boolean) {
        const destIP = this.getDestIpByTunPackage(buffer);
        if (!destIP) {
            return;
        }
        // if (is_tcp) {
        await NetClientUtil.send_for_tcp(NetMsgType.trans_data, NetUtil.getTransBuffer(destIP, buffer));
        // } else {
        //     // udp
        //     const info = await this.udpClientCreateAndGet(destIP);
        //     if (!info) {
        //         return;
        //     }
        //     await NetClientUtil.send_for_udp(NetMsgType.udp_data,buffer, info.udp_real_address,info.udp_real_port)
        // }
    }

    private async tunStart(data: VirClientPojo) {
        const {ip, mask} = data;
        this.server_info.is_tcp = data.model !== VirServerEnum.udp;
        await this.tcpConnect(data.ip, data.serverPort, data.serverIp);
        // if (data.model === VirServerEnum.udp && this.server_info.is_tcp) {
        //     throw "服务器不支持udp";
        // }
        try {
            if (sysType === 'win') {
                Wintun.set_dll_path(get_wintun_dll_path());
                Wintun.init();
                Wintun.set_ipv4("filecat", ip, mask);
                Wintun.on_data((buf) => {
                    this.handleTunPackage(buf,data.model === VirServerEnum.tcp);
                });
            } else {
                const tun = new LinuxTun();
                tun.mtu = 4096;
                tun.ipv4 = `${ip}/${mask}'`
                // tun.ipv6 = 'abcd:1:2:3::/64';
                tun.on('data', (buf) => {
                    // console.log(buf)
                    this.handleTunPackage(buf,data.model === VirServerEnum.tcp);
                })
                tun.isUp = true;
                this.tun.linuxTun = tun;
            }
        } catch (e) {
            console.log('error: ', e);
        }
        console.log('tun适配器启动---', `${ip}/${mask}`)
    }

    server_info = {
        is_tcp: true,
        server_udp_port: 0, // 服务器 udp 端口

        server_tcp_ip: '', // tcp 服务地址 也是 udp 的ip地址
        server_tcp_port: 0,

        self_vir_ip: '', // 自己的虚拟ip

        self_udp_ip: '', // 自己的网络所在的udp ip
        self_udp_port: 0,
    }

    // tcp连接
    async tcpConnect(ip: string, serverPort: number, serverIp: string) {
        this.server_info.server_tcp_ip = serverIp;
        this.server_info.server_tcp_port = serverPort;
        this.server_info.self_vir_ip = ip;
        await NetClientUtil.start_tcp_client(serverPort, serverIp,()=>{
            NetClientUtil.tcp_client.sendData(NetUtil.getTcpBuffer(NetMsgType.register, Buffer.from(JSON.stringify({
                ip,
                hashKey: this.getClientHashKey()
            }))));
        });
        // 发送自己的虚拟注册信息
        NetClientUtil.tcp_client.sendData(NetUtil.getTcpBuffer(NetMsgType.register, Buffer.from(JSON.stringify({
            ip,
            hashKey: this.getClientHashKey()
        }))));
        // 定时发送心跳
        // this.heartInterval = setInterval(() => {
        //     NetClientUtil.tcp_client.sendToSocket(Buffer.alloc(0), this.getTcpBuffer(NetMsgType.heart, Buffer.alloc(0)));
        // }, 2000);
        // 获取服务器信息
        // const tcpBuffer = await NetClientUtil.send_for_tcp_async(NetMsgType.get_server_info, Buffer.alloc(0));
        // const tcpData:{udp_port:number } = JSON.parse(tcpBuffer.toString());
        // this.server_info.server_udp_port = tcpData.udp_port;
    }

    public writeToTunByUdp(buffer: Buffer,remoteAddr:string) {
        try {
            if (!this.clientStatus || !this.udp_addr_allow_set.has(remoteAddr)) {
                return;
            }
            // 接收到数据转发到网卡
            if (sysType === 'win') {
                Wintun.send_data(buffer);
            } else {
                this.tun.linuxTun.write(buffer);
            }
        } catch (e) {
            console.log('写入网卡失败')
        }
    }

    public writeToTun(buffer: Buffer) {
        try {
            if (!this.clientStatus) {
                return;
            }
            // 接收到数据转发到网卡
            if (sysType === 'win') {
                Wintun.send_data(buffer);
            } else {
                this.tun.linuxTun.write(buffer);
            }
        } catch (e) {
            console.log('写入网卡失败')
        }
    }

    closeTun() {
        if (!this.clientStatus) {
            return;
        }
        if (sysType === 'win') {
            Wintun.close()
        } else {
            this.tun.linuxTun.release();
        }
        console.log('关闭适配器')
    }


    public async virClientSave(data: VirClientPojo) {
        DataUtil.set(vir_client_data_key, data);
        const hashKey = NetUtil.get64Key(data.key);
        DataUtil.set(vir_data_client_hash_key, hashKey);
        if (data.open) {
            if (this.clientStatus) {
                return;
            }
            this.clientStatus = true;
            this.tunStart(data);
        } else {
            try {
                this.closeTun();
                NetClientUtil.close_tcp();
            } catch (e) {
                console.log('客户端关闭失败')
            }
            this.clientStatus = false;
        }
    }
}

export const virtualClientService = new VirtualClientService();
ServerEvent.on("start", (data) => {
    virtualClientService.init();
})
