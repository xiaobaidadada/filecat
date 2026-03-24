import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {NetMsgType, NetUtil, tcp_client_msg, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";
import {server_type, tcp_forward_client_type} from "./type";
import {server_key, tcpForwardService} from "./tcp.forward.service";
import {NetServerUtil} from "./util/NetServerUtil";
import net from "net";
import {NetPojo} from "../../../common/req/net.pojo";
import {tcp_proxy_client_fig, tcp_proxy_server_config} from "../../../common/req/common.pojo";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Sucess} from "../../other/Result";
import {generateSaltyUUID} from "../../../common/StringUtil";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {virtualClientService} from "./virtual/virtual.client.service";

const  tcp_client_target_map = {}

@JsonController("/tcp_forward")
export class TcpForwardController {

    @Post('/server_save')
    async server_save(@Body() data: tcp_proxy_server_config, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.server_fig_save(data)
        return Sucess({})
    }

    @Get('/server_get')
    async server_get(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.server_fig_get())
    }

    @Get('/server_client_get')
    async server_client_get(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.server_client_get())
    }

    @Post('/server_client_save')
    async server_client_save(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.server_client_save(data)
        return Sucess({})
    }

    @Post('/server_client_del')
    async server_client_del(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.server_client_del(data)
        return Sucess({})
    }

    @Post('/client_save')
    async client_save(@Body() data: tcp_proxy_client_fig, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.close_client()
        tcpForwardService.client_fig_save(data)
        await tcpForwardService.client_init_to_server()
        return Sucess({})
    }

    @Get('/client_get')
    async client_get(@Body() data: NetPojo, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.client_fig_get())
    }

    @msg(CmdType.tcp_proxy_client_status)
    vir_net_client_get(data: WsData<any>) {
        userService.check_user_auth(data.wss.token, UserAuth.vir_net);
        return tcpForwardService.tcp_proxy_client_status(data);
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
        util.send_data(NetMsgType.tcp_connect, Buffer.from(JSON.stringify({
            client_id:info.client_id,
        })),tag_id);
        info.client_util = util
        tcpForwardService.add_client(info)
        tcpForwardService.server_client_socket_map[info.client_id] = util;
        util.on_close(() => {
            tcpForwardService.delete_client(info.client_id)
            delete tcpForwardService.server_client_socket_map[info.client_id]
        })
    }



    @Get('/client_tcp_proxy_get')
    async client_tcp_proxy_get(@Body() data: NetPojo, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        const list:{
            client_proxy_port:number,
            client_proxy_host:string
        }[] = []
        for (const key of Object.keys(tcp_client_target_map)) {
            list.push(tcp_client_target_map[key]);
        }
        return Sucess(list)
    }

    // 客户端接收到服务器的创建请求
    @tcp_client_msg(NetMsgType.tcp_client_create_socket_for_server)
    tcp_client_create_socket_for_server(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as any
        const targetSocket = net.createConnection(info.client_proxy_port, info.client_proxy_host, () => {

        });
        const key = `${info.client_proxy_port}_${ info.client_proxy_host}`
        tcp_client_target_map[key] = {
            client_proxy_port: info.client_proxy_port,
            client_proxy_host: info.client_proxy_host,
        }
        targetSocket.on("data", (data) => {
            util.send_data(NetMsgType.tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(info.socket_id),Buffer.from(data)]))
        })
        targetSocket.on("close", () => {
            util.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(info.socket_id))
            delete tcpForwardService.client_socket_map[info.socket_id]
            delete tcp_client_target_map[key]
        })
        tcpForwardService.client_socket_map[info.socket_id] = targetSocket;
    }

    // 修改信息
    @tcp_client_msg(NetMsgType.tcp_server_update_client_info)
    tcp_server_update_client_info(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as any
        const it = tcpForwardService.client_fig_get()
        it.client_name = info.client_name
        tcpForwardService.client_fig_save(it)
    }

    // socket的数据
    @tcp_client_msg(NetMsgType.tcp_socket_data)
    server_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.client_on_data(data)
    }
    @tcp_server_msg(NetMsgType.tcp_socket_data,tcp_server_type.tcp_forward)
    client_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const server:server_type  =  util.data_map[server_key]
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        tcpForwardService.write_socket(server.server_socket_map[socket_id],data)
    }

    // 服务器和客户端接收到客户端的关闭
    @tcp_server_msg(NetMsgType.tcp_socket_close,tcp_server_type.tcp_forward)
    server_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const server:server_type  =  util.data_map[server_key]
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        server.server_socket_map[socket_id]?.destroy()
        delete server.server_socket_map[socket_id]
    }
    @tcp_client_msg(NetMsgType.tcp_socket_close)
    client_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.client_tcp_socket_close(data)
    }


}