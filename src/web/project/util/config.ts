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

export const tcpProxy = new Http(`${front_config.baseUrl}tcp_forward/`);
