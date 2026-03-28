import dgram from "dgram";
import {tcp_stream_util} from "./tcp_stream_util";
import crypto from "crypto";
import {tcp_raw_socket} from "./tcp.client";

// 完全限制了一种类型的服务器中的消息可以访问另一种类型的服务的函数的可能性
export const msgServerMap: Partial<{
    [K in tcp_server_type]: Partial<{
        [M in NetMsgType]: (data: Buffer, util: tcp_raw_socket, tag_id?: number) => void
    }>
}> = {};

// 客户端既然想要连接服务器了 就是信任服务器的 这里校验小一点 代码也少一点好写一点
export const msgClientMap = new Map<NetMsgType,(data:Buffer, util:tcp_raw_socket, tag_id?: number)=>any>();



export function tcp_server_msg(msg:NetMsgType,type:tcp_server_type) {
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        if(!msgServerMap[type]) {
            msgServerMap[type] = {}
        }
        const p = msgServerMap[type][msg];
        const obj = p??new target.constructor();
        msgServerMap[type][msg] = obj[key].bind(obj)
    }
}

export function tcp_client_msg(msg:NetMsgType) {
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        const p = msgClientMap.get(msg);
        const obj = p??new target.constructor();
        msgClientMap.set(msg,obj[key].bind(obj))
    }
}

export enum tcp_server_type {
    sys_tun,
    tcp_forward
}

export enum NetMsgType {
    default, // 没有意义的 用于 head 返回的情况 但是需要设置个值
    heart  = 1 , // 心跳

    // 用于tun 代理的 ip对ip层
    register, // 注册
    data, // tcp 传输数据
    trans_data, // 转发通信数据
    async_server_info_to_client = 5, // 服务器信息同步给客户端 密钥 端口

    // 用于转发tcp的 端口对端口层
    tcp_connect,
    tcp_socket_data,
    tcp_socket_close,//  服务器和客户端都可以用

    tcp_client_create_socket_for_server,

    // 给用户更新信息
    tcp_server_update_client_info =10,

    tcp_server_del_client = 11, // 服务器删除客户端
}




export  class NetUtil {



    private static tag_value: number = 1;
    private static readonly tag_MAX = 6553511; // 最大值 65535

    static next_tag_id() {
        this.tag_value = this.tag_value + 1
        if(this.tag_MAX < this.tag_value) {
            this.tag_value = 1;
        }
        return this.tag_value;
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


    public static getTcpBuffer(code_type: NetMsgType, buffer: Buffer) {
        const buffer1 = Buffer.allocUnsafe(1);
        buffer1[0] = code_type;
        return Buffer.concat([buffer1, buffer]);
    }

    public static geRawTcpBufferList(code_type: NetMsgType, buffer: Buffer) {
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

    static intToBuffer(value) {
        const buffer = Buffer.alloc(4); // 创建一个长度为4的新 Buffer
        // 写入整数到 Buffer，使用大端序（Most Significant Byte first）
        buffer.writeUInt32BE(value, 0);
        return buffer;
    }

    static bufferToInt(buffer) {
        // 从 Buffer 中读取四字节的整数，使用大端序
        return buffer.readUInt32BE(0);
    }

    // 比 concat更快
    static  fastBufferConcat(buffers:Buffer[], totalLength?:number) {
        // 自动计算总长度（如果你不传）
        if (typeof totalLength !== 'number') {
            totalLength = 0;
            for (let buf of buffers) {
                totalLength += buf.length;
            }
        }
        const result = Buffer.allocUnsafe(totalLength);
        let offset = 0;
        for (let buf of buffers) {
            buf.copy(result, offset);
            offset += buf.length;
        }
        return result;
    }

    static int16_to_buffer(num:number) {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(num); // 大端（常用于网络协议）
        return buf;
    }
    static buffer_to_int16(buf:Buffer) {
        return buf.readUInt16BE(0);
    }

}
