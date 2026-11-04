import {WsClient} from "../../../common/frame/ws.client";
import {front_config} from "./config";
import {getDefaultStore} from "jotai";
import {$stroe} from "./store";
import {path_join} from "../../../common/path_util";

/**
 * 挂载目录开启「转发到对端」时，WS 要隧道到对端：
 * 带 tcp_client_num_id 触发本机 filecat 代理，带 forward_mount 让代理把 token 换成对端的。
 */
function build_ws_url() {
    // baseUrl 以 / 结尾、pathname 以 / 开头，用 path_join 避免拼出 //
    const base = path_join(`${window.location.host}${front_config.baseUrl}`, window.location.pathname);
    const mount = getDefaultStore().get($stroe.current_mount);
    if (!mount?.forward_to_remote || !mount?.forward_client_num_id) {
        return base;
    }
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}tcp_client_num_id=${mount.forward_client_num_id}&forward_mount=1`;
}

export const ws = new WsClient(build_ws_url, "全局");
