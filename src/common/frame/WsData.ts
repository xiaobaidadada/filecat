import {RCode} from "../Result.pojo";
import {DataEncode} from "./data.encode";
import {FileCompressPojo, LogViewerPojo} from "../file.pojo";
import {WorkFlowRealTimeOneReq} from "../req/file.req";
import {ShellInitPojo} from "../req/ssh.pojo";
import {wss_interface} from "./type";
// import WebSocket from 'ws'; // 浏览器不能用

export const protocolIsProto2 = true;
export enum CmdType {
    // 连接
    // connection= 0,
    heart,
    // 验证
    // auth = 1,
    // 系统信息
    sys_get,
    // 系统信息推送一直获取
    sys_getting,
    // 取消系统信息订阅
    sys_cancel,

    shell_open,
    // 发送命令
    shell_send,
    // shell持续接收
    shell_getting,
    // 复制 命令
    shell_copy,
    // 取消命令
    // shell_cancel,
    // cd命令
    // shell_cd,
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
    vir_net_client_get,
    tcp_proxy_client_status,
    //文件功能
    file_info,
    file_video_trans,
    file_video_trans_progress,
    file_uncompress,
    file_uncompress_progress,
    file_compress,
    file_compress_progress,
    file_upload_pre,
    file_upload,
    log_viewer,
    log_viewer_watch,
    log_viewer_watch_cancel,
    search_file,
    search_file_progress,
    search_file_index, // 结果输出
    search_file_cancel ,
    http_download_water,
    http_download_cancel,
    folder_size_info,
    folder_size_info_close,

    // rtsp
    rtsp_get,
    rtsp_cancel,

    // workflow
    workflow_exec,
    workflow_get,
    workflow_realtime,
    workflow_realtime_one_req,
    workflow_realtime_one_rsq,
    workflow_search_by_run_name,

    ai_load_info ,

    tcp_forward_server_load,

    ai_confirm_cmd, // AI 执行命令前需要用户确认

    // ===== AI 聊天（WebSocket 替代 SSE） =====
    ai_chat_req,      // 客户端发起 AI 聊天请求
    ai_chat_msg,      // 服务端推送 AI 流式回复片段
    ai_chat_end,      // 服务端推送 AI 回复结束（含 meta 信息）
    ai_chat_error,    // 服务端推送 AI 错误信息
    ai_chat_abort,    // 客户端主动取消正在进行的 AI 聊天

    // ===== AI 后台进程管理 =====
    ai_bg_process_list_req,   // 客户端请求后台进程列表
    ai_bg_process_list_rsq,   // 服务端返回后台进程列表
    ai_bg_process_output_req, // 客户端请求某个进程的输出
    ai_bg_process_output_rsq, // 服务端返回某个进程的输出
    ai_bg_process_kill_req,   // 客户端请求终止某个进程
    ai_bg_process_kill_rsq,   // 服务端返回终止结果

}



export type ws_cmd_type_map = {
    [CmdType.heart]: [any, any]

    [CmdType.sys_get]: [any, any]
    [CmdType.sys_getting]: [any, any]
    [CmdType.sys_cancel]: [any, any]

    [CmdType.shell_open]: [ShellInitPojo, any]
    [CmdType.shell_send]: [any, any]
    [CmdType.shell_getting]: [any, any]
    [CmdType.shell_copy]: [any, any]

    [CmdType.docker_get]: [any, any]
    [CmdType.docker_getting]: [any, any]
    [CmdType.docker_shell_logs]: [any, any]
    [CmdType.docker_shell_logs_getting]: [any, any]
    [CmdType.docker_shell_logs_cancel]: [any, any]
    [CmdType.docker_shell_exec_open]: [any, any]
    [CmdType.docker_shell_exec]: [any, any]
    [CmdType.docker_shell_exec_getting]: [any, any]
    [CmdType.docker_shell_exec_cancel]: [any, any]
    [CmdType.docker_switch]: [any, any]
    [CmdType.docker_del_container]: [{dockerId:string}, any]

    [CmdType.process_get]: [any, any]
    [CmdType.process_getting]: [any, any]
    [CmdType.process_close]: [any, any]

    [CmdType.systemd_inside_get]: [any, any]
    [CmdType.systemd_inside_getting]: [any, any]
    [CmdType.systemd_logs_get]: [any, any]
    [CmdType.systemd_logs_getting]: [any, any]

    [CmdType.remote_shell_open]: [any, any]
    [CmdType.remote_shell_send]: [any, any]
    [CmdType.remote_shell_getting]: [any, any]
    [CmdType.remote_shell_cancel]: [any, any]
    [CmdType.remote_shell_cd]: [any, any]

    [CmdType.infos]: [any, any]
    [CmdType.connect]: [any, any]

    [CmdType.rdp_connect]: [any, any]
    [CmdType.rdp_bitmap]: [any, any]
    [CmdType.rdp_close]: [any, any]
    [CmdType.rdp_error]: [any, any]
    [CmdType.mouse]: [any, any]
    [CmdType.wheel]: [any, any]
    [CmdType.scancode]: [any, any]
    [CmdType.unicode]: [any, any]
    [CmdType.rdp_disconnect]: [any, any]

    [CmdType.vir_net_serverIno_get]: [any, any]
    [CmdType.vir_net_client_get]: [any, any]

    [CmdType.tcp_proxy_client_status]: [any, any]

    [CmdType.file_info]: [any, any]
    [CmdType.file_video_trans]: [any, any]
    [CmdType.file_video_trans_progress]: [any, any]
    [CmdType.file_uncompress]: [FileCompressPojo, any]
    [CmdType.file_uncompress_progress]: [any, any]
    [CmdType.file_compress]: [any, any]
    [CmdType.file_compress_progress]: [any, any]
    [CmdType.file_upload_pre]: [any, any]
    [CmdType.file_upload]: [any, any]

    [CmdType.log_viewer]: [any, any]
    [CmdType.log_viewer_watch]: [LogViewerPojo, any]
    [CmdType.log_viewer_watch_cancel]: [any, any]

    [CmdType.search_file]: [any, any]
    [CmdType.search_file_progress]: [any, any]
    [CmdType.search_file_index]: [any, any]
    [CmdType.search_file_cancel]: [any, any]

    [CmdType.http_download_water]: [any, any]
    [CmdType.http_download_cancel]: [any, any]

    [CmdType.folder_size_info]: [any, any]
    [CmdType.folder_size_info_close]: [any, any]

    [CmdType.rtsp_get]: [any, any]
    [CmdType.rtsp_cancel]: [any, any]

    [CmdType.workflow_exec]: [any, any]
    [CmdType.workflow_get]: [any, any]
    [CmdType.workflow_realtime]: [any, any]
    [CmdType.workflow_realtime_one_req]: [WorkFlowRealTimeOneReq, any]
    [CmdType.workflow_realtime_one_rsq]: [any, any]
    [CmdType.workflow_search_by_run_name]: [WorkFlowRealTimeOneReq, any]

    [CmdType.ai_load_info]: [any, any]

    [CmdType.tcp_forward_server_load]: [any, any],

    [CmdType.ai_confirm_cmd]: [any, any],

    // ===== AI 聊天 WS 类型映射 =====
    [CmdType.ai_chat_req]: [any, any],
    [CmdType.ai_chat_msg]: [any, any],
    [CmdType.ai_chat_end]: [any, any],
    [CmdType.ai_chat_error]: [any, any],
    [CmdType.ai_chat_abort]: [any, any],

    // ===== AI 后台进程管理 WS 类型映射 =====
    [CmdType.ai_bg_process_list_req]: [any, any],
    [CmdType.ai_bg_process_list_rsq]: [any, any],
    [CmdType.ai_bg_process_output_req]: [any, any],
    [CmdType.ai_bg_process_output_rsq]: [any, any],
    [CmdType.ai_bg_process_kill_req]: [any, any],
    [CmdType.ai_bg_process_kill_rsq]: [any, any],
}

export enum WsConnectType {
    data,
    other
}

export class WsData<T> {
    public cmdType: CmdType;
    public context: T|any;
    public bin_context: Uint8Array;
    public wss:wss_interface;
    public client_wss:WebSocket;
    public code:RCode; // 只有返回的时候用
    public message:string; // 只有返回的时候用 错误时候的信息
    public random_id:string;

    constructor(cmdType: CmdType);
    constructor(cmdType: CmdType,context:T);
    constructor(cmdType: CmdType,context:T,bin_context: Uint8Array);
    constructor(cmdType: CmdType,context:T,bin_context: Uint8Array,random_id:string);
    constructor(cmdType: CmdType,context?:T,bin_context?: Uint8Array,random_id?:string) {
        this.cmdType = cmdType;
        this.context = context;
        this.bin_context = bin_context;
        this.code = RCode.Success; // 默认成功
        this.random_id = random_id;
    }

    public encode(){
        return  DataEncode.encode({
            cmdType:this.cmdType,
            context: this.context?JSON.stringify(this.context):null,
            code: this.code,
            message: this.message,
            binContext: this.bin_context,
            randomId:this.random_id
        })
    }

    public static decode(buffer) {
        const data = DataEncode.decode(buffer);
        let context = data.context;
        if (typeof context === 'string' && context) {
            try {
                context = JSON.parse(context);
            } catch (e) {
                console.log(e);
                context = data.context;
            }
        }
        const v = new WsData(data.cmdType,context,data.binContext);
        v.code = data.code;
        v.message = data.message;
        v.random_id = data.randomId;
        return v;
    }

}
