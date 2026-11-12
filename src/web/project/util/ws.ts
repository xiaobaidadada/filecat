import {WsClient} from "../../../common/frame/ws.client";
import {front_config} from "./config";
import {getDefaultStore} from "jotai";
import {$stroe} from "./store";


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
