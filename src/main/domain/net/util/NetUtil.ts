import dgram from "dgram";
import {TcpUtil} from "./tcp.util";
import crypto from "crypto";

export const msgServerMap = new Map<NetMsgType,(data:Buffer, util:TcpUtil,head?:Buffer)=>any>();

export const msgClientMap = new Map<NetMsgType,(data:Buffer, util:TcpUtil)=>any>();

export const msgUdpMap = new Map<NetMsgType,(data:Buffer,rinfo:dgram.RemoteInfo, head?:Buffer)=>any>();


export enum NetMsgType {
    default, // 没有意义的 用于 head 返回的情况 但是需要设置个值

    heart  , // 心跳
    register, // 注册
    data, // tcp 传输数据
    trans_data, // 转发通信数据
    async_server_info_to_client, // 服务器信息同步给客户端 密钥 端口

    // udp 协议
    get_server_info , // 获取服务器信息
    client_register_udp, // 客户端注册 udp
    register_udp_info , // 注册udp 信息
    get_udp_info , // 获取对方的udp信息
    udp_data, // udp 写入数据

}


export function tcpServerMsg(msg:NetMsgType) {
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        const p = msgServerMap.get(target.name);
        const obj = p??new target.constructor();
        descriptor.value
        msgServerMap.set(msg,obj[key].bind(obj))
    }
}

export function tcpClientMsg(msg:NetMsgType) {
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        const p = msgClientMap.get(target.name);
        const obj = p??new target.constructor();
        descriptor.value
        msgClientMap.set(msg,obj[key].bind(obj))
    }
}

export function udpMsg(msg:NetMsgType) {
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        const p = msgUdpMap.get(target.name);
        const obj = p??new target.constructor();
        descriptor.value
        msgUdpMap.set(msg,obj[key].bind(obj))
    }
}

export  class NetUtil {
    static head_len = 2;
    static head_0 = Buffer.alloc(2);
    static head: Buffer = Buffer.alloc(2); // 固定 2 字节 Buffer
    private static value: number = 0;
    private static readonly MAX = 0xFFFF; // 最大值 65535

    static nextHead() {
        this.value = (this.value + 1) & this.MAX; // 👈 提前加
        this.head[0] = (this.value >> 8) & 0xFF;
        this.head[1] = this.value & 0xFF;
        return this.head;
    }


    static getHeadValue(): number {
        return (this.head[0] << 8) | this.head[1];
    }

    static getHeadCurrentValue(): number {
        return this.value; // 或者你想的是 value - 1 也可以，取决于使用方式
    }

    static getHedValueByBuffer(buffer:Buffer){
        if(buffer.length !== 2) throw "len error";
        return (buffer[0] << 8) | buffer[1];
    }

    // 获取ipv4
    // static extractIPv4(address: string): string {
    //     // IPv4-mapped IPv6 的形式是 ::ffff:a.b.c.d
    //     const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;
    //
    //     const match = address.match(ipv4Mapped);
    //     if (match) {
    //         return match[1]; // 提取出 IPv4 部分
    //     }
    //
    //     return address; // 原样返回（IPv4 或真正的 IPv6）
    // }

    public static get64Key(key: string) {
        const hash = crypto.createHash('sha256');
        hash.update(key);
        // 固定64
        return hash.digest('hex');
    }

    public static getUdpBuffer(code: number, head: Buffer, buffer: Buffer) {
        if (head.length !== 2) {
            throw new Error("head 必须是 2 字节长度");
        }
        const codeBuffer = Buffer.allocUnsafe(1);
        codeBuffer[0] = code;
        return Buffer.concat([codeBuffer, head, buffer]);
    }


    public static getUdpData(buffer: Buffer) {
        if (buffer.length < 3) { // 1 字节 code + 2 字节 head
            return;
        }
        const code = buffer[0];
        const head = buffer.subarray(1, 3);
        const data = buffer.subarray(3);
        return { code, head, buffer: data };
    }


    public static getTcpBuffer(code_type: number, buffer: Buffer) {
        const buffer1 = Buffer.allocUnsafe(1);
        buffer1[0] = code_type;
        return Buffer.concat([buffer1, buffer]);
    }

    public static geRawTcpBufferList(code_type: number, buffer: Buffer) {
        const buffer1 = Buffer.allocUnsafe(1);
        buffer1[0] = code_type;
        return [buffer1, buffer];
    }

    public static getTcpData(buffer: Buffer) {
        if (buffer.length < 1) {
            return;
        }
        const code = buffer[0];
        const tcpBuffer = buffer.subarray(1);
        return {code, tcpBuffer};
    }


    static getTransBuffer(vir_ip: string, data: Buffer) {
        const buffer1 = Buffer.from(vir_ip);
        const lenBuffer = Buffer.alloc(1);
        lenBuffer[0] = buffer1.length;
        return Buffer.concat([lenBuffer, buffer1, data]);
    }

    static getTransData(buffer: Buffer) {
        const lenBuffer = buffer[0];
        const ipBuffer = buffer.subarray(1, lenBuffer + 1);
        const dataBuffer = buffer.subarray(lenBuffer + 1);
        return {data: dataBuffer, vir_ip: ipBuffer.toString()};

    }
}
