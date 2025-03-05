import {Http} from "./http";
import {Global} from "./global";
Global.init(); // 先执行
export const config = {
    // baseUrl: " http://localhost:5566/api/"
    baseUrl: `${Global.base_url}/api/`
}


export const fileUrl = `${config.baseUrl}file/`

export const fileHttp = new Http(fileUrl);

export const userHttp = new Http(`${config.baseUrl}user/`);

export const sysHttp = new Http(`${config.baseUrl}sys/`);

export const ddnsHttp = new Http(`${config.baseUrl}ddns/`);

export const netHttp = new Http(`${config.baseUrl}net/`);

export const navHttp = new Http(`${config.baseUrl}navindex/`);

export const settingHttp = new Http(`${config.baseUrl}setting/`);

export const sshHttp = new Http(`${config.baseUrl}ssh/`);

export const rdpHttp = new Http(`${config.baseUrl}rdp/`);

export const videoHttp = new Http(`${config.baseUrl}video/`);

export const cryptoHttp = new Http(`${config.baseUrl}crypto/`);
