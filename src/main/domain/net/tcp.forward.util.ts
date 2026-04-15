import net from "net";


export class TcpForwardUtil {

    public static write_socket(socket: net.Socket, data: Buffer, on_drain?: () => void) {
        if (!socket || socket.destroyed) {
            // console.warn(`socket  已关闭，丢弃数据`);
            return;
        }
        try {
            socket.once('drain', on_drain)
            // const ok  =
            socket.write(data.subarray(2), (err) => {
                if (err) {
                    console.error(` tcp 转发服务器 写失败 ${err?.message}`);
                }
            });
        } catch (err) {
            console.log(` tcp err: ${err?.message}`);
        }
    }
}