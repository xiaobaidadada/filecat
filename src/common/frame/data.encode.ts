export interface WsMessage {
    cmdType?: number | null;
    context?: string | null;
    binContext?: Uint8Array | null; // 接收如果是字符串，必须要 TextDecoder 来转一下
    message?: string | null;
    code?: number | null;
    randomId?: string | null;
}

// helper：数字用 4 字节，null -> 0xFFFFFFFF
const encodeNumber = (num?: number | null) => {
    const buf = new Uint8Array(4);
    if (num === null || num === undefined) {
        buf.set([0xFF, 0xFF, 0xFF, 0xFF]);
    } else {
        const dv = new DataView(buf.buffer);
        dv.setUint32(0, num);
    }
    return buf;
};

// helper：字符串 -> 4 字节长度 + UTF-8 bytes, null -> length 0xFFFFFFFF
const encodeString = (str?: string | null) => {
    if (str === null || str === undefined) {
        const buf = new Uint8Array(4);
        const dv = new DataView(buf.buffer);
        dv.setUint32(0, 0xFFFFFFFF);
        return buf;
    }
    const textEncoder = new TextEncoder();
    const utf8 = textEncoder.encode(str);
    const lenBuf = new Uint8Array(4);
    const dv = new DataView(lenBuf.buffer);
    dv.setUint32(0, utf8.length);
    return concatUint8Arrays([lenBuf, utf8]);
};

// helper：Uint8Array -> 4 字节长度 + 内容, null -> length 0xFFFFFFFF
const encodeBin = (bin?: Uint8Array | null) => {
    if (!bin) {
        const buf = new Uint8Array(4);
        const dv = new DataView(buf.buffer);
        dv.setUint32(0, 0xFFFFFFFF);
        return buf;
    }
    const lenBuf = new Uint8Array(4);
    const dv = new DataView(lenBuf.buffer);
    dv.setUint32(0, bin.length);
    return concatUint8Arrays([lenBuf, bin]);
};

export class DataEncode {
    private static VERSION = 0; // 版本号，1 个字节

    /**
     * 序列化 WsMessage 到二进制 消息整体最小是24个字节
     * socket.io 的 socket.io-parser 其实是使用两次传输，第二次才传的二进制
     * @param msg
     * @returns Uint8Array 二进制数据
     */
    public static encode(msg: WsMessage): Uint8Array {
        const buffers: Uint8Array[] = [];
        // 1字节版本号
        buffers.push(new Uint8Array([DataEncode.VERSION]));
        // 拼接每个字段
        buffers.push(encodeNumber(msg.cmdType));
        buffers.push(encodeString(msg.context));
        buffers.push(encodeBin(msg.binContext));
        buffers.push(encodeString(msg.message));
        buffers.push(encodeNumber(msg.code));
        buffers.push(encodeString(msg.randomId));
        return concatUint8Arrays(buffers);
    }

    /**
     * 反序列化二进制为 WsMessage
     * @param data
     * @returns WsMessage 对象
     */
    public static decode(data: Uint8Array | Buffer): WsMessage {
        // 统一成 Uint8Array（Buffer 本来就是 Uint8Array，这里只是保证类型）
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);

        let offset = 0;

        const readUint32 = (): number => {
            const dv = new DataView(u8.buffer, u8.byteOffset + offset, 4);
            const val = dv.getUint32(0);
            offset += 4;
            return val;
        };

        const decodeNumber = (): number | null => {
            const val = readUint32();
            return val === 0xFFFFFFFF ? null : val;
        };

        const decodeString = (): string | null => {
            const len = readUint32();
            if (len === 0xFFFFFFFF) return null;

            if (offset + len > u8.length)
                throw new RangeError("decodeString 越界");

            const bytes = u8.slice(offset, offset + len);
            offset += len;

            return new TextDecoder().decode(bytes);
        };

        const decodeBin = (): Uint8Array | null => {
            const len = readUint32();

            if (len === 0xFFFFFFFF) return null;
            if (offset + len > u8.length)
                throw new RangeError("decodeBin 越界");

            const bytes = u8.slice(offset, offset + len);
            offset += len;

            return bytes;
        };

        // 先读版本号（很重要：必须在 readUint32 之前移动 offset）
        if (u8[offset++] !== DataEncode.VERSION) {
            throw new Error("版本号不匹配");
        }

        return {
            cmdType: decodeNumber(),
            context: decodeString(),
            binContext: decodeBin(),
            message: decodeString(),
            code: decodeNumber(),
            randomId: decodeString()
        };
    }


}

/** helper: 拼接多个 Uint8Array 更兼容浏览器 */
function concatUint8Arrays(buffers: Uint8Array[], totalLength?: number): Uint8Array {
    if (typeof totalLength !== 'number') {
        totalLength = 0;
        for (let buf of buffers) totalLength += buf.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (let buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
    }
    return result;
}


// const msg: WsMessage = {
//     cmdType: 1,
//     context: "hello",
//     binContext: Buffer.from("1"),
//     message: "test",
//     code: 400,
//     randomId: "1abc1123"
// };
//
// const binary = DataEncode.encode(msg);
// const decoded = DataEncode.decode(binary);
// console.log( decoded);
