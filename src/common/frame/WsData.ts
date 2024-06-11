import {Wss} from "./ws.server";
import {JsonUtil} from "../JsonUtil";

export enum CmdType {
    // 连接
    connection= 0,
    // 验证
    auth = 1,
    // 系统信息
    sys_get,
    // 系统信息推送一直获取
    sys_getting,
    // 取消系统信息订阅
    sys_cancel,
    // 发送命令，或者开启命令会话
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
    docker_cancel,
    // docker的logs
    docker_shell_logs,
    docker_shell_logs_getting,
    docker_shell_logs_cancel,
    // docker exec执行
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
    process_cancel,
    process_close,
    // 远程shell
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
    rdp_disconnect
}


export class WsData<T> {
    public cmdType: CmdType;
    public context: T|any;
    public wss:Wss|null|WebSocket;

    constructor(cmdType: CmdType);
    constructor(cmdType: CmdType,context:T);
    constructor(cmdType: CmdType,context?:T) {
        this.cmdType = cmdType;
        this.context = context;
    }

    public encode():string {
        return JsonUtil.getJson([this.cmdType, this.context ? JSON.stringify(this.context):""]);
    }

    public static decode(str) {
        const data = JsonUtil.fromJson(str);
        return new WsData(data[0],data[1]?JSON.parse(data[1]):null);
    }

}
