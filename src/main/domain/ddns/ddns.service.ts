import {DdnsConnection, DdnsIPPojo, DdnsStatus, ip_source_type} from "../../../common/req/ddns.pojo";
import {HttpRequest} from "../../../common/node/http";
import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {get_updater} from "./providers";
import * as os from "os";
import * as crypto from "crypto";

// IP 缓存有效期：30 秒内的多次查询直接复用，避免频繁请求外部接口
const IP_CACHE_TTL = 30 * 1000;
// 默认同步间隔（秒）
export const DEFAULT_SYNC_INTERVAL = 60;

/**
 * IP 来源唯一标识：网卡名/URL + scopeid + 地址族。
 * 加上地址族是为了区分同一网卡上的 IPv4 与 IPv6，避免绑定互相覆盖。
 */
function source_id(v: DdnsIPPojo): string {
    return `${v.ifaceOrWww}#${v.scopeid ?? ""}#${v.isIPv4 ? "4" : "6"}`;
}

/**
 * DDNS 服务：统一管理所有平台的配置与定时同步。
 *
 * 数据模型：ddns_list 存一个 DdnsConnection[]，每一项即左侧列表一个配置。
 * 同步流程：采集本机/HTTP 来源 IP → 遍历所有开启的配置 →
 * 逐条把目标域名更新为对应 IP（按 A / AAAA 区分记录类型）。
 */
export class DdnsService {
    // IP 采集缓存（跨配置共享，避免重复请求）
    private ip_cache: DdnsIPPojo[] = [];
    private ip_cache_time = 0;
    // 单一全局定时器：只要还有开启的配置就保持运行
    private timer: NodeJS.Timeout | undefined;
    // 当前定时器使用的间隔（秒），用于判断是否需要重启定时器
    private current_interval = 0;

    // ===================== 数据读写 =====================

    /** 读取全部 DDNS 配置 */
    get_list(): DdnsConnection[] {
        return DataUtil.get<DdnsConnection[]>(data_common_key.ddns_list) ?? [];
    }

    /** 覆盖写入全部 DDNS 配置 */
    private set_list(list: DdnsConnection[]) {
        DataUtil.set(data_common_key.ddns_list, list);
    }

    /** 获取同步间隔（秒），最小 10 秒防止被平台封禁 */
    get_interval(): number {
        const v = Number(DataUtil.get(data_common_key.ddns_sync_interval));
        if (!v || v < 10) return DEFAULT_SYNC_INTERVAL;
        return Math.floor(v);
    }

    /** 设置同步间隔（秒） */
    set_interval(seconds: number) {
        DataUtil.set(data_common_key.ddns_sync_interval, Math.max(10, Math.floor(seconds)));
        // 间隔变了要重启定时器；先停掉，再由 refresh_task_state 按新间隔启动
        this.stop_task();
        this.refresh_task_state();
    }

    // ===================== IP 采集 =====================

    /**
     * 获取当前所有 IP 来源及其最新 IP。
     * 30 秒内复用缓存；force 为 true 时强制重新采集。
     * @param force 强制刷新缓存
     */
    async get_now_ips(force = false): Promise<DdnsIPPojo[]> {
        const now = Date.now();
        if (!force && this.ip_cache.length > 0 && now - this.ip_cache_time < IP_CACHE_TTL) {
            return this.ip_cache;
        }
        // 网卡 IP
        const list: DdnsIPPojo[] = [];
        const ifaces = os.networkInterfaces();
        for (const key of Object.keys(ifaces)) {
            const value = ifaces[key];
            for (const item of Array.isArray(value) ? value : [value]) {
                if (!item) continue;
                const pojo = new DdnsIPPojo();
                pojo.ifaceOrWww = key;
                pojo.ip = item.address;
                pojo.scopeid = item.scopeid;
                pojo.source_type = ip_source_type.physics;
                if (item.family === "IPv4") {
                    pojo.isIPv4 = true;
                } else if (item.family === "IPv6") {
                    pojo.isIPv4 = false;
                } else {
                    continue; // 忽略非 IP 的地址族
                }
                list.push(pojo);
            }
        }
        // HTTP 来源：并发请求各自 URL 拿到公网 IP
        const url_list: DdnsIPPojo[] = DataUtil.get(data_common_key.ddns_http_url_key) ?? [];
        const http_results = await Promise.all(url_list.map(async (pojo) => {
            try {
                const text = await HttpRequest.get(pojo.ifaceOrWww, undefined, 8000);
                if (typeof text === "string") {
                    // 复制一份，避免污染持久化数据里的原对象
                    return {...pojo, ip: text.trim()};
                }
            } catch (e) {
                console.error(`[ddns] 获取 HTTP IP 失败: ${pojo.ifaceOrWww}`, e?.message ?? e);
            }
            return null;
        }));
        for (const item of http_results) {
            if (item) list.push(item);
        }
        this.ip_cache = list;
        this.ip_cache_time = now;
        return list;
    }

    // ===================== 定时任务 =====================

    /** 启动定时同步任务（已启动则忽略） */
    start_task() {
        if (this.timer) return;
        const seconds = this.get_interval();
        this.current_interval = seconds;
        this.timer = setInterval(() => {
            this.run_once().catch((e) => {
                console.error("[ddns] 定时同步异常", e?.message ?? e);
            });
        }, seconds * 1000);
    }

    /** 关闭定时同步任务 */
    stop_task() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
            this.current_interval = 0;
        }
    }

    /**
     * 判断是否还有开启的配置，没有就停掉定时器，
     * 有就确保定时器在跑（避免「全关掉定时器后又开了配置但没人启动」）。
     */
    refresh_task_state() {
        if (this.get_list().some((v) => v.isOpen)) {
            // 间隔变了也要重启定时器
            if (this.timer && this.current_interval !== this.get_interval()) {
                this.stop_task();
            }
            this.start_task();
        } else {
            this.stop_task();
        }
    }

    // ===================== 同步逻辑 =====================

    /**
     * 执行一次全量同步：
     * 遍历所有开启的配置，把变更过的 IP 写入对应域名，并记录时间与状态。
     * @returns 本次处理的配置数量
     */
    async run_once(): Promise<number> {
        const list = this.get_list();
        const open_list = list.filter((v) => v.isOpen);
        if (open_list.length === 0) {
            this.stop_task();
            return 0;
        }
        const net_list = await this.get_now_ips();
        // 当前 IP 按「来源标识」建立索引，来源标识 = 网卡名/URL + scopeid + 地址族
        const net_map = new Map<string, DdnsIPPojo>();
        for (const item of net_list) {
            net_map.set(source_id(item), item);
        }
        const now = Date.now();
        for (const conn of list) {
            if (!conn.isOpen) continue;
            const updater = get_updater(conn.provider);
            if (!updater) {
                conn.status = DdnsStatus.fail;
                conn.message = `未知平台: ${conn.provider}`;
                conn.time = now;
                continue;
            }
            const messages: string[] = [];
            let conn_ok = true;
            for (const ip_item of conn.ips ?? []) {
                const now_ip = net_map.get(source_id(ip_item));
                if (!now_ip) {
                    ip_item.status = DdnsStatus.fail;
                    ip_item.message = "未找到对应的 IP 来源";
                    ip_item.time = now;
                    continue;
                }
                const family = ip_item.isIPv4 ? "A" : "AAAA";
                const hosts = (ip_item.ddnsHost ?? "").split(/[\s,]+/).filter((v) => v);
                if (hosts.length === 0) {
                    ip_item.status = DdnsStatus.fail;
                    ip_item.message = "未配置域名";
                    ip_item.time = now;
                    continue;
                }
                let item_ok = true;
                const item_messages: string[] = [];
                for (const host of hosts) {
                    try {
                        const ok = await updater.update(conn.account, host, now_ip.ip ?? "", family);
                        if (ok) {
                            item_messages.push(`${host} → ${now_ip.ip}`);
                        } else {
                            item_ok = false;
                            item_messages.push(`${host} 更新失败`);
                        }
                    } catch (e) {
                        item_ok = false;
                        item_messages.push(`${host} 异常: ${e?.message ?? e}`);
                    }
                }
                ip_item.ip = now_ip.ip;
                ip_item.status = item_ok ? DdnsStatus.ok : DdnsStatus.fail;
                ip_item.message = item_messages.join("; ").slice(0, 500);
                ip_item.time = now;
                if (!item_ok) {
                    conn_ok = false;
                    messages.push(...item_messages.filter((v) => v.includes("失败") || v.includes("异常")));
                }
            }
            conn.status = conn_ok ? DdnsStatus.ok : DdnsStatus.fail;
            conn.time = now;
            conn.message = conn_ok ? "同步成功" : messages.join("; ").slice(0, 500) || "同步失败";
            // 同步失败时顺带做一次账号验证，帮助用户区分是凭证问题还是域名问题
            if (!conn_ok) {
                const {host} = this.first_host(conn);
                const vr = await updater.verify(conn.account, host);
                conn.account_status = vr.ok ? DdnsStatus.ok : DdnsStatus.fail;
                conn.account_message = vr.message;
            }
        }
        this.set_list(list);
        return open_list.length;
    }

    /** 立即同步一次（供前端「立即同步」按钮调用） */
    async sync_now(): Promise<{ count: number, list: DdnsConnection[] }> {
        this.ip_cache_time = 0; // 强制刷新 IP
        const count = await this.run_once();
        return {count, list: this.get_list()};
    }

    /** 取配置里第一个绑定的域名及其地址族，用于老式协议探测验证 */
    private first_host(conn: DdnsConnection): { host: string, family: "A" | "AAAA" } {
        for (const item of conn.ips ?? []) {
            const host = (item.ddnsHost ?? "").split(/[\s,]+/).filter((v) => v)[0];
            if (host) return {host, family: item.isIPv4 ? "A" : "AAAA"};
        }
        return {host: "", family: "A"};
    }

    // ===================== 接口用 =====================

    /**
     * 保存一个配置（新增或更新）。
     * 保存时对账号凭证做一次验证；任一字段变化都会重新验证。
     * @returns 处理后的完整列表
     */
    async save(conn: DdnsConnection): Promise<DdnsConnection[]> {
        if (!conn.id) {
            conn.id = crypto.randomUUID();
        }
        const list = this.get_list();
        const index = list.findIndex((v) => v.id === conn.id);
        // 判断是否需要重新验证账号：新增、账号或平台变了
        const old = index >= 0 ? list[index] : undefined;
        const need_verify = !old || old.account !== conn.account || old.provider !== conn.provider;
        if (need_verify) {
            const updater = get_updater(conn.provider);
            if (updater) {
                const {host} = this.first_host(conn);
                try {
                    const vr = await updater.verify(conn.account, host);
                    conn.account_status = vr.ok ? DdnsStatus.ok : DdnsStatus.fail;
                    conn.account_message = vr.message;
                } catch (e) {
                    conn.account_status = DdnsStatus.fail;
                    conn.account_message = e?.message ?? "验证异常";
                }
            }
        }
        if (index >= 0) {
            list[index] = conn;
        } else {
            list.push(conn);
        }
        this.set_list(list);
        this.refresh_task_state();
        return list;
    }

    /** 删除一个配置 */
    del(id: string): DdnsConnection[] {
        const list = this.get_list().filter((v) => v.id !== id);
        this.set_list(list);
        this.refresh_task_state();
        return list;
    }

    /** 单独验证某个配置的账号 */
    async verify(id: string): Promise<DdnsConnection[]> {
        const list = this.get_list();
        const conn = list.find((v) => v.id === id);
        if (conn) {
            const updater = get_updater(conn.provider);
            if (updater) {
                const {host} = this.first_host(conn);
                try {
                    const vr = await updater.verify(conn.account, host);
                    conn.account_status = vr.ok ? DdnsStatus.ok : DdnsStatus.fail;
                    conn.account_message = vr.message;
                } catch (e) {
                    conn.account_status = DdnsStatus.fail;
                    conn.account_message = e?.message ?? "验证异常";
                }
            }
            this.set_list(list);
        }
        return list;
    }

    /**
     * 获取用于前端展示的 IP 列表：把所有配置里的域名回填到当前实际 IP 上，
     * 并补充仍未配置过域名的新网卡/IP 来源，方便用户勾选绑定域名。
     */
    async get_ip_options(): Promise<DdnsIPPojo[]> {
        const now_list = await this.get_now_ips(true);
        // 把已配置的域名按来源聚合
        const host_map = new Map<string, string>();
        for (const conn of this.get_list()) {
            for (const item of conn.ips ?? []) {
                if (!item.ddnsHost) continue;
                host_map.set(source_id(item), item.ddnsHost);
            }
        }
        return now_list.map((v) => {
            const copy = {...v};
            const host = host_map.get(source_id(v));
            if (host) copy.ddnsHost = host;
            return copy;
        });
    }
}

export const ddnsService = new DdnsService();

// 进程启动时恢复定时任务（仅当存在开启中的配置才真正启动定时器）
ddnsService.refresh_task_state();
