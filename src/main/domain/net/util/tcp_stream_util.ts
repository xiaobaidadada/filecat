import {NetMsgType, NetUtil} from "./NetUtil";
import net from "net";

export class tcp_stream_util {
    // 协议头两个字节，数据长度4字节(int), 自定义头
    private protocol = Buffer.from([0x19,0x98]); // 2 字节
    private tag_len = 2; // 2字节 用于请求头的tag 标识 回调函数用
    private now_all_head_length = this.protocol.length  + 4 // 协议头 + 数据长度
    private total_head_length = this.now_all_head_length + this.tag_len; // 总协议头长度

    private buffer:Buffer = Buffer.alloc(0); // 数据包

    private on_data:(data:Buffer,tag_id?:number)=>any;

    private socket:net.Socket;


    /**
     *
     * @param socket
     * @param open_heart  客户端不需要心跳
     */
    constructor(socket) {
        this.socket = socket;
        this.socket.on("data", (data:Buffer) => {
            this.handle_socket(data);
        })
        this.socket.on("error", (err:Error) => {
            console.error(` tcp_stream error: ${err?.message}`);
        })
    }

    public close() {
        this.socket?.end();
        this.socket?.destroy();
    }


    // 设置包处理函数
    public set_on_data(handle:( data:Buffer,tag_id?:number)=>void) {
        this.on_data= handle;
    }

    // 处理buffer
    private handle_socket(buffer:Buffer) {
        this.buffer = NetUtil.fastBufferConcat([this.buffer,buffer]);
        if (this.buffer.length > this.total_head_length) {
            this.handle_buffer();
        }
    }

    private handle_buffer() {
        while (this.buffer.length >= this.total_head_length) {
            // 如果缓冲区长度小于协议头长度，则返回
            if (!(this.buffer[0] === this.protocol[0] && this.buffer[1] === this.protocol[1])) {
                this.buffer = Buffer.alloc(0); // 丢弃所有包
                return;
            }

            // 计算 data_len 和 total_len
            const data_len = NetUtil.bufferToInt(this.buffer.subarray(this.protocol.length, this.now_all_head_length));  // 假设数据长度紧跟在协议后面
            const total_len = this.total_head_length + data_len;

            // 如果缓冲区不足以读取完整数据包，等待更多数据
            if (this.buffer.length < total_len) {
                return;
            }

            // 提取数据包
            const data = this.buffer.subarray(this.total_head_length, total_len);
            const tag_id = this.buffer.subarray(this.now_all_head_length, this.total_head_length);

            // 处理数据
            this.on_data(data, NetUtil.buffer_to_int16(tag_id));

            // 更新缓冲区，移除已经处理过的数据
            this.buffer = this.buffer.subarray(total_len);
        }
    }



    /**
     * head 必须保证和设置的一样长，这里不做验证
     * @param data
     * @param tag_id
     * @private
     */
    // private get_package(data:Buffer,tag_id?:number) {
    //     const buf =  NetUtil.fastBufferConcat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data])
    //     return Buffer.concat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data]);
    // }

    public get_socket(){
        return this.socket;
    }


    public send_data(code_type: NetMsgType, buffer: Buffer,tag_id?:number) {
        const data = NetUtil.getTcpBuffer(code_type, buffer)
        this.socket.write( NetUtil.fastBufferConcat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data]));
    }

    // private send_raw_data(data:Buffer,tag_id?:number) {
    //     this.socket.write( NetUtil.fastBufferConcat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data]));
    // }



}
