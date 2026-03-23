import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {NetMsgType, NetUtil, tcp_client_msg, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";
import {tcp_forward_client_type} from "./type";
import {tcpForwardService} from "./tcp.forward.service";
import {NetServerUtil} from "./util/NetServerUtil";
import net from "net";
import {NetPojo} from "../../../common/req/net.pojo";
import {DataUtil} from "../data/DataUtil";
import {tcp_proxy_server_config} from "../../../common/req/common.pojo";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Sucess} from "../../other/Result";
import {generateSaltyUUID} from "../../../common/StringUtil";



@JsonController("/tcp_forward")
export class TcpForwardController {

    @Post('/server_save')
    async server_save(@Body() data: tcp_proxy_server_config, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.tcp_proxy_server);
        tcpForwardService.server_save(data)
        return Sucess({})
    }

    @Get('/server_get')
    async server_get(@Body() data: NetPojo, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.tcp_proxy_server);
        return Sucess(tcpForwardService.server_get())
    }

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
            info.client_id = generateSaltyUUID(info.client_name)
        }
        info.client_util = util
        tcpForwardService.add_client(info)
        util.on_close(() => {
            tcpForwardService.delete_client(info.client_id)
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