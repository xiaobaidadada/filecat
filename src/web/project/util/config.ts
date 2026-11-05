import {Http} from "./http";
import {Global} from "./global";
Global.init(); // 先执行
export const front_config = {
    // baseUrl: " http://localhost:5566/api/"
    baseUrl: `${Global.base_url}/api/`
}


export const fileUrl = `${front_config.baseUrl}file/`

export const fileHttp = new Http(fileUrl);

export const userHttp = new Http(`${front_config.baseUrl}user/`);

export const sysHttp = new Http(`${front_config.baseUrl}sys/`);

export const ddnsHttp = new Http(`${front_config.baseUrl}ddns/`);

export const netHttp = new Http(`${front_config.baseUrl}net/`);

export const navHttp = new Http(`${front_config.baseUrl}navindex/`);

export const settingHttp = new Http(`${front_config.baseUrl}setting/`);

export const sshHttp = new Http(`${front_config.baseUrl}ssh/`);

export const rdpHttp = new Http(`${front_config.baseUrl}rdp/`);

export const videoHttp = new Http(`${front_config.baseUrl}video/`);

export const cryptoHttp = new Http(`${front_config.baseUrl}crypto/`);

export const ai_agentHttp = new Http(`${front_config.baseUrl}ai_agent/`);

/**
 * 切换 AI 请求的落地位置。
 * dir_path 非空时，请求头会带上当前目录，后端据此判断是否转发给该挂载的对端；
 * 为空时按本机处理。AI 会话按目录定位，所以切目录必须同步切换。
 */
export function set_ai_forward(dir_path: string | null) {
    ai_agentHttp.forward_dir_path = dir_path;
}

export const tcpProxy = new Http(`${front_config.baseUrl}tcp_forward/`);

export const gitHttp = new Http(`${front_config.baseUrl}git/`);

export const firewallHttp = new Http(`${front_config.baseUrl}firewall/`);
export const mountHttp = new Http(`${front_config.baseUrl}mount/`);

export const browserProxyPortHttp = new Http(`${front_config.baseUrl}browser_proxy_port/`);

