import {tcp_raw_socket} from "./util/tcp.client";
import net from "net";
import {
    tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client
} from "../../../common/req/common.pojo";

// 传输的时候需要
export interface tcp_forward_client_type {
    note?:string // 备注
    // token?:string
    hash_token:string // 注册验证用的token hash 过的用于传输
    client_ip?:string
    client_port?:number
    client_name?:string
    client_id?:string // 服务器生成
    client_num_id?:number

    // 内存临时变量
    client_util?: tcp_raw_socket // 服务器上的socket客户端
}

export interface sockets_type  {
    [key: number]: net.Socket;
}

export interface server_item_type {
    fig:tcp_proxy_server_client,
    proxy_fig:tcp_proxy_client_item,
    server?:net.Server,
    server_socket_map:{
        [key:number]:net.Socket
    }
}



export interface bridge_server_item_type {
    server?:net.Server,
    server_socket_map:{
        [key:number]:net.Socket
    },
    fig:tcp_proxy_bridge_fig_item
}

export interface server_type {
    all_server_socket_map:{
        [key:number]:net.Socket
    }
    server_map:{
        [key:number]:server_item_type
    }
}