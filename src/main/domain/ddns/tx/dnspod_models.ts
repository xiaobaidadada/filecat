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

/**
 * CreateRecord请求参数结构体
 */
export interface CreateRecordRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 记录类型，通过 API 记录类型获得，大写英文，比如：A 。
   */
  RecordType: string
  /**
   * 记录线路，通过 API 记录线路获得，中文，比如：默认。
   */
  RecordLine: string
  /**
   * 记录值，如 IP : 200.200.200.200， CNAME : cname.dnspod.com.， MX : mail.dnspod.com.。
   */
  Value: string
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。
   */
  DomainId?: number
  /**
   * 主机记录，如 www，如果不传，默认为 @。
   */
  SubDomain?: string
  /**
   * 线路的 ID，通过 API 记录线路获得，英文字符串，比如：10=1。参数RecordLineId优先级高于RecordLine，如果同时传递二者，优先使用RecordLineId参数。
   */
  RecordLineId?: string
  /**
   * MX 优先级，当记录类型是 MX 时有效，范围1-20，MX 记录时必选。
   */
  MX?: number
  /**
   * TTL，范围1-604800，不同套餐域名最小值不同。
   */
  TTL?: number
  /**
   * 权重信息，0到100的整数。0 表示关闭，不传该参数，表示不设置权重信息。
   */
  Weight?: number
  /**
   * 记录初始状态，取值范围为 ENABLE 和 DISABLE 。默认为 ENABLE ，如果传入 DISABLE，解析不会生效，也不会验证负载均衡的限制。
   */
  Status?: string
  /**
   * 备注
   */
  Remark?: string
  /**
   * 开启DNSSEC时，强制添加CNAME/URL记录
   */
  DnssecConflictMode?: string
}


/**
 * DescribeDomain返回参数结构体
 */
export interface DescribeDomainResponse {
  /**
   * 域名信息
   */
  DomainInfo?: DomainInfo
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}

/**
 * 域名详情
 */
export interface DomainInfo {
  /**
   * 域名ID
   */
  DomainId?: number
  /**
   * 域名状态
   */
  Status?: string
  /**
   * 域名套餐等级
   */
  Grade?: string
  /**
   * 域名分组ID
   */
  GroupId?: number
  /**
   * 是否星标域名
   */
  IsMark?: string
  /**
   * TTL(DNS记录缓存时间)
   */
  TTL?: number
  /**
   * cname加速启用状态
   */
  CnameSpeedup?: string
  /**
   * 域名备注
注意：此字段可能返回 null，表示取不到有效值。
   */
  Remark?: string
  /**
   * 域名Punycode
   */
  Punycode?: string
  /**
   * 域名DNS状态
   */
  DnsStatus?: string
  /**
   * 域名的NS列表
   */
  DnspodNsList?: Array<string>
  /**
   * 域名
   */
  Domain?: string
  /**
   * 域名等级代号
   */
  GradeLevel?: number
  /**
   * 域名所属的用户ID
   */
  UserId?: number
  /**
   * 是否为付费域名
   */
  IsVip?: string
  /**
   * 域名所有者的账号
   */
  Owner?: string
  /**
   * 域名等级的描述
   */
  GradeTitle?: string
  /**
   * 域名创建时间
   */
  CreatedOn?: string
  /**
   * 最后操作时间
   */
  UpdatedOn?: string
  /**
   * 腾讯云账户Uin
   */
  Uin?: string
  /**
   * 域名实际使用的NS列表
注意：此字段可能返回 null，表示取不到有效值。
   */
  ActualNsList?: Array<string>
  /**
   * 域名的记录数量
   */
  RecordCount?: number
  /**
   * 域名所有者的账户昵称
注意：此字段可能返回 null，表示取不到有效值。
   */
  OwnerNick?: string
  /**
   * 是否在付费套餐宽限期
注意：此字段可能返回 null，表示取不到有效值。
   */
  IsGracePeriod?: string
  /**
   * 是否在付费套餐缓冲期
注意：此字段可能返回 null，表示取不到有效值。
   */
  VipBuffered?: string
  /**
   * VIP套餐有效期开始时间
注意：此字段可能返回 null，表示取不到有效值。
   */
  VipStartAt?: string
  /**
   * VIP套餐有效期结束时间
注意：此字段可能返回 null，表示取不到有效值。
   */
  VipEndAt?: string
  /**
   * VIP套餐自动续费标识。可能的值为：default-默认；no-不自动续费；yes-自动续费
注意：此字段可能返回 null，表示取不到有效值。
   */
  VipAutoRenew?: string
  /**
   * VIP套餐资源ID
注意：此字段可能返回 null，表示取不到有效值。
   */
  VipResourceId?: string
  /**
   * 是否是子域名。
注意：此字段可能返回 null，表示取不到有效值。
   */
  IsSubDomain?: boolean
  /**
   * 域名关联的标签列表
注意：此字段可能返回 null，表示取不到有效值。
   */
  TagList?: Array<TagItem>
  /**
   * 是否启用搜索引擎推送
   */
  SearchEnginePush?: string
  /**
   * 是否开启辅助 DNS
   */
  SlaveDNS?: string
}




/**
 * ModifyRecord返回参数结构体
 */
export interface ModifyRecordResponse {
  /**
   * 记录ID
   */
  RecordId?: number
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * 查询记录列表的数量统计信息
 */
export interface RecordCountInfo {
  /**
   * 子域名数量
   */
  SubdomainCount: number
  /**
   * 列表返回的记录数
   */
  ListCount: number
  /**
   * 总的记录数
   */
  TotalCount: number
}


/**
 * DeleteDomain请求参数结构体
 */
export interface DeleteDomainRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
}

/**
 * DescribeRecordList返回参数结构体
 */
export interface DescribeRecordListResponse {
  /**
   * 记录的数量统计信息
   */
  RecordCountInfo?: RecordCountInfo
  /**
   * 获取的记录列表
   */
  RecordList?: Array<RecordListItem>
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * DescribeRecord请求参数结构体
 */
export interface DescribeRecordRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 记录 ID 。可以通过接口DescribeRecordList查到所有的解析记录列表以及对应的RecordId
   */
  RecordId: number
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
}

/**
 * DeleteRecord请求参数结构体
 */
export interface DeleteRecordRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 记录 ID 。可以通过接口DescribeRecordList查到所有的解析记录列表以及对应的RecordId
   */
  RecordId: number
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
}

/**
 * DescribeDomain请求参数结构体
 */
export interface DescribeDomainRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
}



/**
 * CreateRecord返回参数结构体
 */
export interface CreateRecordResponse {
  /**
   * 记录ID
   */
  RecordId?: number
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * 记录信息
 */
export interface RecordInfo {
  /**
   * 记录 ID 。
   */
  Id: number
  /**
   * 子域名(主机记录)。
   */
  SubDomain: string
  /**
   * 记录类型, 详见 DescribeRecordType 接口。
   */
  RecordType: string
  /**
   * 解析记录的线路，详见 DescribeRecordLineList 接口。
   */
  RecordLine: string
  /**
   * 解析记录的线路 ID ，详见 DescribeRecordLineList 接口。
   */
  RecordLineId: string
  /**
   * 记录值。
   */
  Value: string
  /**
   * 记录权重值。
注意：此字段可能返回 null，表示取不到有效值。
   */
  Weight: number
  /**
   * 记录的 MX 记录值，非 MX 记录类型，默认为 0。
   */
  MX: number
  /**
   * 记录的 TTL 值。
   */
  TTL: number
  /**
   * 记录状态。0表示禁用，1表示启用。
   */
  Enabled: number
  /**
   * 该记录的 D 监控状态。
"Ok" : 服务器正常。
"Warn" : 该记录有报警, 服务器返回 4XX。
"Down" : 服务器宕机。
"" : 该记录未开启 D 监控。
   */
  MonitorStatus: string
  /**
   * 记录的备注。
注意：此字段可能返回 null，表示取不到有效值。
   */
  Remark: string
  /**
   * 记录最后更新时间。
   */
  UpdatedOn: string
  /**
   * 域名 ID 。
   */
  DomainId: number
}

/**
 * 用户信息
 */
export interface UserInfo {
  /**
   * 用户昵称
   */
  Nick: string
  /**
   * 用户ID
   */
  Id: number
  /**
   * 用户账号, 邮箱格式
   */
  Email: string
  /**
   * 账号状态：”enabled”: 正常；”disabled”: 被封禁
   */
  Status: string
  /**
   * 电话号码
   */
  Telephone: string
  /**
   * 邮箱是否通过验证：”yes”: 通过；”no”: 未通过
   */
  EmailVerified: string
  /**
   * 手机是否通过验证：”yes”: 通过；”no”: 未通过
   */
  TelephoneVerified: string
  /**
   * 账号等级, 按照用户账号下域名等级排序, 选取一个最高等级为账号等级, 具体对应情况参见域名等级。
   */
  UserGrade: string
  /**
   * 用户名称, 企业用户对应为公司名称
   */
  RealName: string
  /**
   * 是否绑定微信：”yes”: 通过；”no”: 未通过
   */
  WechatBinded: string
  /**
   * 用户UIN
   */
  Uin: number
  /**
   * 所属 DNS 服务器
   */
  FreeNs: Array<string>
}


/**
 * DescribeRecord返回参数结构体
 */
export interface DescribeRecordResponse {
  /**
   * 记录信息
   */
  RecordInfo?: RecordInfo
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * DeleteRecord返回参数结构体
 */
export interface DeleteRecordResponse {
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * 记录列表元素
 */
export interface RecordListItem {
  /**
   * 记录Id
   */
  RecordId: number
  /**
   * 记录值
   */
  Value: string
  /**
   * 记录状态，启用：ENABLE，暂停：DISABLE
   */
  Status: string
  /**
   * 更新时间
   */
  UpdatedOn: string
  /**
   * 主机名
   */
  Name: string
  /**
   * 记录线路
   */
  Line: string
  /**
   * 线路Id
   */
  LineId: string
  /**
   * 记录类型
   */
  Type: string
  /**
   * 记录权重，用于负载均衡记录
注意：此字段可能返回 null，表示取不到有效值。
   */
  Weight: number
  /**
   * 记录监控状态，正常：OK，告警：WARN，宕机：DOWN，未设置监控或监控暂停则为空
   */
  MonitorStatus: string
  /**
   * 记录备注说明
   */
  Remark: string
  /**
   * 记录缓存时间
   */
  TTL: number
  /**
   * MX值，只有MX记录有
注意：此字段可能返回 null，表示取不到有效值。
   */
  MX: number
  /**
   * 是否是默认的ns记录
   */
  DefaultNS?: boolean
}



/**
 * DescribeUserDetail返回参数结构体
 */
export interface DescribeUserDetailResponse {
  /**
   * 账户信息
   */
  UserInfo?: UserInfo
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * DescribeRecordList请求参数结构体
 */
export interface DescribeRecordListRequest {
  /**
   * 要获取的解析记录所属的域名
   */
  Domain: string
  /**
   * 要获取的解析记录所属的域名Id，如果传了DomainId，系统将会忽略Domain参数。 可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
  /**
   * 解析记录的主机头，如果传了此参数，则只会返回此主机头对应的解析记录
   */
  Subdomain?: string
  /**
   * 获取某种类型的解析记录，如 A，CNAME，NS，AAAA，显性URL，隐性URL，CAA，SPF等
   */
  RecordType?: string
  /**
   * 获取某条线路名称的解析记录。可以通过接口DescribeRecordLineList查看当前域名允许的线路信息
   */
  RecordLine?: string
  /**
   * 获取某个线路Id对应的解析记录，如果传RecordLineId，系统会忽略RecordLine参数。可以通过接口DescribeRecordLineList查看当前域名允许的线路信息
   */
  RecordLineId?: string
  /**
   * 获取某个分组下的解析记录时，传这个分组Id。
   */
  GroupId?: number
  /**
   * 通过关键字搜索解析记录，当前支持搜索主机头和记录值
   */
  Keyword?: string
  /**
   * 排序字段，支持 name,line,type,value,weight,mx,ttl,updated_on 几个字段。
   */
  SortField?: string
  /**
   * 排序方式，正序：ASC，逆序：DESC。默认值为ASC。
   */
  SortType?: string
  /**
   * 偏移量，默认值为0。
   */
  Offset?: number
  /**
   * 限制数量，当前Limit最大支持3000。默认值为100。
   */
  Limit?: number
}




/**
 * DeleteDomain返回参数结构体
 */
export interface DeleteDomainResponse {
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}


/**
 * ModifyDynamicDNS请求参数结构体
 */
export interface ModifyDynamicDNSRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 记录ID。 可以通过接口DescribeRecordList查到所有的解析记录列表以及对应的RecordId
   */
  RecordId: number
  /**
   * 记录线路，通过 API 记录线路获得，中文，比如：默认。
   */
  RecordLine: string
  /**
   * 记录值，如 IP : 200.200.200.200， CNAME : cname.dnspod.com.， MX : mail.dnspod.com.。
   */
  Value: string
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
  /**
   * 主机记录，如 www，如果不传，默认为 @。
   */
  SubDomain?: string
  /**
   * 线路的 ID，通过 API 记录线路获得，英文字符串，比如：10=1。参数RecordLineId优先级高于RecordLine，如果同时传递二者，优先使用RecordLineId参数。
   */
  RecordLineId?: string
  /**
   * TTL值，如果不传，默认为域名的TTL值。
   */
  Ttl?: number
}


/**
 * DescribeUserDetail请求参数结构体
 */
export type DescribeUserDetailRequest = null


/**
 * 标签项
 */
export interface TagItem {
  /**
   * 标签键
   */
  TagKey: string
  /**
   * 标签值
注意：此字段可能返回 null，表示取不到有效值。
   */
  TagValue?: string
}



/**
 * ModifyDynamicDNS返回参数结构体
 */
export interface ModifyDynamicDNSResponse {
  /**
   * 记录ID
   */
  RecordId?: number
  /**
   * 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。
   */
  RequestId?: string
}

/**
 * ModifyRecord请求参数结构体
 */
export interface ModifyRecordRequest {
  /**
   * 域名
   */
  Domain: string
  /**
   * 记录类型，通过 API 记录类型获得，大写英文，比如：A 。
   */
  RecordType: string
  /**
   * 记录线路，通过 API 记录线路获得，中文，比如：默认。
   */
  RecordLine: string
  /**
   * 记录值，如 IP : 200.200.200.200， CNAME : cname.dnspod.com.， MX : mail.dnspod.com.。
   */
  Value: string
  /**
   * 记录 ID 。可以通过接口DescribeRecordList查到所有的解析记录列表以及对应的RecordId
   */
  RecordId: number
  /**
   * 域名 ID 。参数 DomainId 优先级比参数 Domain 高，如果传递参数 DomainId 将忽略参数 Domain 。可以通过接口DescribeDomainList查到所有的Domain以及DomainId
   */
  DomainId?: number
  /**
   * 主机记录，如 www，如果不传，默认为 @。
   */
  SubDomain?: string
  /**
   * 线路的 ID，通过 API 记录线路获得，英文字符串，比如：10=1。参数RecordLineId优先级高于RecordLine，如果同时传递二者，优先使用RecordLineId参数。
   */
  RecordLineId?: string
  /**
   * MX 优先级，当记录类型是 MX 时有效，范围1-20，MX 记录时必选。
   */
  MX?: number
  /**
   * TTL，范围1-604800，不同等级域名最小值不同。
   */
  TTL?: number
  /**
   * 权重信息，0到100的整数。0 表示关闭，不传该参数，表示不设置权重信息。
   */
  Weight?: number
  /**
   * 记录初始状态，取值范围为 ENABLE 和 DISABLE 。默认为 ENABLE ，如果传入 DISABLE，解析不会生效，也不会验证负载均衡的限制。
   */
  Status?: string
  /**
   * 记录的备注信息。传空删除备注。
   */
  Remark?: string
  /**
   * 开启DNSSEC时，强制将其它记录修改为CNAME/URL记录
   */
  DnssecConflictMode?: string
}

