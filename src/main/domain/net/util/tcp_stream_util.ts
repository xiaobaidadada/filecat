import {NetMsgType, NetUtil} from "./NetUtil";
import net from "net";
import type { Duplex } from "stream";


/**
 * Socket 背压管理器
 *
 * 解决的问题：当源 socket 的 data 事件高频触发时，write() 返回 false 后
 * 反复注册 drain 监听器导致 MaxListenersExceededWarning。
 *
 * 核心原理：
 *   1. write() 返回 false → pause source，只注册一次 drain
 *   2. drain 触发后 → resume source
 *   3. pause() 后可能还有排队的 data 事件到达，此时 draining===true，
 *      虽然不再重复注册 drain，但 source 已经处于 paused 状态，
 *      写缓冲区的数据不会丢失（write 总是排队写入）。
 */
export class back_pressure {
    private draining = false;

    /**
     * 根据 write() 返回值管理背压
     *
     * @param source    读端的 socket（数据来源，write 返回 false 时 pause）
     * @param target    写端的 socket / stream（数据去向，注册一次 drain）
     * @param writeOk   target.write() 的返回值
     */
    guard(source: { pause: () => void; resume: () => void }, target: Duplex | net.Socket, writeOk: boolean) {
        if (writeOk) return;
        if (this.draining) {
            // 已经在等待 drain 了，但 source 可能因为 pause() 的异步性
            // 还有排队的 data 事件触发，确保 source 确实被 pause 了 对方虽然wirte失败了 但是数据没有丢
            source.pause();
            return;
        }
        this.draining = true;
        source.pause();
        target.once('drain', () => {
            this.draining = false;
            source.resume();
        });
    }

    /** 重置状态（连接关闭时调用） */
    reset() {
        this.draining = false;
    }
}

/**
 * 高级封装：一行代码完成 source → target 的带背压数据转发
 *
 * 在 source 上监听 'data' 事件，将数据通过 writeFn 写入目标端，
 * 自动处理背压（pause / resume），内部只注册一次 drain 监听器。
 *
 * @param source    读端 socket
 * @param target    写端 socket / stream（需要能 emit drain 事件）
 * @param writeFn   自定义写入函数，返回 boolean 表示是否可以继续写
 * @returns         返回一个 cleanup 函数，调用后移除 data 监听
 *
 * @example
 *   // TCP 转发：从 clientSocket 读取数据，通过 send_data 发到对端
 *   pipeWithBackpressure(clientSocket, serverSocket, (chunk) => {
 *       return server_socket.send_data(NetMsgType.tcp_socket_data, chunk);
 *   });
 */
export function pipeWithBackpressure(
    source: net.Socket | Duplex,
    target: Duplex | net.Socket,
    writeFn: (chunk: Buffer) => boolean,
): () => void {
    const bp = new back_pressure();
    const onData = (chunk: Buffer) => {
        const ok = writeFn(chunk);
        bp.guard(source as any, target, ok);
    };
    (source as any).on("data", onData);
    return () => {
        (source as any).removeListener("data", onData);
        bp.reset();
    };
}


export class tcp_stream_util {
    // 协议头两个字节，数据长度4字节(int), 自定义头
    private protocol = Buffer.from([0x19,0x98]); // 2 字节
    private tag_len = 2; // 2字节 用于请求头的tag 标识 回调函数用
    private now_all_head_length = this.protocol.length  + 4 // 协议头 + 数据长度
    private total_head_length = this.now_all_head_length + this.tag_len; // 总协议头长度

    private buffer:Buffer = Buffer.alloc(0); // 数据包

    // private on_data:(data:Buffer,tag_id?:number)=>any;
    private on_data_list:((data:Buffer,tag_id?:number)=>any)[] = []

    private one_data_resolve_map:{[key:number]:(code:NetMsgType,tcpBuffer:Buffer)=>void} = {}

    // private on_close_list:(()=>any)[] = [];

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
        // for (const close of this.on_close_list) {
        //     close();
        // }
    }


    public set_on_close(close:()=>void) {
        // this.on_close_list.push(close);
        this.socket.on("close", () => {
            close()
        })
    }

    public remove_on_close(close:()=>void) {
        this.socket.removeListener('close',close)
        // this.on_close_list = this.on_close_list.filter(v => v !== close);
    }

    // 设置包处理函数 可以添加多个
    public add_on_data(handle:(data:Buffer, tag_id?:number)=>void):void {
        // this.on_data= handle;
        this.on_data_list.push(handle);
    }

    public delete_on_data(handle:(data:Buffer, tag_id?:number)=>void) {
        this.on_data_list = this.on_data_list.filter((v:any) => v !== handle);
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

            const tag_id_number =  NetUtil.buffer_to_int16(tag_id)
            if(this.one_data_resolve_map[tag_id_number]){
                const {code, tcpBuffer} = NetUtil.getTcpData(data);
                this.one_data_resolve_map[tag_id_number](code, tcpBuffer)
            } else {
                // 没有回调的msgid 处理数据
                for(const on_data of this.on_data_list) {
                    on_data(data, tag_id_number);
                }
            }


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
        return this.socket.write( NetUtil.fastBufferConcat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data]));
    }


    public async send_data_async(code_type: NetMsgType, buffer: Buffer):Promise<{code:NetMsgType,tcpBuffer:Buffer}> {
        const tag_id = NetUtil.next_tag_id();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(()=>{
                reject("超时请求tcp")
            },10*1000)
            this.one_data_resolve_map[tag_id] = (code:NetMsgType,tcpBuffer:Buffer)=>{
                clearTimeout(timer);
                resolve({code,tcpBuffer})
                delete this.one_data_resolve_map[tag_id]
            }
            this.send_data(code_type, buffer,tag_id)
        })
    }

    // private send_raw_data(data:Buffer,tag_id?:number) {
    //     this.socket.write( NetUtil.fastBufferConcat([this.protocol,NetUtil.intToBuffer(data.length),NetUtil.int16_to_buffer(tag_id??0),data]));
    // }



}
