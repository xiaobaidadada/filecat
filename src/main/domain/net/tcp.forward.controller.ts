import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {NetMsgType, NetUtil, tcp_client_msg, tcp_server_msg, tcp_server_type} from "./util/NetUtil";
import {tcp_raw_socket} from "./util/tcp.client";
import {server_type, tcp_forward_client_type} from "./type";
import {client_num_id_key, server_key, tcpForwardService} from "./tcp.forward.server.service";
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
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {tcp_forward_client_service} from "./tcp.forward.client.service";
import {TcpForwardUtil} from "./tcp.forward.util";
import {Wss} from "../../../common/frame/ws.server";

const  tcp_client_target_map = {}

@JsonController("/tcp_forward")
export class TcpForwardController {

    @Post('/server_save')
    async server_save(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.server_fig_save(data)
        return Sucess({})
    }

    @Get('/server_get')
    async server_get(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.server_fig_get())
    }

    @Get('/get_all_open_server_client_proxy_fig')
    async get_all_open_server_client_proxy_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.get_all_open_server_client_proxy_fig())
    }

    @Get('/server_client_get')
    async server_client_get(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.server_client_get())
    }

    @Post('/server_client_save')
    async server_client_save(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        await tcpForwardService.server_client_save(data)
        return Sucess({})
    }

    @Post('/server_client_del')
    async server_client_del(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        await tcpForwardService.server_client_del(data)
        return Sucess({})
    }

    @Post('/client_save')
    async client_save(@Body() data: tcp_proxy_client_fig, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcp_forward_client_service.close_client()
        tcp_forward_client_service.client_fig_save(data)
        await tcp_forward_client_service.client_init_to_server()
        tcp_forward_client_service.push_client_status()
        return Sucess({})
    }

    @Get('/client_get')
    async client_get(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcp_forward_client_service.client_fig_get())
    }

    // 桥接控制 接口 todo 暂时不用
    @Get('/server_bridge_get_all_fig')
    async server_bridge_get_all_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.get_all_bridge_config())
    }

    @Get('/client_bridge_get_all_fig')
    async client_bridge_get_all_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcp_forward_client_service.client_bridge_get_all_fig())
    }

    @Post('/server_bridge_get_one_fig')
    async server_bridge_get_one_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(tcpForwardService.get_bridge_fig_by_server_id(data.server_client_num_id))
    }

    @Post('/server_bridge_add_fig')
    async server_bridge_add_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.add_bridge_config(data)
        return Sucess({})
    }

    @Post('/server_bridge_edit_fig')
    async server_bridge_edit_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.edit_bridge_config(data)
        return Sucess({})
    }

    @Post('/server_bridge_del_fig')
    async server_bridge_del_fig(@Body() data: any, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        tcpForwardService.del_bridge_config(data.id)
        return Sucess({})
    }

    @msg(CmdType.tcp_proxy_client_status)
    vir_net_client_get(data: WsData<any>) {
        userService.check_user_auth(data.wss.token, UserAuth.vir_net);
        return tcp_forward_client_service.tcp_proxy_client_status(data);
    }

    // 服务器接收注册
    @tcp_server_msg(NetMsgType.tcp_connect,tcp_server_type.tcp_forward)
    async connect(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as tcp_forward_client_type
        if(!tcpForwardService.is_ok_token(info.hash_token)) {
            return;
        }
        // token校验成功 连接成功
        NetServerUtil.connect_success(util.get_client().get_socket());
        if(info.client_num_id == null) {
            info.client_num_id = tcpForwardService.get_new_client_num_id()
        }
        const data_map:server_type = {
            all_server_socket_map: {},
            server_map: {}
        }
        util.data_map[server_key] =  data_map
        util.send_data(NetMsgType.tcp_connect, Buffer.from(JSON.stringify({
            client_num_id: info.client_num_id,
        })),tag_id);
        info.client_util = util
        await tcpForwardService.add_client(info)
        util.data_map[client_num_id_key] = info.client_num_id
        Wss.sendToAllClient(CmdType.tcp_forward_server_load,{} )
        util.on_close(() => {
            console.log(`客户端离线 ${info.client_name}`)
            tcpForwardService.delete_client(util,info.client_num_id)
            Wss.sendToAllClient(CmdType.tcp_forward_server_load,{} )
            // delete util.data_map[client_num_id_key]
            // delete util.data_map[server_key]
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
        const info = JSON.parse(data.toString()) as {
            socket_id:number,
            client_proxy_port:number,
            client_proxy_host:string
        }
        const targetSocket = net.createConnection(info.client_proxy_port, info.client_proxy_host, () => {

        });
        const key = `${info.client_proxy_port}_${ info.client_proxy_host}`
        tcp_client_target_map[key] = {
            client_proxy_port: info.client_proxy_port,
            client_proxy_host: info.client_proxy_host,
        }
        targetSocket.on("data", (data) => {
            const ok = util.send_data(NetMsgType.tcp_socket_data,Buffer.concat([NetUtil.int16_to_buffer(info.socket_id),Buffer.from(data)]))
            if(!ok) {
                targetSocket.pause()
                util.get_client().get_socket().once('drain',()=>{
                    targetSocket.resume()
                })
            }
        })
        targetSocket.on("close", () => {
            util.send_data(NetMsgType.tcp_socket_close,NetUtil.int16_to_buffer(info.socket_id))
            delete tcp_forward_client_service.client_socket_map[info.socket_id]
            delete tcp_client_target_map[key]
        })
        tcp_forward_client_service.client_socket_map[info.socket_id] = targetSocket;
    }

    // 修改信息
    @tcp_client_msg(NetMsgType.tcp_server_update_client_info)
    tcp_server_update_client_info(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as any
        const it = {} as tcp_proxy_client_fig
        it.client_name = info.client_name
        it.key = info.token
        it.serverPort = info.server_port
        tcp_forward_client_service.client_fig_save(it)
    }

    // socket的数据
    @tcp_client_msg(NetMsgType.tcp_socket_data)
    client_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.client_on_data(data)
    }
    @tcp_server_msg(NetMsgType.tcp_socket_data,tcp_server_type.tcp_forward)
    server_on_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        const data_map:server_type = util.data_map[server_key]
        TcpForwardUtil.write_socket(data_map.all_server_socket_map[socket_id],data)
        // tcp_forward_client_service.write_socket(data_map.all_server_socket_map[socket_id],data)
    }

    @tcp_server_msg(NetMsgType.tcp_socket_close,tcp_server_type.tcp_forward)
    server_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const socket_id =  NetUtil.buffer_to_int16(data.subarray(0,2))
        const data_map:server_type = util.data_map[server_key]
        data_map.all_server_socket_map[socket_id]?.destroy()
    }
    @tcp_client_msg(NetMsgType.tcp_socket_close)
    client_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.client_tcp_socket_close(data)
    }

    @tcp_client_msg(NetMsgType.tcp_server_del_client)
    server_del_client(data: Buffer, util: tcp_raw_socket, tag_id:number) {
        const fig = tcp_forward_client_service.client_fig_get()
        // delete fig.client_id
        delete fig.client_num_id
        DataUtil.set(data_common_key.tcp_proxy_client_fig,fig,file_key.tcp_proxy_server_client)
    }

    @tcp_server_msg(NetMsgType.get_global_socket_id,tcp_server_type.tcp_forward)
    get_global_socket_id(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const socket_id = tcpForwardService.get_socket_id()
        util.send_data_call(tag_id,NetUtil.int16_to_buffer(socket_id))
    }

    // 桥接相关


    @tcp_server_msg(NetMsgType.bridge_tcp_socket_close,tcp_server_type.tcp_forward)
    bridge_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.bridge_tcp_socket_close(data,util,tag_id)
    }
    @tcp_client_msg(NetMsgType.bridge_tcp_socket_close)
    client_bridge_tcp_socket_close(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.client_bridge_tcp_socket_close(data)
    }


    // 建立一个tcp服务器
    @tcp_client_msg(NetMsgType.bridge_open_port_for_client)
    bridge_open_port_for_client(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.open_port_for_client(JSON.parse(data.toString()))
    }

    // tcp服务器 socket 对象，让对方建立
    @tcp_server_msg(NetMsgType.bridge_client_create_socket_for_server,tcp_server_type.tcp_forward)
    bridge_client_create_socket_for_server(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.bridge_client_create_socket_for_server(data,util,tag_id)
    }

    // 对方建立一个 socket
    @tcp_client_msg(NetMsgType.bridge_tcp_client_create_socket_for_server)
    bridge_tcp_client_create_socket_for_server(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const info = JSON.parse(data.toString()) as {
            socket_id:number,
            client_proxy_port:number,
            client_proxy_host:string,
            server_client_num_id:number
        }
        const targetSocket = net.createConnection(info.client_proxy_port, info.client_proxy_host, () => {

        });
        const key = `${info.client_proxy_port}_${ info.client_proxy_host}`
        tcp_client_target_map[key] = {
            client_proxy_port: info.client_proxy_port,
            client_proxy_host: info.client_proxy_host,
        }
        targetSocket.on("data", (data) => {
            const ok = util.send_data(NetMsgType.bridge_tcp_socket_data,
                Buffer.concat([NetUtil.int16_to_buffer(info.server_client_num_id),NetUtil.int16_to_buffer(info.socket_id),Buffer.from(data)]))
            if(!ok) {
                targetSocket.pause()
                util.get_client().get_socket().once('drain',()=>{
                    targetSocket.resume()
                })
            }
        })
        targetSocket.on("close", () => {
            util.send_data(NetMsgType.bridge_tcp_socket_close,
                Buffer.concat([NetUtil.int16_to_buffer(info.server_client_num_id),NetUtil.int16_to_buffer(info.socket_id)]))
            delete tcp_forward_client_service.client_socket_map[info.socket_id]
            delete tcp_client_target_map[key]
        })
        tcp_forward_client_service.client_socket_map[info.socket_id] = targetSocket;
    }

    // tcp服务器 socket 需要转发给。对方数据
    @tcp_server_msg(NetMsgType.bridge_tcp_socket_data,tcp_server_type.tcp_forward)
    bridge_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.bridge_tcp_socket_data(data,util,tag_id)
    }
    @tcp_server_msg(NetMsgType.bridge_client_tcp_socket_data,tcp_server_type.tcp_forward)
    bridge_client_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcpForwardService.bridge_client_tcp_socket_data(data,util,tag_id)
    }

    // @tcp_server_msg(NetMsgType.bridge_close_port_for_client,tcp_server_type.tcp_forward)
    // bridge_close_port_for_client(data: Buffer, util: tcp_raw_socket,tag_id:number) {
    //     tcpForwardService.bridge_close_port_for_client(data,util,tag_id)
    // }

    @tcp_client_msg(NetMsgType.bridge_close_port_for_client)
    client_bridge_close_port_for_client(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.client_bridge_close_port_for_client(data,util,tag_id)
    }

    @tcp_client_msg(NetMsgType.bridge_tcp_socket_data)
    client_bridge_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.server_client_on_data(data)
    }
    @tcp_client_msg(NetMsgType.bridge_client_tcp_socket_data)
    client_bridge_client_tcp_socket_data(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        tcp_forward_client_service.client_on_data(data)
    }

}