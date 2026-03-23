import {tcp_raw_socket} from "./util/tcp.client";
import net from "net";


export interface tcp_forward_client_type {
    note?:string // 备注
    // token?:string
    hash_token:string // 注册验证用的token hash 过的用于传输
    client_ip?:string
    client_port?:number
    client_name?:string
    client_id?:string // 服务器生成


    // 内存临时变量
    status?:boolean;
    client_util?: tcp_raw_socket // 服务器上的socket客户端
}

