import {JsonController} from "routing-controllers";
import {NetMsgType, NetUtil, tcp_client_msg, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";
import {tcp_forward_client_type} from "./type";
import {tcpForwardService} from "./tcp.forward.service";
import {NetServerUtil} from "./util/NetServerUtil";
import {generateSaltyUUID} from "../../../common/StringUtil";
import net from "net";


@JsonController("/tcp_forward")
export class TcpForwardController {

    // 服务器接收注册
    @tcp_server_msg(NetMsgType.tcp_connect,tcp_server_type.tcp_forward)
    connect(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as tcp_forward_client_type
        if(!tcpForwardService.is_ok_token(info.hash_token)) {
            return;
        }
        // token校验成功 连接成功
        NetServerUtil.connect_success(util.get_client().get_socket());
        if(!info.client_id) {
            // info.client_id = generateSaltyUUID(info.client_name)
            // todo 临时测试
            info.client_id = "123"
        }
        if(!tcpForwardService.client_map[info.client_id]) {
            tcpForwardService.client_map[info.client_id] = info;
            // todo 对于一些端口的修改 这里要重新加载服务器上的配置
        }
        info.client_util = util
        util.on_close(() => {
            // todo 关闭客户端的一切资源
            delete tcpForwardService.client_map[info.client_id]
        })
        util.send_data(NetMsgType.tcp_connect, Buffer.from(JSON.stringify({
            client_id:info.client_id,
        })),tag_id);
    }

    // 客户端接收到服务器的创建请求
    @tcp_client_msg(NetMsgType.tcp_client_create_socket_for_server)
    tcp_client_create_socket_for_server(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as any
        const targetSocket = net.createConnection(info.client_proxy_port, info.client_proxy_host, () => {

        });
        targetSocket.on("data", (data) => {
            util.send_data(NetMsgType.tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(info.socket_id),Buffer.from(data)]))
        })
        targetSocket.on("close", () => {
            util.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(info.socket_id))
            delete tcpForwardService.client_socket_map[info.socket_id]
        })
        tcpForwardService.client_socket_map[info.socket_id] = targetSocket;
    }

    // socket的数据
    @tcp_client_msg(NetMsgType.tcp_socket_data)
    server_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.server_on_data(data,false)
    }
    @tcp_server_msg(NetMsgType.tcp_socket_data,tcp_server_type.tcp_forward)
    client_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.server_on_data(data,true)
    }

    // 服务器和客户端接收到客户端的关闭
    @tcp_server_msg(NetMsgType.tcp_socket_close,tcp_server_type.tcp_forward)
    server_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.server_tcp_socket_close(data,true)
    }
    @tcp_client_msg(NetMsgType.tcp_socket_close)
    client_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.server_tcp_socket_close(data,false)
    }


}