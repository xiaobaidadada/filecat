/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * Copyright (c) 2018 THL A29 Limited, a Tencent company. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {ClientConfig} from "./interface"
import {
    CreateRecordRequest,
    DescribeDomainResponse,
    ModifyRecordResponse,
    DeleteDomainRequest,
    DescribeRecordListResponse,
    DescribeRecordRequest,
    DeleteRecordRequest,
    DescribeDomainRequest,
    CreateRecordResponse,
    DescribeRecordResponse,
    DeleteRecordResponse,
    DescribeUserDetailResponse,
    DescribeRecordListRequest,
    DeleteDomainResponse,
    ModifyDynamicDNSRequest,
    DescribeUserDetailRequest,
    ModifyDynamicDNSResponse,
    ModifyRecordRequest,
} from "./dnspod_models"
import {AbstractClient} from "./abstract_client";

/**
 * dnspod client
 * @class
 */
export class Client extends AbstractClient {
    constructor(clientConfig: ClientConfig) {
        super("dnspod.tencentcloudapi.com", "2021-03-23", clientConfig)
    }


    /**
     * 获取某个域名下的解析记录列表
     备注：
     1. 新添加的解析记录存在短暂的索引延迟，如果查询不到新增记录，请在 30 秒后重试
     2.  API获取的记录总条数会比控制台多2条，原因是： 为了防止用户误操作导致解析服务不可用，对2021-10-29 14:24:26之后添加的域名，在控制台都不显示这2条NS记录。
     */
    async DescribeRecordList(
        req: DescribeRecordListRequest,
        cb?: (error: string, rep: DescribeRecordListResponse) => void
    ): Promise<DescribeRecordListResponse> {
        return this.request("DescribeRecordList", req, cb)
    }

    /**
     * 修改记录
     */
    async ModifyRecord(
        req: ModifyRecordRequest,
        cb?: (error: string, rep: ModifyRecordResponse) => void
    ): Promise<ModifyRecordResponse> {
        return this.request("ModifyRecord", req, cb)
    }

    /**
     * 添加记录
     备注：新添加的解析记录存在短暂的索引延迟，如果查询不到新增记录，请在 30 秒后重试
     */
    async CreateRecord(
        req: CreateRecordRequest,
        cb?: (error: string, rep: CreateRecordResponse) => void
    ): Promise<CreateRecordResponse> {
        return this.request("CreateRecord", req, cb)
    }

    /**
     * 获取账户信息
     */
    async DescribeUserDetail(
        req?: DescribeUserDetailRequest,
        cb?: (error: string, rep: DescribeUserDetailResponse) => void
    ): Promise<DescribeUserDetailResponse> {
        return this.request("DescribeUserDetail", req, cb)
    }


    /**
     * 获取记录信息
     */
    async DescribeRecord(
        req: DescribeRecordRequest,
        cb?: (error: string, rep: DescribeRecordResponse) => void
    ): Promise<DescribeRecordResponse> {
        return this.request("DescribeRecord", req, cb)
    }

    /**
     * 更新动态 DNS 记录
     */
    async ModifyDynamicDNS(
        req: ModifyDynamicDNSRequest,
        cb?: (error: string, rep: ModifyDynamicDNSResponse) => void
    ): Promise<ModifyDynamicDNSResponse> {
        return this.request("ModifyDynamicDNS", req, cb)
    }

    /**
     * 获取域名信息
     */
    async DescribeDomain(
        req: DescribeDomainRequest,
        cb?: (error: string, rep: DescribeDomainResponse) => void
    ): Promise<DescribeDomainResponse> {
        return this.request("DescribeDomain", req, cb)
    }

    /**
     * 删除记录
     */
    async DeleteRecord(
        req: DeleteRecordRequest,
        cb?: (error: string, rep: DeleteRecordResponse) => void
    ): Promise<DeleteRecordResponse> {
        return this.request("DeleteRecord", req, cb)
    }

    /**
     * 删除域名
     */
    async DeleteDomain(
        req: DeleteDomainRequest,
        cb?: (error: string, rep: DeleteDomainResponse) => void
    ): Promise<DeleteDomainResponse> {
        return this.request("DeleteDomain", req, cb)
    }
}
