import {Ali, DdnsConnection, DnsPod, Tengxun} from "../../../common/req/ddns.pojo";
import {DdnsPre} from "./ddns.pre";
import {IResult} from "tldts-core";
import {HttpRequest} from "../../../common/http";
import {data_common_key} from "../data/data_type";
const crypto = require('crypto');

export const alidnsEndpoint  = "https://alidns.aliyuncs.com/"


export function generateAliSignature(params, secret) {
    const sortedParams = Object.keys(params).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
    const stringToSign = `GET&%2F&${encodeURIComponent(sortedParams)}`;
    const hmac = crypto.createHmac('sha1', `${secret}&`);
    return hmac.update(stringToSign).digest('base64');
}

export class AliService extends DdnsPre {
    getDdnsKey() {
        return data_common_key.ddns_ali_key;
    }

    async update(data: DdnsConnection, domain: IResult, ip: string, type: string) {
        const alis = (data.account as Ali);
        const params = {
            Action: 'DescribeSubDomainRecords',
            AccessKeyId: alis.accesskey_id,
            SignatureMethod: 'HMAC-SHA1',
            SignatureNonce: Math.random().toString(),
            Timestamp: new Date().toISOString(),
            Format: 'JSON',
            SignatureVersion: '1.0',
            Version: '2015-01-09',
            DomainName:domain.domain,
            SubDomain:domain.subdomain
        };
        params['Signature'] = generateAliSignature(params, alis.accesskey_secret);
        const req = await HttpRequest.get(alidnsEndpoint,params);
        if (req.TotalCount > 0) {
            // 更新
            const record = req.DomainRecords.Record[0];
            const params = {
                Action: 'UpdateDomainRecord',
                AccessKeyId: alis.accesskey_id,
                SignatureMethod: 'HMAC-SHA1',
                SignatureNonce: Math.random().toString(),
                Timestamp: new Date().toISOString(),
                Format: 'JSON',
                SignatureVersion: '1.0',
                Version: '2015-01-09',
                RecordId: record.RecordID,
                RR: domain.subdomain,
                Type: type,
                Value: ip
            };
            params['Signature'] = generateAliSignature(params, alis.accesskey_secret);
            await HttpRequest.get(alidnsEndpoint,params);
        } else {
            //添加
            const params = {
                Action: 'AddDomainRecord',
                AccessKeyId: alis.accesskey_id,
                SignatureMethod: 'HMAC-SHA1',
                SignatureNonce: Math.random().toString(),
                Timestamp: new Date().toISOString(),
                Format: 'JSON',
                SignatureVersion: '1.0',
                Version: '2015-01-09',
                DomainName:domain.domain,
                RR: domain.subdomain,
                Value: ip,
                Type: type,
            };
            params['Signature'] = generateAliSignature(params, alis.accesskey_secret);
            await HttpRequest.get(alidnsEndpoint,params);
        }
    }

}

export const aliService = new AliService();