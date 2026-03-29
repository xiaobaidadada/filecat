


export interface tcp_client_options {
    server_port: number;
    server_host: string;

    not_reconnect_attempt?: boolean; // 不做自动重连 由上层来做
}