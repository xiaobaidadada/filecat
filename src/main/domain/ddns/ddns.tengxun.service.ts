import {DdnsConnection, DnsPod, Tengxun} from "../../../common/req/ddns.pojo";
import {DdnsPre} from "./ddns.pre";
import {IResult} from "tldts-core";

// const tencentcloud = require("tencentcloud-sdk-nodejs")
// const txClient = tencentcloud.dnspod.v20210323.Client;
import {Client as txClient}  from "./tx/dnspod_client"

export const ddns_tx_key = "tengxun_ddns_key"

export class TengxunService extends DdnsPre {
    getDdnsKey() {
        return ddns_tx_key;
    }

    async update(data: DdnsConnection, domain: IResult, ip: string, type: string) {
        const txs = (data.account as Tengxun);
        const client = new txClient({
            credential: {
                secretId: txs.secretid,
                secretKey: txs.secretkey
            },
        });
        const req = await client.DescribeRecordList({
            "Domain": domain.domain,
            "Subdomain": domain.subdomain
        });
        if (req.RecordList && req.RecordList.length > 0) {
            // 更新
            // const record = req.RecordList[0];
            await client.ModifyRecord({
                RecordId:req.RecordList[0].RecordId,
                "RecordType": type,
                "SubDomain": domain.subdomain,
                "Domain": domain.domain,
                "Value": ip,
                "RecordLine": "默认"
            });
        } else {
            //添加
            await client.CreateRecord({
                "RecordType": type,
                "SubDomain": domain.subdomain,
                "Domain": domain.domain,
                "Value": ip,
                "RecordLine": "默认",
            })
        }
    }

}

export const tengxunService = new TengxunService();