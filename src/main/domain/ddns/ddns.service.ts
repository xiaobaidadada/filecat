import {Ali, DdnsConnection, DdnsIPPojo, DdnsType, DnsPod, getIpType, Tengxun} from "../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../common/http";
import {Fail, Sucess} from "../../other/Result";
import {DataUtil} from "../data/DataUtil";
import {RCode} from "../../../common/Result.pojo";
import {getMapByList} from "../../../common/ListUtil";
import {dnspodService} from "./ddns.dnspod.service";
import {DdnsPre} from "./ddns.pre";
import {IResult} from "tldts-core";
import {tengxunService} from "./ddns.tengxun.service";
import {aliService, generateAliSignature, alidnsEndpoint} from "./ddns.ali.server";
// const tencentcloud = require("tencentcloud-sdk-nodejs")
// const txClient = tencentcloud.dnspod.v20210323.Client;
import {Client as txClient} from "./tx/dnspod_client"
import {data_common_key} from "../data/data_type";

const dnspodTest = "https://dnsapi.cn/User.Detail";

let ok;

export class DdnsService extends DdnsPre {

    public close_ddns_task() {
        if (ok) {
            clearInterval(ok);
            ok = undefined;
        }
    }

    public ddnsTask() {
        if (ok) return;
        ok = setInterval(() => {
            (async () => {
                const netList = await this.updateAndGetIps();
                let handle_num = 0;
                if (await dnspodService.Run(netList)) {
                    handle_num++;
                }
                if (await tengxunService.Run(netList)) {
                    handle_num++;
                }
                if (handle_num == 0) {
                    clearInterval(ok);
                }
            })().catch(e => {
                // todo 日志功能暂时不加
                console.log(e)
            })
            // 五分钟分钟检测一次
        }, 1000 * 60 * 10);
    }

    async getIps(type: string) {
        const list: DdnsIPPojo[] = await this.getNowIps();
        let key: data_common_key;
        switch (type) {
            case "dnspod":
                key = data_common_key.ddns_dnspod_key;
                break;
            case "tx":
                key = data_common_key.ddns_tx_key;
                break
            case "ali":
                key = data_common_key.ddns_ali_key;
                break;
        }
        const result = new DdnsConnection();
        const data = await DataUtil.get<DdnsConnection>(key);
        result.ips = [...list.map(v=> {return {...v}})];
        if (data!=null && data.ips?.length > 0) {
            const map = getMapByList(data.ips, (v) => v.ifaceOrWww + v.scopeid);
            for (const ip of result.ips) {
                const item = map.get(ip.ifaceOrWww + ip.scopeid);
                if (item) {
                    ip.ddnsHost = item.ddnsHost;
                }
            }
        }
        if (data) {
            result.isOpen = data.isOpen;
            result.account = data.account;
        }
        return Sucess(result);
    }

    async save(data: DdnsConnection) {
        let key = "";
        switch (data.ddnsType) {
            case DdnsType.dnspod:
                key = data_common_key.ddns_dnspod_key;
                break;
            case DdnsType.tengxun:
                key = data_common_key.ddns_tx_key;
                break
            case DdnsType.ali:
                key = data_common_key.ddns_ali_key;
                break;
        }
        if (data.isOpen) {
            if (data.ddnsType === DdnsType.dnspod) {
                key = data_common_key.ddns_dnspod_key;
                try {
                    const r = await HttpRequest.post(dnspodTest, {
                        format: "json",
                        "login_token": `${(data.account as DnsPod).id},${(data.account as DnsPod).token}`
                    }, true)
                    if (r.status.code + "" !== "1") {
                        return Sucess("身份验证失败", RCode.DdnsAuthFail);
                    }
                } catch (e) {
                    return Sucess("身份验证失败", RCode.DdnsAuthFail);
                }

            } else if (data.ddnsType === DdnsType.tengxun) {
                key = data_common_key.ddns_tx_key;
                try {
                    const client = new txClient({
                        credential: {
                            secretId: (data.account as Tengxun).secretid,
                            secretKey: (data.account as Tengxun).secretkey
                        },
                    });
                    await client.DescribeUserDetail();
                } catch (e) {
                    return Sucess("身份验证失败", RCode.DdnsAuthFail);
                }
            } else if (data.ddnsType === DdnsType.ali) {
                // todo 目前不用
                key = data_common_key.ddns_ali_key;
                try {
                    const params = {
                        Action: 'DescribeTags',
                        AccessKeyId: (data.account as Ali).accesskey_id,
                        SignatureMethod: 'HMAC-SHA1',
                        SignatureNonce: Math.random().toString(),
                        Timestamp: new Date().toISOString(),
                        Format: 'JSON',
                        SignatureVersion: '1.0',
                        Version: '2015-01-09',
                        ResourceType: "DOMAIN"
                    };
                    params['Signature'] = generateAliSignature(params, (data.account as Ali).accesskey_secret);
                    const req = await HttpRequest.get(alidnsEndpoint, params);
                } catch (e) {
                    return Sucess("身份验证失败", RCode.DdnsAuthFail);
                }
            }
            ddnsService.ddnsTask();
            await DataUtil.set(key, data);
            return Sucess("身份信息正确");
        } else {
            ddnsService.close_ddns_task();
        }
        await DataUtil.set(key, data);
        return Sucess("保存成功");
    }

    getDdnsKey() {
    }

    update(data: DdnsConnection, domain: IResult, ip: string, type: string) {
    }
}

export const ddnsService = new DdnsService();
ddnsService.ddnsTask();
