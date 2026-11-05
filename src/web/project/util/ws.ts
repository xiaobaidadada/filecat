import {WsClient} from "../../../common/frame/ws.client";
import {front_config} from "./config";
import {getDefaultStore} from "jotai";
import {$stroe} from "./store";

/**
 * 全局 WS 的地址不能跟着页面路由变化。
 * 它是一条全局共用的通道，后端按 CmdType 分发消息，与 pathname 无关。
 * 之前拼了 pathname，导致切页面时地址变化触发 WsClient 重建连接，
 * 而重建过程中旧连接的 close 事件会污染新连接的状态，
 * 使新页面注册的监听拿不到推送（例如系统性能页第二次进入无数据）。
 *
 * 唯一需要额外参数的场景是「挂载目录转发到对端」：
 * tcp_client_num_id 触发本机 filecat 代理走隧道，forward_mount 让代理把 token 换成对端的。
 */
function build_ws_url() {
    // baseUrl 形如 /api/，去掉末尾斜杠得到 /api
    const base = `${window.location.host}${front_config.baseUrl}`.replace(/\/+$/, "");
    const mount = getDefaultStore().get($stroe.current_mount);
    if (!mount?.forward_to_remote || !mount?.forward_client_num_id) {
        return base;
    }
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}tcp_client_num_id=${mount.forward_client_num_id}&forward_mount=1`;
}

export const ws = new WsClient(build_ws_url, "全局");
