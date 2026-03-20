import {DataUtil} from "../../data/DataUtil";
import {TcpProxyITem, VirClientPojo, VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {getSys, sysType} from "../../shell/shell.service";
import {ServerEvent} from "../../../other/config";
import {findAvailablePort} from "../../../../common/node/findPort";
import {tcp_stream_util} from "../util/tcp_stream_util";
import {Wss} from "../../../../common/frame/ws.server";
import {get_tun_require, get_wintun_dll_path} from "../../bin/bin";
import {data_common_key} from "../../data/data_type";
import {virtualServerService} from "./virtual.server.service";
import {NetMsgType, NetUtil} from "../util/NetUtil";
import {NetClientUtil} from "../util/NetClientUtil";
import {SysProcessServiceImpl} from "../../sys/sys.process.service";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {TcpProxy} from "./tcp_proxy";
import {SysEnum} from "../../../../common/req/user.req";
import * as fs from "fs"
import {tcp_raw_socket} from "../util/tcp.client";

const crypto = require('crypto');


const path = require("path");

export const vir_server_data_key = data_common_key.vir_server_data_key;
export const vir_client_data_key = data_common_key.vir_client_data_key;


export const vir_data_client_hash_key = data_common_key.vir_data_client_hash_key;
export const vir_data_server_hash_key = data_common_key.vir_data_server_hash_key;




export class tcp_client_item {
    // 基本tcp工具变量
    tcpUtil: tcp_raw_socket;
    client_name: string;

    guid: string;
    vir_ip: string; // 虚拟ip
    tcp_real_address: string; // 物理ip
    tcp_real_port: number;

    // udp_real_port: number; // udp 真实端口
    // udp_real_address: string;

    close: Function;


}

interface TunInfo {
    linuxTun: any
    macTun: { fd: number; name: string, readStream: any, writeStream: any, ip: string }
}

// 创建 4 字节 AF 前缀
const mac_prefix = Buffer.alloc(4);
mac_prefix.writeUInt32BE(2, 0); // AF_INET = 2

export class VirtualClientService  {

    clientIPAndUdpMap = new Map<string, tcp_client_item>(); // 对方虚拟 ip和地址
    udp_addr_allow_set: Set<string> = new Set(); // 合法的udp 地址


    // client
    heartInterval;
    udpReceiveRegisterClient;
    // register_call_stamp: number = Date.now();
    // udpToInfo: CLientInfo;
    // connect_call_stamp: number = Date.now();
    tun: TunInfo = {} as TunInfo;
    client_status: boolean = false;
    tun_status = false;

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



    public async init() {
        // 服务器
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
        // 客户端
        const clientData = DataUtil.get(vir_client_data_key) as VirClientPojo;
        if (clientData) {
            if (clientData.open) {
                await this.tunStart(clientData);
            }
        }
        // tcp 代理
        const proxy_list = this.get_tcp_proxy();
        this.restart_tcp_proxy(proxy_list);
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
        if (sysType === SysEnum.mac) {
            // macos
            const family = buffer.readUInt32BE(0);
            if (family !== 2) return; // 只处理 IPv4

            const ipBuf = buffer.subarray(4);
            if (ipBuf.length < 20) return;

            const version = ipBuf[0] >> 4;
            if (version !== 4) return;

            // const d1 = ipBuf[16], d2 = ipBuf[17], d3 = ipBuf[18], d4 = ipBuf[19];
            // console.log(`Dest IP: ${d1}.${d2}.${d3}.${d4}`);
            return `${ipBuf[16]}.${ipBuf[17]}.${ipBuf[18]}.${ipBuf[19]}`
        }
        // 解析 IP 头部
        const version = buffer[0] >> 4;
        // const headerLength = (buf[0] & 0x0f) * 4;
        // const protocol = buf[9];
        // console.log(version);
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
    private async handleTunPackage(buffer: Buffer, is_tcp: boolean) {
        try {
            const destIP = this.getDestIpByTunPackage(buffer); // todo 改成非函数调用会增加性能
            if (!destIP) {
                return;
            }
            // if (is_tcp) {
            // console.log(buffer.subarray(4) )
             NetClientUtil.send_for_tcp(this.server_info.server_tcp_ip,this.server_info.server_tcp_port,NetMsgType.trans_data, NetUtil.getTransBuffer(destIP, sysType === SysEnum.mac ? buffer.subarray(4) : buffer));
        } catch (e) {
            console.log(e);
        }
        // } else {
        //     // udp
        //     const info = await this.udpClientCreateAndGet(destIP);
        //     if (!info) {
        //         return;
        //     }
        //     await NetClientUtil.send_for_udp(NetMsgType.udp_data,buffer, info.udp_real_address,info.udp_real_port)
        // }
    }

    get_guid(): string {
        let guid: string = DataUtil.get(data_common_key.guid_key);
        if (!guid) {
            guid = crypto.randomUUID();
            DataUtil.set(data_common_key.guid_key, guid);
        }
        return guid;
    }

    private async tunStart(data: VirClientPojo) {
        const {ip, mask} = data;
        // this.server_info.is_tcp = data.model !== VirServerEnum.udp;
        const guid = this.get_guid();
        if (this.tun_status) {
            return;
        }
        // ip是否激活
        if (await SysProcessServiceImpl.isIpAssigned(ip)) {
            throw `${ip} ip is active`;
        }
        await this.tcpConnect(data.ip, data.serverPort, data.serverIp, data.client_name, guid);
        // if (data.model === VirServerEnum.udp && this.server_info.is_tcp) {
        //     throw "服务器不支持udp";
        // }
        this.tun_status = true;
        try {
            if (getSys() === SysEnum.win) {
                get_tun_require().Wintun.set_dll_path(get_wintun_dll_path());
                get_tun_require().Wintun.init();
                get_tun_require().Wintun.set_ipv4("filecat", ip, mask, guid);
                get_tun_require().Wintun.on_data((buf) => {
                    this.handleTunPackage(buf, data.model === VirServerEnum.tcp);
                });
            } else if (getSys() === SysEnum.linux) {
                const tun = new (get_tun_require().LinuxTun)();
                tun.mtu = 4096;
                tun.ipv4 = `${ip}/${mask}`
                // tun.ipv6 = 'abcd:1:2:3::/64';
                tun.on('data', (buf) => {
                    // console.log(buf)
                    this.handleTunPackage(buf, data.model === VirServerEnum.tcp);
                })
                tun.isUp = true;
                this.tun.linuxTun = tun;
            } else if (getSys() === SysEnum.mac) {
                const tun = get_tun_require().MacTun.createTun();
                this.tun.macTun = tun;
                this.tun.macTun.ip = `${ip}/${mask}`
                // console.log(ip)
                get_tun_require().MacTun.setIPv4(ip, ip);
                get_tun_require().MacTun.applyGlobalMask({subnet: this.tun.macTun.ip}, tun.name);
                this.tun.macTun.readStream = fs.createReadStream(null, {fd: tun.fd, highWaterMark: 4096});
                this.tun.macTun.writeStream = fs.createWriteStream(null, {fd: tun.fd});
                this.tun.macTun.readStream.on('data', (buf) => {
                    // console.log(buf)
                    this.handleTunPackage(buf, data.model === VirServerEnum.tcp);
                })
            }
        } catch (e) {
            console.log('error: ', e);
        }
        console.log('tun适配器启动---', `${ip}/${mask}`)
    }

    server_info = {
        // is_tcp: true,
        // server_udp_port: 0, // 服务器 udp 端口

        server_tcp_ip: '', // tcp 服务地址 也是 udp 的ip地址
        server_tcp_port: 0,

        self_vir_ip: '', // 自己的虚拟ip

        self_udp_ip: '', // 自己的网络所在的udp ip
        self_udp_port: 0,
    }

    wssSet: Set<Wss> = new Set();

    get_all_client_info() {
        return {
            state: this.client_status,
            // tcp_proxy_list_status: this.tcp_proxy?.get_all_status(),
        }
    }


    vir_net_client_get(data: WsData<any>) {
        const wss = data.wss as Wss;
        this.wssSet.add(wss);
        wss.setClose(() => {
            this.wssSet.delete(wss);
        })
        return this.get_all_client_info();
    }

    push_clinet_info() {
        const info = this.get_all_client_info();
        for (const wss of this.wssSet.values()) {
            wss.send(CmdType.vir_net_client_get, info);
        }
    }

    // tcp连接
    async tcpConnect(ip: string, serverPort: number, serverIp: string, client_name: string, guid: string) {
        this.server_info.server_tcp_ip = serverIp;
        this.server_info.server_tcp_port = serverPort;
        this.server_info.self_vir_ip = ip;
        // 发送自己的虚拟注册信息
        const register = ()=>{
            NetClientUtil.send_for_tcp(serverIp,serverPort,NetMsgType.register, Buffer.from(JSON.stringify({
                ip,
                hashKey: this.getClientHashKey(),
                client_name,
                guid
            })));
        }
        await NetClientUtil.start_tcp(serverPort, serverIp, () => {

            },
            (state) => {
                this.client_status = state;
                this.push_clinet_info();
                if(state) {
                    register()
                }
            });
        register()
        // 定时发送心跳
        // this.heartInterval = setInterval(() => {
        //     NetClientUtil.tcp_client.sendToSocket(Buffer.alloc(0), this.getTcpBuffer(NetMsgType.heart, Buffer.alloc(0)));
        // }, 2000);
        // 获取服务器信息
        // const tcpBuffer = await NetClientUtil.send_for_tcp_async(NetMsgType.get_server_info, Buffer.alloc(0));
        // const tcpData:{udp_port:number } = JSON.parse(tcpBuffer.toString());
        // this.server_info.server_udp_port = tcpData.udp_port;
    }

    // public writeToTunByUdp(buffer: Buffer, remoteAddr: string) {
    //     try {
    //         if (!this.client_status || !this.udp_addr_allow_set.has(remoteAddr)) {
    //             return;
    //         }
    //         // 接收到数据转发到网卡
    //         if (getSys() === SysEnum.win) {
    //             Wintun.send_data(buffer);
    //         } else if (getSys() === SysEnum.linux) {
    //             this.tun.linuxTun.write(buffer);
    //         } else if (getSys() === SysEnum.mac) {
    //             this.tun.macTun.writeStream.write(buffer);
    //         }
    //     } catch (e) {
    //         console.log('写入网卡失败')
    //     }
    // }

    public writeToTun(buffer: Buffer) {
        try {
            // console.log(buffer)
            if (this.client_status === false) {
                return;
            }
            // 接收到数据转发到网卡
            if (getSys() === SysEnum.win) {
                get_tun_require().Wintun.send_data(buffer);
            } else if (getSys() === SysEnum.linux) {
                this.tun.linuxTun.write(buffer);
            } else if (getSys() === SysEnum.mac) {
                // console.log(buffer)
                this.tun.macTun.writeStream.write(Buffer.concat([mac_prefix,buffer]));
            }
        } catch (e) {
            console.log('写入网卡失败')
        }
    }

    public async_server_info_to_client(port: number, key: string) {
        const data = this.virClientGet();
        data.key = key;
        data.serverPort = port;
        this.virClientSave(data).catch(err => {
            console.log(err);
        });
    }

    closeTun() {
        if (!this.tun_status) {
            return;
        }
        if (getSys() === SysEnum.win) {
            get_tun_require().Wintun.close()
        } else if (getSys() === SysEnum.linux) {
            this.tun.linuxTun.release();
        } else if (getSys() === SysEnum.mac) {
            get_tun_require().MacTun.removeGlobalMask({subnet: this.tun.macTun.ip}, this.tun.macTun.name);
            get_tun_require().MacTun.closeTun();
            this.tun.macTun.readStream.destroy()
            this.tun.macTun.writeStream.destroy()
        }
        this.tun_status = false;
        console.log('关闭适配器')
    }


    public async virClientSave(data: VirClientPojo) {
        DataUtil.set(vir_client_data_key, data);
        const hashKey = NetUtil.get64Key(data.key);
        DataUtil.set(vir_data_client_hash_key, hashKey);
        if (data.open) {
            // 重新启动
            NetClientUtil.close_tcp(this.server_info.server_tcp_ip,this.server_info.server_tcp_port);
            await this.tunStart(data);
        } else {
            try {
                NetClientUtil.close_tcp(this.server_info.server_tcp_ip,this.server_info.server_tcp_port);
                this.closeTun();
            } catch (e) {
                console.log('客户端关闭失败')
            }
        }
    }

    private tcp_proxy: TcpProxy;

    public save_tcp_proxy(req: TcpProxyITem[]) {
        DataUtil.set(data_common_key.tcp_proxy_key, req);
        this.restart_tcp_proxy(req);
    }


    private restart_tcp_proxy(req: TcpProxyITem[]) {
        if (this.tcp_proxy) {
            this.tcp_proxy.close(true);
        }
        const list = req.filter(v => v.open && v.port > 0 && !!v.target_ip && v.target_port > 0).map(v => {
            return {
                proxyPort: v.port,
                targetHost: v.target_ip,
                targetPort: v.target_port,
                param: v.index
            }
        })
        if (!list.length) {
            return;
        }
        this.tcp_proxy = new TcpProxy(list);
        this.tcp_proxy.start(() => {
            this.push_clinet_info();
        });
    }

    public get_tcp_proxy(): TcpProxyITem[] {
        return DataUtil.get(data_common_key.tcp_proxy_key) ?? [];
    }
}

export const virtualClientService = new VirtualClientService();
ServerEvent.on("start", async (data) => {
    try {
        // init_wintun_dll();
        await virtualClientService.init();
    } catch (e) {
        console.error('启动虚拟网网络vpn失败', e);
    }
})

function cleanup() {
    try {
        if (virtualClientService.tun_status) {
            virtualClientService.closeTun()
        }
        console.log('TUN stopped, exiting process.');
        process.exit(0);
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);