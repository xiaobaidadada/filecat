import {DataUtil} from "../data/DataUtil";
import {VirClientPojo, VirServerEnum, VirServerPojo} from "../../../common/req/net.pojo";
import {sysType} from "../shell/shell.service";
import {ServerEvent} from "../../other/config";
import {UdpUtil} from "../pre/udp.util";
import {findAvailablePort} from "../../../common/findPort";
import os from "os";
import {TcpUtil} from "../pre/tcp.util";
import {Wss} from "../../../common/frame/ws.server";
import {get_wintun_dll_path} from "../bin/bin";

const dgram = require("dgram");
const net = require('net');
const crypto = require('crypto');
const {LinuxTun, LinuxTap, Wintun} = require('@xiaobaidadada/node-tuntap2-wintun');
const path = require("path");

const vir_server_data_key = "vir_server_net_data_key";
const vir_client_data_key = "vir_client_net_data_key";


const vir_data_client_hash_key = "vir_data_client_hash_key";
const vir_data_server_hash_key = "vir_data_server_hash_key";

enum infoType {
    empty,
    error, // 错误
    register, // 注册
    connect, // 连接
    data, // 普通通信
    heart, //心跳
    trans_data, // 转发通信数据
}

const checkClientHeartTimes = 1000 * 15;
const haertTime = 2000;
class CLientInfo extends UdpUtil {
    udpClient: any;
    tcpSocket: TcpUtil;

    vir_ip: string;
    to_address: string;
    to_port: number;

    heart: boolean = false;
    heartCheckInterval: any;
    heartInterval: any;
    close: Function;
    starChecktHeart = (clientIPAndUdpMap, vir_address, hearData) => {
        this.close = () => {
            this.checkUdp(this.udpClient, () => {
                this.udpClient.close();
                this.udpClient = null;
            });
            clientIPAndUdpMap.delete(vir_address);
            clearInterval(this.heartInterval);
            clearInterval(this.heartCheckInterval);
            console.log('断开udp连接--', vir_address)
        }
        this.heartCheckInterval = setInterval(() => {
            if (!this.heart && !!this.udpClient) {
                this.close();
                return;
            }
            this.heart = false;
        }, checkClientHeartTimes);
        this.heartInterval = setInterval(() => {
            if (this.udpClient) {
                this.udpClient.send(hearData, this.to_port, this.to_address, (err) => {
                });
            }
        }, haertTime)
    };
}

interface TunInfo {
    // winAdapter: any;
    // winSession: any;
    // winTun: any;
    linuxTun: any
}

export class VirtualService extends UdpUtil {
    // server
    udpServer;
    tcpServer;
    serverRealMap: Map<string, CLientInfo> = new Map();
    serverStatus: boolean = false;
    clientIPAndUdpMap = new Map<string, CLientInfo | number>();

    // client
    tcpReceiveRegisterSocketUtil:TcpUtil;
    udpReceiveRegisterClient;
    // register_call_stamp: number = Date.now();
    // udpToInfo: CLientInfo;
    // connect_call_stamp: number = Date.now();
    tun: TunInfo = {} as TunInfo;
    clientStatus: boolean = false;
    serverTypeIsTcp: boolean = false;

    wss:Wss;

    public virServerGet(): VirServerPojo {
        let pojo: VirServerPojo = DataUtil.get(vir_server_data_key);
        if (pojo) {
            return pojo;
        }
        pojo = new VirServerPojo();
        DataUtil.set(vir_server_data_key, pojo);
        return pojo;
    }

    public virClientGet(): VirClientPojo {
        let pojo: VirClientPojo = DataUtil.get(vir_client_data_key);
        if (pojo) {
            return pojo;
        }
        pojo = new VirClientPojo();
        DataUtil.set(vir_client_data_key, pojo);
        return pojo;
    }

    private get64Key(key: string) {
        const hash = crypto.createHash('sha256');
        hash.update(key);
        // 固定64
        return hash.digest('hex');
    }

    private getUdpBuffer(code: number, buffer: Buffer, hashKey: string) {

        const buffer1 = Buffer.alloc(1);
        buffer1[0] = code;
        const buffer2 = Buffer.from(hashKey);
        return Buffer.concat([buffer1, buffer2, buffer]);
    }

    private getUdpData(buffer: Buffer) {
        if (buffer.length < 65) {
            return;
        }
        const code = buffer[0];
        const hashKey = buffer.toString('utf8', 1, 65);
        buffer = buffer.subarray(65);
        return {code, hashKey, buffer};
    }

    private getTcpBuffer(code: number, buffer: Buffer) {
        const buffer1 = Buffer.alloc(1);
        buffer1[0] = code;
        return Buffer.concat([buffer1, buffer]);
    }

    private getTcpData(buffer: Buffer) {
        if (buffer.length < 1) {
            return;
        }
        const code = buffer[0];
        const tcpBuffer = buffer.subarray(1);
        return {code, tcpBuffer};
    }

    private udpServerStart(port: number) {
        if (this.udpServer) {
            return;
        }
        const server = dgram.createSocket('udp4');
        server.bind(port);
        server.on('message', (msg, rinfo) => {
            try {
                const {hashKey, code, buffer} = this.getUdpData(msg);
                const serverHashKey = this.getServerHashKey();
                if (hashKey !== serverHashKey) {
                    return;
                }
                const data = JSON.parse(buffer.toString());
                // console.log(rinfo,`code:${code}   data:${buffer.toString()}`)
                switch (code) {
                    case infoType.register:
                        console.log(`注册更新------来自${rinfo.address}:${rinfo.port}`)
                        // 注册或者更新，并获取自己的信息 也可用于心跳
                        let r_info = this.serverRealMap.get(data.ip);
                        if (!r_info) {
                            r_info = new CLientInfo();
                            r_info.to_address = rinfo.address;
                            r_info.to_port = rinfo.port;
                            r_info.heart = true;
                        }
                        this.serverRealMap.set(data.ip, r_info);
                        server.send(this.getUdpBuffer(infoType.register, Buffer.alloc(0), serverHashKey), rinfo.port, rinfo.address, (err) => {
                        });
                        setTimeout(()=>{
                            r_info.heart = false;
                        },haertTime+1000)
                        break;
                    case infoType.connect:
                        // 获取对方的信息，并将自己的信息发送给对方
                        const toHost = this.serverRealMap.get(data.ip);
                        if (!toHost) {
                            // 对方ip不存在
                            server.send(this.getUdpBuffer(infoType.error, Buffer.alloc(0), serverHashKey), rinfo.port, rinfo.address, (err) => {
                            });
                            return;
                        }
                        // 发送到两方
                        server.send(this.getUdpBuffer(infoType.connect, Buffer.from(JSON.stringify(toHost)), serverHashKey), rinfo.port, rinfo.address, (err) => {
                        });
                        // 虚拟ip也发给对方
                        const r_p = new CLientInfo();
                        r_p.vir_ip = data.self_ip;
                        r_p.to_port = rinfo.port;
                        r_p.to_address = rinfo.address;
                        server.send(this.getUdpBuffer(infoType.connect, Buffer.from(JSON.stringify(r_p)), serverHashKey), toHost.to_port, toHost.to_address, (err) => {
                        });
                        break;
                    case infoType.data:
                        break;
                }
            } catch (e) {
                return;
            }

        });
        this.udpServer = server;
        console.log("udp服务器运行开始")
    }

    getTransBuffer(vir_ip: string, data: Buffer) {
        const buffer1 = Buffer.from(vir_ip);
        const lenBuffer = Buffer.alloc(1);
        lenBuffer[0] = buffer1.length;
        return Buffer.concat([lenBuffer, buffer1, data]);
    }

    getTransData(buffer: Buffer) {
        const lenBuffer = buffer[0];
        const ipBuffer = buffer.subarray(1, lenBuffer + 1);
        const dataBuffer = buffer.subarray(lenBuffer + 1);
        return {data: dataBuffer, vir_ip: ipBuffer.toString()};

    }

    private tcpServerStart(port: number) {
        if (this.tcpServer) {
            return;
        }
        // 创建一个 TCP 服务器
        const server = net.createServer((socket) => {
            console.log('客户端连接');
            const tcpData = new TcpUtil(socket);
            tcpData.setHead(0);
            let vir_ip = '';
            const timeOut = setTimeout(() => {
                if (!vir_ip) {
                    socket.end();
                }
            }, 3000);
            const info = new CLientInfo();
            let checkTimerInterval;
            tcpData.setOn((head, bufferData) => {
                const {code, tcpBuffer} = this.getTcpData(bufferData);

                switch (code) {
                    case infoType.register: {
                        const serverHashKey = this.getServerHashKey();
                        clearTimeout(timeOut);
                        const data = JSON.parse(tcpBuffer.toString());
                        const hashKey = data.hashKey;
                        if (hashKey !== serverHashKey) {
                            return;
                        }
                        vir_ip = data.ip;
                        info.heart = true;
                        info.vir_ip = data.ip;
                        info.tcpSocket = tcpData;
                        this.clientIPAndUdpMap.set(data.ip, info);
                        checkTimerInterval = setInterval(() => {
                            info.heart = false;
                        },1000 *60 )
                    }
                        break;
                    case infoType.trans_data: {
                        const {data, vir_ip} = this.getTransData(tcpBuffer);
                        const info = this.clientIPAndUdpMap.get(vir_ip) as CLientInfo;
                        if (!info || !info.heart) {
                            return;
                        }
                        info.tcpSocket.sendToSocket(Buffer.alloc(0), this.getTcpBuffer(infoType.data, data));
                    }
                        break;
                    case infoType.heart:
                        info.heart = true;
                        break;
                }
            })

            // 监听数据事件
            socket.on('data', (buffer) => {
                tcpData.handleSocket(buffer)
            });
            // 监听客户端断开连接
            socket.on('end', () => {
                // this.clientIPAndUdpMap.delete(vir_ip);
                info.heart = false;
                console.log('客户端断开连接');
            });
            // 处理错误事件
            socket.on('error', (err) => {
                console.error('Socket 错误:', err);
                // this.clientIPAndUdpMap.delete(vir_ip);
                info.heart = false;
            });
        });
        server.listen(port, () => {
            console.log(`tcp服务器运行开始`);
        });
        this.tcpServer = server;
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

    private async udpClientCreateAndGet(destIP: string, serverIp: string, serverPort: number): Promise<CLientInfo | null> {

        return new Promise((resolve) => {
            let info = this.clientIPAndUdpMap.get(destIP);
            if (info === -1) {
                return;
            }
            if (info) {
                resolve(info as CLientInfo);
                return;
            }
            this.clientIPAndUdpMap.set(destIP, -1);
            const server = dgram.createSocket('udp4');
            server.bind(); // 随机绑定
            // 连接
            let pojo: VirClientPojo = DataUtil.get(vir_client_data_key);
            server.send(this.getUdpBuffer(infoType.connect, Buffer.from(JSON.stringify({
                ip: destIP,
                self_ip: pojo.ip
            })), this.getClientHashKey()), serverPort, serverIp, (err) => {
            });
            const interval = setInterval(() => {
                server.send(this.getUdpBuffer(infoType.connect, Buffer.from(JSON.stringify({
                    ip: destIP,
                    self_ip: pojo.ip
                })), this.getClientHashKey()), serverPort, serverIp, (err) => {
                });
            }, 2500);
            const timeOut = setTimeout(() => {
                this.clientIPAndUdpMap.delete(destIP);
                clearInterval(interval);
                resolve(null);
            }, 5000);
            const info_new = new CLientInfo();
            info_new.udpClient = server;
            server.on('message', (msg, rinfo: CLientInfo) => {
                try {
                    const {hashKey, code, buffer} = this.getUdpData(msg);
                    const clientHashKey = this.getClientHashKey();
                    if (hashKey !== clientHashKey) {
                        return;
                    }
                    switch (code) {
                        case infoType.error:
                            // 不做处理，再次尝试
                            break;
                        case infoType.register:
                            // 注册回调
                            break;
                        case infoType.connect:
                            clearInterval(interval);
                            clearTimeout(timeOut);
                            const data = JSON.parse(buffer.toString()) as CLientInfo;
                            // 收到连接 改变客户端发送的方向
                            server.send(this.getUdpBuffer(infoType.empty, Buffer.alloc(0), clientHashKey), data.to_port, data.to_address, (err) => {
                            });
                            info_new.to_port = data.to_port;
                            info_new.to_address = data.to_address;
                            // 成功改变才设置
                            info_new.heart = true;
                            this.clientIPAndUdpMap.set(destIP, info_new);
                            info_new.starChecktHeart(this.clientIPAndUdpMap, destIP, this.getUdpBuffer(infoType.heart, Buffer.alloc(0), this.getClientHashKey()));
                            console.log(destIP, "的udp创建完成(主动)")
                            resolve(info_new);
                            break;
                        case infoType.data:
                            this.writeToTun(buffer);
                            break;
                        case infoType.heart:
                            info_new.heart = true;
                            break;
                    }
                } catch (e) {
                    console.log('尝试连接出错', destIP)
                    return;
                }

            });


        })
    }

    public async init() {
        const serverData = DataUtil.get(vir_server_data_key) as VirServerPojo;
        if (serverData) {
            this.serverStatus = serverData.open;
            if (serverData.open) {
                if (serverData.model === VirServerEnum.udp) {
                    this.udpServerStart(serverData.port);
                } else if (serverData.model === VirServerEnum.tcp) {
                    this.tcpServerStart(serverData.port);
                }
            }
        }
        const clientData = DataUtil.get(vir_client_data_key) as VirClientPojo;
        if (clientData) {
            if (clientData.open) {
                await this.getServerType(clientData.serverIp, clientData.serverPort);
                this.clientStatus = clientData.open;
                this.tunStart(clientData);
            }
        }
    }

    public virServerSave(data: VirServerPojo) {
        DataUtil.set(vir_server_data_key, data);
        const hashKey = this.get64Key(data.key);
        DataUtil.set(vir_data_server_hash_key, hashKey);
        if (data.open) {
            if (this.serverStatus) {
                return;
            }
            if (data.model === VirServerEnum.udp) {
                this.udpServerStart(data.port);
            } else if (data.model === VirServerEnum.tcp) {
                this.tcpServerStart(data.port);
            }
            this.serverStatus = true;
        } else {
            try {
                if (this.udpServer) {
                    this.udpServer.close();
                    this.udpServer = null;
                    console.log('关闭udp服务器')
                }
                if (this.tcpServer) {
                    this.tcpServer.close();
                    this.tcpServer = null;
                    console.log('关闭tcp服务器')
                }
            } catch (e) {
                console.log('p2p服务关闭失败')
            }
            this.serverStatus = false;

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

    private async handleTunPackage(buffer: Buffer, serverIp: string, serverPort: number) {
        const destIP = this.getDestIpByTunPackage(buffer);
        if (!destIP) {
            return;
        }
        if (!!this.serverTypeIsTcp && !!this.tcpReceiveRegisterSocketUtil) {
            this.tcpReceiveRegisterSocketUtil.sendToSocket(Buffer.alloc(0),this.getTcpBuffer(infoType.trans_data,this.getTransBuffer(destIP,buffer)));
        } else {
            const info = await this.udpClientCreateAndGet(destIP, serverIp, serverPort);
            if (!info) {
                return;
            }
            // console.log("数据:"+buf);
            // 发送消息到对方服务器
            info.udpClient.send(this.getUdpBuffer(infoType.data, buffer, this.getClientHashKey()), info.to_port, info.to_address, (err) => {
            });
        }
    }

    private tunStart(data: VirClientPojo) {
        const {ip, mask} = data;
        try {
            if (sysType === 'win') {
                Wintun.wintunSetPath(get_wintun_dll_path());
                Wintun.wintunInit();
                Wintun.wintunSetIpv4("filecat", ip, mask);
                Wintun.wintunUpOn((buf) => {
                    this.handleTunPackage(buf, data.serverIp, data.serverPort);
                });
            } else {
                const tun = new LinuxTun();
                tun.mtu = 4096;
                tun.ipv4 = `${ip}/${mask}'`
                // tun.ipv6 = 'abcd:1:2:3::/64';
                tun.on('data', (buf) => {
                    this.handleTunPackage(buf, data.serverIp, data.serverPort);
                })
                tun.isUp = true;
                this.tun.linuxTun = tun;
            }
        } catch (e) {
            console.log('error: ', e);
        }
        if (this.serverTypeIsTcp) {
            this.virTcpClientRegister(data.ip, data.serverPort, data.serverIp);
        } else {
            this.virUdpClientRegister(data.ip, data.serverPort, data.serverIp);
        }
        console.log('tun适配器启动---', `${ip}/${mask}`)
    }

    virTcpClientRegister(ip: string, serverPort: number, serverIp: string) {
        if (this.tcpReceiveRegisterSocketUtil) {
            return;
        }
        // 创建一个 TCP 客户端
        const client = new net.Socket();
        const tcpData = new TcpUtil(client);
        tcpData.setHead(0);
        const timer = setTimeout(()=>{
            console.log('重试连接tcp');
            this.virTcpClientRegister(ip,serverPort,serverIp);
        },5000);
        let heartInterval ;
        client.connect(serverPort, serverIp, () => {
            clearTimeout(timer);
            this.tcpReceiveRegisterSocketUtil = tcpData;
            console.log('连接到tcp服务器')
            tcpData.sendToSocket(Buffer.alloc(0),this.getTcpBuffer(infoType.register,Buffer.from(JSON.stringify({ip,hashKey:this.getClientHashKey()}))))
            tcpData.setOn((head:Buffer,bufferData:Buffer)=>{
                const {code, tcpBuffer} = this.getTcpData(bufferData);
                switch (code) {
                    case infoType.data:
                        this.writeToTun(tcpBuffer);
                        break;
                }
            })
            heartInterval = setInterval(()=>{
                tcpData.sendToSocket(Buffer.alloc(0),this.getTcpBuffer(infoType.heart,Buffer.alloc(0)));
            },2000);
        });

        // 监听数据事件
        client.on('data', (buffer) => {
            tcpData.handleSocket(buffer);
        });
        // 监听连接关闭事件
        client.on('close', () => {
            console.log('tcp服务器连接已关闭');
            this.tcpReceiveRegisterSocketUtil = null;
            this.virTcpClientRegister(ip,serverPort,serverIp);
            if (heartInterval) {
                clearInterval(heartInterval);
            }
        });

        // 处理错误事件
        client.on('error', (err) => {
            console.error('Socket 错误:', err);
            this.tcpReceiveRegisterSocketUtil = null;
            this.virTcpClientRegister(ip,serverPort,serverIp);
            if (heartInterval) {
                clearInterval(heartInterval);
            }
        });
    }

    virUdpClientRegister(ip: string, serverPort: number, serverIp: string) {
        if (this.udpReceiveRegisterClient) {
            return;
        }
        const server = dgram.createSocket('udp4');
        server.bind(); // 随机绑定
        // 注册
        const interval = setInterval(() => {
            this.checkUdp(server, () => {
                server.send(this.getUdpBuffer(infoType.register, Buffer.from(JSON.stringify({ip})), this.getClientHashKey()), serverPort, serverIp, (err) => {
                });
            }, () => {
                clearInterval(interval);
            })
        }, 5000);
        this.udpReceiveRegisterClient = server;
        const info = new CLientInfo();
        server.on('message', (msg, rinfo: CLientInfo) => {
            try {
                const {hashKey, code, buffer} = this.getUdpData(msg);
                if (hashKey !== DataUtil.get(vir_data_client_hash_key)) {
                    return;
                }
                switch (code) {
                    case infoType.register:
                        // 注册回调
                        break;
                    case infoType.connect:
                        const data = JSON.parse(buffer.toString()) as CLientInfo;
                        // 收到连接 改变客户端发送的方向
                        server.send(this.getUdpBuffer(infoType.empty, Buffer.alloc(0), this.getClientHashKey()), data.to_port, data.to_address, (err) => {
                        });
                        this.clientIPAndUdpMap.set(data.vir_ip, info);
                        info.udpClient = server;
                        info.to_address = data.to_address;
                        info.to_port = data.to_port;
                        info.heart = true;
                        info.starChecktHeart(this.clientIPAndUdpMap, data.vir_ip, this.getUdpBuffer(infoType.heart, Buffer.alloc(0), this.getClientHashKey()));
                        this.udpReceiveRegisterClient = null;
                        clearInterval(interval);
                        this.virUdpClientRegister(ip, serverPort, serverIp);
                        console.log(data.vir_ip, "的udp创建完成(接收)")
                        break;
                    case infoType.data:
                        this.writeToTun(buffer);
                        break;
                    case infoType.heart:
                        info.heart = true;
                        break;
                }
            } catch (e) {
                return;
            }

        });

    }

    private writeToTun(buffer: Buffer) {
        try {
            if (!this.clientStatus) {
                return;
            }
            // 接收到数据转发到网卡
            if (sysType === 'win') {
                Wintun.wintunSend(buffer);
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
            Wintun.wintunClose()
        } else {
            this.tun.linuxTun.release();
        }
        console.log('关闭适配器')
    }

    checkTcpServerType(serverIp: string, serverPort: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();

            socket.setTimeout(3000); // 设置超时时间

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', (err) => {
                resolve(false);
            });
            socket.connect(serverPort, serverIp);
        })
    }
    async getServerType (serverIp,serverPort) {
        this.serverTypeIsTcp = await this.checkTcpServerType(serverIp,serverPort);
        console.log("服务器类型是", this.serverTypeIsTcp ? "tcp" : "udp");
    }
    public async virClientSave(data: VirClientPojo) {
        DataUtil.set(vir_client_data_key, data);
        const hashKey = this.get64Key(data.key);
        DataUtil.set(vir_data_client_hash_key, hashKey);
        if (data.open) {
            if (this.clientStatus) {
                return;
            }
            await this.getServerType(data.serverIp, data.serverPort);
            this.clientStatus = true;
            this.tunStart(data);
        } else {
            try {
                if (this.udpReceiveRegisterClient) {
                    this.udpReceiveRegisterClient.close();
                    this.udpReceiveRegisterClient = null;
                }
                this.clientIPAndUdpMap.forEach((value) => {
                    try {
                        if (value !== -1) {
                            (value as CLientInfo).close.bind(value)();
                        }
                    } catch (e) {
                        console.log(e);
                    }
                })
                if (this.tcpReceiveRegisterSocketUtil) {
                    this.tcpReceiveRegisterSocketUtil.getSocket().destroy();
                    // this.tcpReceiveRegisterSocketUtil = null;
                    // 关闭函数自己清理
                }
                this.closeTun();
            } catch (e) {
                console.log('客户端关闭失败')
            }
            this.clientStatus = false;
        }
    }
}

export const virtualService = new VirtualService();
ServerEvent.on("start", (data) => {
    virtualService.init();
})
