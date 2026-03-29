import {NetServerUtil} from "../util/NetServerUtil";
import {tcp_client_item, virtualClientService} from "./virtual.client.service";
import {tcp_stream_util} from "../util/tcp_stream_util";
import {NetClientUtil} from "../util/NetClientUtil";
import dgram from "dgram";
import {virtualServerService} from "./virtual.server.service";
import {tcp_server_msg, NetMsgType, tcp_client_msg, NetUtil, tcp_server_type} from "../util/NetUtil";
import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {VirClientPojo, VirServerPojo} from "../../../../common/req/net.pojo";
import {Request} from "express";
import {userService} from "../../user/user.service";
import {UserAuth} from "../../../../common/req/user.req";
import {Sucess} from "../../../other/Result";
import {msg} from "../../../../common/frame/router";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {tcp_raw_socket} from "../util/tcp.client";
import {tag} from "jieba-wasm";

// tcp 连接信息
export const clientMap = new Map<string, tcp_client_item>(); // 虚拟ip与对方信息

@JsonController("/net")
export class VirtualController {


    @Post("/vir/server/delete/client")
    async vir_server_delete_client(@Body() data: { ips: string[] }, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        for (const ip of data.ips ?? []) {
            const client = clientMap.get(ip);
            if (client) {
                client.close();
                clientMap.delete(ip);
                virtualServerService.pushConnectInfo();
            }
        }
        return Sucess("1");
    }

    // 虚拟网络
    @Get("/vir/server/get")
    virServerGet(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(virtualServerService.virServerGet());
    }

    @Post("/vir/server/save")
    async virServerSave(@Body() data: VirServerPojo, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        if (data.async_ips?.length) {
            for (const ip of data.async_ips) {
                try {
                    const client = clientMap.get(ip);
                    if (client?.tcpUtil.connected) {
                    // todo 检测是否在线
                        client.tcpUtil.send_data(NetMsgType.async_server_info_to_client, Buffer.from(JSON.stringify({
                            port: data.port,
                            key: data.key,
                        })));
                    }
                } catch (err) {
                    console.log(err);
                }
            }
        }
        await virtualServerService.virServerSave(data);
        return Sucess("1");
    }


    @msg(CmdType.vir_net_serverIno_get)
    getServerInfos(data: WsData<any>) {
        return virtualServerService.getServerInfos(data);
    }

    @msg(CmdType.vir_net_client_get)
    vir_net_client_get(data: WsData<any>) {
        return virtualClientService.vir_net_client_get(data);
    }


    @Get("/vir/client/get")
    virClientGet(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        return Sucess(virtualClientService.virClientGet());
    }

    @Post("/vir/client/save")
    async virClientSave(@Body() data: VirClientPojo, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.vir_net);
        await virtualClientService.virClientSave(data);
        return Sucess("1");
    }


    // 注册ip信息 与鉴权
    @tcp_server_msg(NetMsgType.register,tcp_server_type.sys_tun)
    register(data: Buffer, util: tcp_raw_socket,tag_id:number) {
        const tcpData: { client_name: string, ip: string, hashKey: string, guid: string } = JSON.parse(data.toString());
        const hashKey = tcpData.hashKey;
        const serverHashKey = virtualClientService.getServerHashKey();
        if (hashKey !== serverHashKey) {
            util.get_client().close();
            return;
        }
        let info = clientMap.get(tcpData.ip);
        if (info) {
            if (info.guid !== tcpData.guid) {
                // 不允许两个客户端使用同一个guid
                util.get_client().close();
                return;
            }
        } else {
            info = new tcp_client_item();
        }
        // info.heart = true;
        const socket = util.get_client().get_socket()
        info.guid = tcpData.guid;
        info.vir_ip = tcpData.ip;
        info.tcp_real_port = socket.remotePort;
        info.tcp_real_address = socket.remoteAddress;
        info.tcpUtil = util;
        info.client_name = tcpData.client_name;
        clientMap.set(tcpData.ip, info); // 更新会覆盖之前的值
        // info.heart_interval = setInterval(() => {
        //     if(Date.now() - info.last_connect_time > 30 * 1000) {
        //         clearInterval(info.heart_interval)
        //         NetServerUtil.close_client(tcp_server_type.sys_tun,util)
        //     }
        // },10 * 1000);
        NetServerUtil.connect_success(socket);
        util.on_close(() => {
            virtualServerService.pushConnectInfo();
        })
        virtualServerService.pushConnectInfo();
        info.tcpUtil.send_data_call(tag_id, Buffer.alloc(0));
    }



    @tcp_server_msg(NetMsgType.trans_data,tcp_server_type.sys_tun)
    trans_data(tcpBuffer: Buffer, util: tcp_raw_socket) {
        const {data, vir_ip} = NetUtil.getTransData(tcpBuffer);
        // 获取对象的tcp连接对象 并转发
        const info = clientMap.get(vir_ip) as tcp_client_item;
        if (!info) {
            return;
        }
        // info.tcpUtil.sendData(NetUtil.getTcpBuffer(NetMsgType.data, data));
        // info.tcpUtil.fastSendData(NetUtil.geRawTcpBufferList(NetMsgType.data, data));
        info.tcpUtil.send_data(NetMsgType.data, data);
    }

    // 写入数据
    @tcp_client_msg(NetMsgType.data)
    data(data: Buffer, util: tcp_raw_socket) {
        // console.log(data)
        virtualClientService.writeToTun(data);
    }

    @tcp_client_msg(NetMsgType.async_server_info_to_client)
    async_server_info_to_client(data: Buffer, util: tcp_raw_socket) {
        const tcpData: { key: string, port: number } = JSON.parse(data.toString());
        virtualClientService.async_server_info_to_client(tcpData.port, tcpData.key);
    }



}
