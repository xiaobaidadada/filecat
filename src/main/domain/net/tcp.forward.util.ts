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


export class TcpForwardUtil {

    public static write_socket(socket: net.Socket, data: Buffer) {
        if (!socket || socket.destroyed) {
            // console.warn(`socket  已关闭，丢弃数据`);
            return;
        }
        try {
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
