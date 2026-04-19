import {NetMsgType} from "./NetUtil";
import {tcp_raw_socket} from "./tcp.client";


export interface tcp_client_options {
    server_port: number;
    server_host: string;

    not_reconnect_attempt?: boolean; // 不做自动重连 由上层来做

    msg_map?:Partial<{// 覆盖接收函数
        [M in NetMsgType]: (data: Buffer, util: tcp_raw_socket, tag_id?: number) => void
    }>
}