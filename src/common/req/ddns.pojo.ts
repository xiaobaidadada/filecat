// 获取 IP 的来源类型
export enum ip_source_type {
    physics = "物理",   // 本机网卡
    http_get = "http_get" // 通过 HTTP 接口获取（外部网络 IP）
}

// 账号/同步状态
export enum DdnsStatus {
    unverified = "unverified", // 未验证
    ok = "ok",                 // 成功
    fail = "fail",             // 失败
}

// 支持的 DDNS 平台。每个平台的凭证格式（account）各不相同，具体见各 provider 实现。
export enum DdnsProvider {
    dnspod = "dnspod",     // DNSPod（老版 API，login_token = ID,Token）
    tengxun = "tengxun",   // 腾讯云 DNSPod（SecretId,SecretKey）
    ali = "ali",           // 阿里云解析（AccessKeyId,AccessKeySecret）
    cloudflare = "cloudflare", // Cloudflare（API Token）
    godaddy = "godaddy",   // GoDaddy（API Key,API Secret）
    namesilo = "namesilo", // NameSilo（API Key）
    namecheap = "namecheap", // Namecheap（用户名,API Key）
    vercel = "vercel",     // Vercel（API Token）
    duckdns = "duckdns",   // DuckDNS（Token）
    noip = "noip",         // No-IP（用户名,密码）
    easydns = "easydns",   // easyDNS（用户名,密码）
    freedns = "freedns",   // FreeDNS / afraid.org（更新 Token）
    dynv6 = "dynv6",       // dynv6（Token）
    oray = "oray",         // 花生壳 Oray（账号,密码）
    dyn = "dyn",           // 通用 DynDNS2 协议（用户名,密码）
    custom = "custom"      // 自定义 HTTP 更新 URL（URL 模板）
}

// 一个 IP 来源：物理网卡 / HTTP 获取，以及该来源的 IP 要同步到哪些域名
export class DdnsIPPojo {
    isIPv4: boolean;             // true=ipv4(A)，false=ipv6(AAAA)
    ifaceOrWww: string;          // 网卡名 或 IP 获取 URL（如 https://4.ipw.cn）
    ip?: string;                 // 运行时填充的当前 IP
    ddnsHost?: string;           // 要更新的域名，多个用空格分隔
    source_type?: ip_source_type;// 来源类型
    scopeid?: number;            // ipv6 网卡作用域 id
    status?: DdnsStatus;         // 上次同步状态
    message?: string;            // 上次同步信息
    time?: number;               // 上次同步时间戳（毫秒）
}

// 一个 DDNS 配置条目。左侧列表每一项即一个 DdnsConnection。
export class DdnsConnection {
    id: string = "";             // 唯一标识（uuid）
    provider: DdnsProvider = DdnsProvider.dnspod;
    account: string = "";        // 平台凭证，格式由各 provider 决定（逗号/空格分隔，见前端提示）
    isOpen: boolean = false;     // 是否开启
    note: string = "";           // 备注
    ips: DdnsIPPojo[] = [];      // 该配置要同步的 域名/IP来源 列表
    account_status: DdnsStatus = DdnsStatus.unverified; // 账号验证状态
    account_message: string = "";// 账号验证信息
    time: number = 0;            // 上次同步时间戳（毫秒）
    status: DdnsStatus = DdnsStatus.unverified; // 上次同步状态
    message: string = "";        // 上次同步信息
}
