import {DdnsProvider} from "../../../../../common/req/ddns.pojo";

/**
 * 平台凭证的一个字段。
 * 不同平台需要填的凭证数量不同（如 DNSPod 要 ID + Token 两段，Cloudflare 只要 Token 一段），
 * 前端按字段列表动态渲染输入框，最终用英文逗号拼成 account 字符串提交。
 */
export interface DdnsCredField {
    label: string;        // 字段名（前端显示）
    placeholder?: string; // 占位示例
    password?: boolean;   // 是否密码框
}

/**
 * 各 DDNS 平台的展示元信息。
 * 用于前端下拉选择、账户字段提示、说明文本。
 */
export interface DdnsProviderMeta {
    provider: DdnsProvider;
    label: string;        // 展示名
    fields: DdnsCredField[]; // 凭证字段列表
    info?: string;        // 补充说明（帮助弹窗）
}

export const DDNS_PROVIDERS: DdnsProviderMeta[] = [
    {
        provider: DdnsProvider.dnspod,
        label: "DNSPod（腾讯）",
        fields: [
            {label: "ID", placeholder: "ID"},
            {label: "Token", placeholder: "在密钥管理中生成", password: true},
        ],
        info: "DNSPod 老版 API。在 dnspod.cn 控制台「用户中心 - 密钥管理」创建 API Token，分别填入 ID 与 Token。",
    },
    {
        provider: DdnsProvider.tengxun,
        label: "腾讯云 DNSPod",
        fields: [
            {label: "SecretId", placeholder: "云 API 密钥 ID"},
            {label: "SecretKey", placeholder: "云 API 密钥 Key", password: true},
        ],
        info: "腾讯云新版云 API。在腾讯云控制台「访问管理 - API 密钥管理」创建密钥，分别填入 SecretId 与 SecretKey。",
    },
    {
        provider: DdnsProvider.ali,
        label: "阿里云解析",
        fields: [
            {label: "AccessKeyId", placeholder: "AccessKey ID"},
            {label: "AccessKeySecret", placeholder: "AccessKey Secret", password: true},
        ],
        info: "在阿里云控制台「AccessKey 管理」创建密钥，分别填入 AccessKeyId 与 AccessKeySecret。",
    },
    {
        provider: DdnsProvider.cloudflare,
        label: "Cloudflare",
        fields: [{label: "API Token", placeholder: "Cloudflare API 令牌", password: true}],
        info: "在 Cloudflare「我的个人资料 - API 令牌」创建令牌，权限需包含「编辑区域 DNS」。",
    },
    {
        provider: DdnsProvider.godaddy,
        label: "GoDaddy",
        fields: [
            {label: "API Key", placeholder: "GoDaddy API Key"},
            {label: "API Secret", placeholder: "GoDaddy API Secret", password: true},
        ],
        info: "在 GoDaddy 开发者后台创建 API Key（生产环境），分别填入 Key 与 Secret。",
    },
    {
        provider: DdnsProvider.namesilo,
        label: "NameSilo",
        fields: [{label: "API Key", placeholder: "NameSilo API Key", password: true}],
        info: "在 NameSilo「账号 - API Manager」生成 API Key。",
    },
    {
        provider: DdnsProvider.namecheap,
        label: "Namecheap",
        fields: [{label: "Dynamic DNS 密码", placeholder: "Namecheap DDNS 密码", password: true}],
        info: "在 Namecheap 域名管理页「Advanced DNS」开启 Dynamic DNS，复制其中的密码。不支持 IPv6。",
    },
    {
        provider: DdnsProvider.vercel,
        label: "Vercel",
        fields: [{label: "API Token", placeholder: "Vercel API Token", password: true}],
        info: "在 Vercel「账号设置 - Tokens」创建 Token，需具备 DNS 权限。",
    },
    {
        provider: DdnsProvider.duckdns,
        label: "DuckDNS",
        fields: [{label: "Token", placeholder: "DuckDNS Token", password: true}],
        info: "DuckDNS 首页登录后即可看到 Token。域名需为 xxx.duckdns.org 形式。",
    },
    {
        provider: DdnsProvider.dynv6,
        label: "dynv6",
        fields: [{label: "Token", placeholder: "dynv6 Token", password: true}],
        info: "在 dynv6 域名详情页复制 HTTP 更新 token 填入。",
    },
    {
        provider: DdnsProvider.freedns,
        label: "FreeDNS（afraid.org）",
        fields: [{label: "更新 Token", placeholder: "FreeDNS 更新 Token", password: true}],
        info: "在 FreeDNS 域名管理页的 Dynamic DNS 链接中复制 update token 填入。",
    },
    {
        provider: DdnsProvider.noip,
        label: "No-IP",
        fields: [
            {label: "用户名", placeholder: "No-IP 用户名"},
            {label: "密码", placeholder: "No-IP 密码", password: true},
        ],
        info: "No-IP 官网账号的用户名与密码。",
    },
    {
        provider: DdnsProvider.easydns,
        label: "easyDNS",
        fields: [
            {label: "用户名", placeholder: "easyDNS 用户名"},
            {label: "密码", placeholder: "easyDNS 密码", password: true},
        ],
        info: "easyDNS 账号的用户名与密码。",
    },
    {
        provider: DdnsProvider.oray,
        label: "花生壳 Oray",
        fields: [
            {label: "账号", placeholder: "花生壳账号"},
            {label: "密码", placeholder: "花生壳密码", password: true},
        ],
        info: "花生壳官网账号与密码。更新地址：ddns.oray.com/ph/update。",
    },
    {
        provider: DdnsProvider.dyn,
        label: "通用 DynDNS2",
        fields: [
            {label: "用户名", placeholder: "DynDNS 用户名"},
            {label: "密码", placeholder: "DynDNS 密码", password: true},
        ],
        info: "适用于兼容 DynDNS2 协议的服务（更新地址 members.dyndns.org）。",
    },
    {
        provider: DdnsProvider.custom,
        label: "自定义 HTTP",
        fields: [{label: "URL 模板", placeholder: "https://example.com/update?domain={host}&ip={ip}"}],
        info: "任意支持 HTTP 更新的 DDNS 服务，模板中可用 {host} {ip} {family} 占位。",
    },
];

/** 按 provider 取元信息 */
export function get_provider_meta(provider: DdnsProvider): DdnsProviderMeta | undefined {
    return DDNS_PROVIDERS.find((v) => v.provider === provider);
}

/** 把 account 字符串按逗号拆成各字段值（不足补空） */
export function split_account_fields(account: string, field_count: number): string[] {
    const parts = (account ?? "").split(",");
    const result: string[] = [];
    for (let i = 0; i < field_count; i++) {
        result.push((parts[i] ?? "").trim());
    }
    return result;
}

/** 把各字段值用逗号拼成 account 字符串 */
export function join_account_fields(values: string[]): string {
    return values.map((v) => (v ?? "").trim()).join(",");
}
