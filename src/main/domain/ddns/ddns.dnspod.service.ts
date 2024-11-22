import {HttpRequest} from "../../../common/http";
import {DataUtil} from "../data/DataUtil";
import {DdnsConnection, DnsPod} from "../../../common/req/ddns.pojo";
import {getMapByList} from "../../../common/ListUtil";
import {parse} from "tldts";
import {DdnsPre, updateDns} from "./ddns.pre";
import {IResult} from "tldts-core";



export const ddns_dnspod_key = "ddns_dnspod";
const dnsPodList = "https://dnsapi.cn/Record.List";
const dnspodModify  = "https://dnsapi.cn/Record.Modify";
const dnspodCreate  = "https://dnsapi.cn/Record.Create";

let async_have = false;//不是第一次同步

export class DnsPodService extends DdnsPre implements updateDns{
    async dnspodCreate(ip,id,token,subdomain,domain,type) {
        await HttpRequest.post(dnspodCreate,{
            format:"json",
            "login_token":`${id},${token}`,
            "record_type":type,
            "sub_domain":subdomain,
            "domain":domain,
            "value":ip,
            "record_line":"默认",
        },true);
    }
    async dnspodUpdate(record_id,ip,id,token,subdomain,domain,type) {
        await HttpRequest.post(dnspodModify,{
            format:"json",
            "login_token":`${id},${token}`,
            "record_type":type,
            "sub_domain":subdomain,
            "domain":domain,
            "value":ip,
            "record_id":record_id,
            "record_line":"默认",
        },true);
    }
    async dnspodGet(id,token,subdomain,domain) {
        const req = await HttpRequest.post(dnsPodList,{
            format:"json",
            "login_token":`${id},${token}`,
            // "record_type":type,
            "sub_domain":subdomain,
            "domain":domain,
        },true);
        return req;
    }
    public async Run(netList:any[]) {
        try {
            const data = await DataUtil.get<DdnsConnection>(ddns_dnspod_key);
            if (data && data.isOpen && data.ips && data.ips.length > 0) {

                const map = getMapByList(netList,(v)=>v.ifaceOrWww+v.isIPv4);
                let change = false;
                for (const ip of data.ips) {
                    try {
                        const item = map.get(ip.ifaceOrWww+ip.isIPv4);
                        if (item) {
                            if (ip.ip === item.ip && async_have) {
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
                    async_have = true;
                    DataUtil.set(ddns_dnspod_key, data);
                }
            } else {
                return false;
            }
        } finally {

        }
        return true;
    }

    async update(data: DdnsConnection,domain:IResult,ip:string,type:string) {
        const req = await this.dnspodGet((data.account as DnsPod).id,(data.account as DnsPod).token,domain.subdomain,domain.domain);
        if (req.records && req.records.length > 0) {
            // 更新
            const record = req.records[0];
            await this.dnspodUpdate(record.id,ip,(data.account as DnsPod).id,(data.account as DnsPod).token,domain.subdomain,domain.domain,type)
        } else {
            //添加
            await this.dnspodCreate(ip,(data.account as DnsPod).id,(data.account as DnsPod).token,domain.subdomain,domain.domain,type)
        }
    }

    getDdnsKey() {
        return ddns_dnspod_key;
    }
}
export const dnspodService = new DnsPodService();