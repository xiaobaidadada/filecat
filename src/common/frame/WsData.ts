import {Wss} from "./ws.server";
import {JsonUtil} from "../JsonUtil";
import * as proto from "../proto/proto"
import * as parser from "socket.io-parser"
import {Decoder, Encoder, Packet, PacketType} from "socket.io-parser"

const encoder = new parser.Encoder();
export const protocolIsProto2 = true;
export enum CmdType {
    // 连接
    connection= 0,
    // 验证
    // auth = 1,
    // 系统信息
    sys_get,
    // 系统信息推送一直获取
    sys_getting,
    // 取消系统信息订阅
    // sys_cancel,

    shell_open,
    // 发送命令
    shell_send,
    // shell持续接收
    shell_getting,
    // 取消命令
    shell_cancel,
    // cd命令
    shell_cd,
    // docker订阅
    docker_get,
    docker_getting,
    // docker 取消
    // docker_cancel,
    // docker的logs
    docker_shell_logs,
    docker_shell_logs_getting,
    docker_shell_logs_cancel,
    // docker exec执行
    docker_shell_exec_open,
    docker_shell_exec,
    docker_shell_exec_getting,
    docker_shell_exec_cancel,
    //开关
    docker_switch,
    // 删除socker容器
    docker_del_container,
    // 获取进程信息
    process_get,
    process_getting,
    // process_cancel, // 取消订阅
    process_close, // 关闭进程


    // 获取filecat管理的systemd
    systemd_inside_get,
    systemd_inside_getting,
    systemd_logs_get,
    systemd_logs_getting,


    // 远程shell
    remote_shell_open,
    remote_shell_send,
    remote_shell_getting,
    remote_shell_cancel,
    remote_shell_cd,

    // rdp
    infos,
    connect,
    rdp_connect,
    rdp_bitmap,
    rdp_close,
    rdp_error,
    mouse,
    wheel,
    scancode,
    unicode,
    rdp_disconnect,


    // net
    vir_net_serverIno_get,
    //文件功能
    file_video_trans,
    file_video_trans_progress,
    file_uncompress,
    file_uncompress_progress,
    file_compress,
    file_compress_progress,
    log_viewer,
    log_viewer_watch,
    search_file,
    search_file_progress,
    search_file_index, // 结果输出
    search_file_cancel ,

    // rtsp
    rtsp_get,
    rtsp_cancel,
}

export enum WsConnectType {
    data,
    other
}

export class WsData<T> {
    public cmdType: CmdType;
    public context: T|any;
    public bin_context: Uint8Array;
    public wss:Wss|null|WebSocket;

    constructor(cmdType: CmdType);
    constructor(cmdType: CmdType,context:T);
    constructor(cmdType: CmdType,context:T,bin_context: Uint8Array);
    constructor(cmdType: CmdType,context?:T,bin_context?: Uint8Array) {
        this.cmdType = cmdType;
        this.context = context;
        this.bin_context = bin_context;
    }

    public encode(){
        if (protocolIsProto2) {
            return proto.WsMessage.encode(proto.WsMessage.create({
                code: this.cmdType,
                context: JsonUtil.getJson(this.context),
                binContext: this.bin_context
            })).finish();
        } else {
            const p = {
                type:PacketType.EVENT,
                data:[this.cmdType,this.context]
            }
            return encoder.encode(p as Packet);
        }
        // return JsonUtil.getJson([this.cmdType, this.context ? JSON.stringify(this.context):""]);
    }

    public static decode(buffer) {
        const data = proto.WsMessage.decode(buffer);
        return new WsData(data.code,JsonUtil.fromJson(data.context),data.binContext);

        // const data = JsonUtil.fromJson(buffer.toString());
        // return new WsData(data[0],data[1]?JSON.parse(data[1]):null);
    }

}
