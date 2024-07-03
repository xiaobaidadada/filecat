export class TcpUtil {
    // 协议头两个字节，数据长度4字节(int), 自定义头
    private protocal = Buffer.from([0x19,0x98]);
    private headLength:number;
    private buffer:Buffer = Buffer.alloc(0);
    private onData:(head:Buffer,data:Buffer)=>void;
    private socket;
    private processing = false;
    constructor(socket) {
        this.socket = socket;
    }
    // 设置头长度
    public setHead(length:number) {
        this.headLength = length;
    }
    // 设置包处理函数
    public setOn(handle:(head:Buffer,data:Buffer)=>void) {
        this.onData= handle;
    }
    // 处理buffer
    public handleSocket(buffer:Buffer) {
        this.buffer = Buffer.concat([this.buffer,buffer]);
        if (this.buffer.length >= this.headLength+3 &&  !this.processing) {
            this.processing = true;
            this.handleBuffer();
        }
    }
    private handleBuffer () {
        if (!(this.buffer[0]=== this.protocal[0] && this.buffer[1]=== this.protocal[1])) {
            this.buffer = Buffer.alloc(0);// 丢弃所有包
            this.processing = false;
            return;
        }
        const dataLen = this.bufferToInt(this.buffer.subarray(2,6));
        const head = this.buffer.subarray(6, 6+this.headLength);
        const data = this.buffer.subarray(6+this.headLength, 6+this.headLength+dataLen);
        this.onData(head,data);
        this.buffer = this.buffer.subarray(6+this.headLength+dataLen);
        if (this.buffer.length >= this.headLength+3) {
            this.handleBuffer();
        }
        this.processing = false;
    }
    private intToBuffer(value) {
        const buffer = Buffer.alloc(4); // 创建一个长度为4的新 Buffer
        // 写入整数到 Buffer，使用大端序（Most Significant Byte first）
        buffer.writeUInt32BE(value, 0);
        return buffer;
    }
    private bufferToInt(buffer) {
        // 从 Buffer 中读取四字节的整数，使用大端序
        return buffer.readUInt32BE(0);
    }

    /**
     * head 必须保证和设置的一样长，这里不做验证
     * @param head
     * @param data
     * @private
     */
    private getPackage(head:Buffer,data:Buffer) {
        return Buffer.concat([this.protocal,this.intToBuffer(data.length),head,data]);
    }

    public getSocket(){
        return this.socket;
    }

    /**
     * 发送数据到socket
     * @param head 长度必须和setHead设置的一样
     * @param data 实际数据
     */
    public sendToSocket(head:Buffer,data:Buffer) {
        this.socket.write(this.getPackage(head,data));
    }
}
