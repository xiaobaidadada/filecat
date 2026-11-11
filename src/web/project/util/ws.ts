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
/**
 * WS 地址里与业务无关的那一段：`host + base_url + /api`。
 * 所有自建 WsClient 都要用它，否则部署在子路径（如 --base_url /filecat）时连不上。
 * 与全局 WS 不同的是：这里不带挂载转发参数，需要转发的场景请用 build_ws_url。
 */
export function get_ws_base() {
    return `${window.location.host}${front_config.baseUrl}`.replace(/\/+$/, "");
}

function build_ws_url() {
    const base = get_ws_base();
    const mount = getDefaultStore().get($stroe.current_mount);
    if (!mount?.forward_to_remote || !mount?.forward_client_num_id) {
        return base;
    }
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}tcp_client_num_id=${mount.forward_client_num_id}&forward_mount=1`;
}

export const ws = new WsClient(build_ws_url, "全局");
