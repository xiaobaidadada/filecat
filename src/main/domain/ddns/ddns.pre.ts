import {DdnsConnection, DdnsIPPojo, ip_source_type} from "../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../common/http";
import {IResult} from "tldts-core";
import {DataUtil} from "../data/DataUtil";
import {getMapByList} from "../../../common/ListUtil";
import {parse} from "tldts";
import {ddns_http_url_key} from "./ddns.service";
const os = require('os');

const wwwIpv4 = "https://4.ipw.cn";
const wwwIpv6 = "https://6.ipw.cn";

let getIpsCurrentStamp = null; // 上次查询Ip时间
let cacheIps:DdnsIPPojo[] = []; // 缓存ip
export abstract class DdnsPre implements updateDns{
     async_have = false;//不是第一次同步

    // async getWwwIp4(){
    //     return await HttpRequest.get(wwwIpv4);
    // }
    //
    // async getWwwIp6() {
    //     return await HttpRequest.get(wwwIpv6);
    // }

    async getNowIps() {
        const now = Date.now();
        if (!!getIpsCurrentStamp && now - getIpsCurrentStamp  < 1000 * 30) {
            // 小于30秒，使用上次的查询的结果
        } else {
            if (cacheIps.length === 0) {
                await this.updateAndGetIps();
            }
            this.updateAndGetIps().catch((err) => {
                console.log('获取ip错误',err);
            })
        }
        return cacheIps;
    }

    public async updateAndGetIps() {
        getIpsCurrentStamp = Date.now();
        let ifaces = os.networkInterfaces();
        const list:DdnsIPPojo[] = [];
        for (const key of Object.keys(ifaces)) {
            const value = ifaces[key];
            for (const item of Array.isArray(value)?value:[value]) {
                const ipPojo = new DdnsIPPojo();
                ipPojo.ifaceOrWww= key;
                ipPojo.ip=item.address;
                ipPojo.source_type = ip_source_type.physics;
                if (item.family === 'IPv4') {
                    ipPojo.isIPv4=true;
                } else if (item.family === 'IPv6') {
                    ipPojo.isIPv4=false;
                }
                list.push(ipPojo);
            }
        }
        const url_list :DdnsIPPojo[] = DataUtil.get(ddns_http_url_key) ?? [];
        for (const pojo of url_list) {
            pojo.ip= await HttpRequest.get(pojo.ifaceOrWww);
            list.push(pojo);
        }
        // const ip4 = await this.getWwwIp4();
        // if (ip4) {
        //     const ipv4 = new DdnsIPPojo();
        //     ipv4.isIPv4=true;
        //     ipv4.ifaceOrWww=wwwIpv4;
        //     ipv4.ip=ip4;
        //     ipv4.source_type = ip_source_type.http_get;
        //     list.push(ipv4);
        // }
        // const ip6 = await this.getWwwIp6();
        // if (ip6) {
        //     const ipv6 = new DdnsIPPojo();
        //     ipv6.isIPv4=false;
        //     ipv6.ifaceOrWww=wwwIpv6;
        //     ipv6.ip=ip6
        //     ipv6.source_type = ip_source_type.http_get;
        //     list.push(ipv6);
        // }
        cacheIps = list;
        return list;
    }

    public async Run(netList:any[]) {
        try {
            const data = await DataUtil.get<DdnsConnection>(this.getDdnsKey());
            if (!!data && !!data.isOpen && !!data.ips && data.ips.length > 0) {

                const map = getMapByList(netList,(v)=>v.ifaceOrWww+v.isIPv4);
                let change = false;
                for (const ip of data.ips) {
                    try {
                        const item = map.get(ip.ifaceOrWww+ip.isIPv4);
                        if (item) {
                            if (ip.ip === item.ip && this.async_have) {
                                // ip相等，且不是第一次同步就跳过；是第一次不管相等不相等都要更新
                                continue;
                            }
                            ip.ip = item.ip;
                            change = true;
                            const hosts = ip.ddnsHost.split(" ");
                            for (const host of hosts) {
                                const type = ip.isIPv4?"A":"AAAA";
                                const domain = parse(host);
                                await this.update(data,domain,ip.ip,type);
                            }
                        }
                    } finally {

                    }

                }
                if (change) {
                    this.async_have = true;
                    DataUtil.set(this.getDdnsKey(), data);
                }
            } else {
                return false;
            }
        }catch (e) {
            console.log(e)
        }
        return true;
    }

    abstract update(data: DdnsConnection, domain: IResult, ip: string, type: string);

    abstract getDdnsKey();
}
export interface updateDns {
    /**
     *  更新记录
     * @param data 不同类型的认证数据
     * @param domain 域名西悉尼
     * @param ip 要更新的新ip
     * @param type 新ip的类型， A ipv4 AAAA ipv6
     */
    update(data:DdnsConnection,domain:IResult,ip:string,type:string);

    /**
     * 获取持久化的key
     */
    getDdnsKey();
}
