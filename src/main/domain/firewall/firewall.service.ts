import {SystemUtil} from "../sys/sys.utl";
import {SysSoftware} from "../../../common/req/setting.req";
import {settingService} from "../setting/setting.service";
import {is_linux} from "../shell/shell.service";

/**
 * 防火墙管理服务（仅 UFW）。
 *
 * UFW（Uncomplicated Firewall）是 iptables/nftables 之上的易用封装，命令简单可靠，且规则原生持久化。
 * 所有操作通过系统命令完成，命令以 filecat 进程的身份执行，权限不足会失败并抛错，不擅自 sudo 提权。
 *
 * 动作语义：
 *   放行 = ufw allow            （添加一条放行规则）
 *   删除 = ufw delete allow ...（删除对应放行规则）
 *
 * 安全：
 *   1. from（来源地址）在拼进命令前做严格 IP/CIDR 校验（支持 IPv4 / IPv6），防止 shell 命令注入；
 *   2. 采用外部软件检测（settingService.getSoftware()）统一判断 ufw 是否安装，避免与设置页检测逻辑重复。
 */

// 规则动作
export type FirewallAction = "allow" | "deny" | "limit" | "reject";
// 规则方向：in=入站（默认） out=出站
export type FirewallDirection = "in" | "out";
// 放行 / 删除规则用到的协议
export type FirewallProto = "tcp" | "udp";

// UFW 状态
export interface FirewallStatus {
    installed: boolean;   // ufw 是否安装（复用外部软件检测结果）
    active: boolean;      // ufw 是否已启用（ufw status 输出 Status: active）
    note: string;
}

export class FirewallServiceImpl {

    /** ufw 是否安装：复用外部软件检测逻辑（getSoftware），避免与设置页检测不一致 */
    private async ufw_installed(): Promise<boolean> {
        try {
            const soft_list = await settingService.getSoftware();
            const f = soft_list.find(s => s.id === SysSoftware.ufw);
            return !!f && !!f.installed;
        } catch (e) {
            return false;
        }
    }

    /** 获取 ufw 状态（仅 Linux 有意义；其它系统返回 installed=false） */
    public async get_status(): Promise<FirewallStatus> {
        if (!is_linux()) {
            return {installed: false, active: false, note: "ufw 仅在 Linux 上可用"};
        }
        return {
            installed: await this.ufw_installed(),
            active: await this.is_enabled(),
            note: "ufw（易用、规则持久化）",
        };
    }

    /**
     * 执行 ufw 写命令（非交互）。
     *
     * UFW 在部分命令（如 `enable`、`delete`，以及添加可能影响当前连接的规则时）会交互式询问
     * "Proceed with operation? (y|n)"。filecat 以 exec 非交互方式执行，无 stdin 输入会一直阻塞。
     * 故统一用 ufw 自带的 `--force` 参数跳过确认，避免卡死。
     *
     * @param subcmd ufw 子命令，如 `enable`、`delete 3`、`allow in proto tcp to any port 80`
     * @param force
     */
    private async execUfw(subcmd: string, force = false): Promise<string> {
        const cmd = force
            ? `ufw --force ${subcmd}`
            : `ufw ${subcmd}`;

        return (await SystemUtil.execAsync(cmd)).toString();
    }
    /** ufw 是否已启用：解析 `ufw status` 输出的 `Status: active`。
     * 这比 systemctl is-active 更贴合「UFW 是否启用」的语义（ufw 规则状态与 ufw.service 运行状态可能不一致）。
     */
    public async is_enabled(): Promise<boolean> {
        try {
            const out = (await SystemUtil.execAsync("ufw status")).toString();
            return /Status:\s*active/i.test(out);
        } catch (e) {
            return false;
        }
    }

    /** 校验 ufw 已安装，否则抛错 */
    public async require_ufw(): Promise<void> {
        if (process.platform !== "linux") throw "当前系统不是 Linux，无法管理防火墙";
        const installed = await this.ufw_installed();
        if (!installed) throw "ufw 未安装，请先在系统安装 ufw 防火墙软件";
    }

    /** 启用 / 停用 ufw */
    public async set_enabled(enabled: boolean): Promise<string> {
        await this.require_ufw();
        if (enabled) {
            await this.execUfw("enable", true);
        } else {
            await this.execUfw("disable");
        }
        return enabled ? "ufw 已启用" : "ufw 已停用";
    }

    /** 查看 ufw 规则列表：解析 `ufw status numbered`，返回结构化规则（编号/目标/动作/来源/备注）+ 原始文本 */
    public async get_rules(): Promise<{
        active: boolean;
        raw: string;
        rules: { number: number; to: string; action: string; from?: string; description?: string }[];
    }> {
        await this.require_ufw();
        const out = (await SystemUtil.execAsync("ufw status numbered")).toString();
        const active = /Status:\s*active/i.test(out);
        const rules: { number: number; to: string; action: string; from?: string; description?: string }[] = [];
        for (const line of out.split("\n")) {
            // 匹配如 "[ 1] 22/tcp                     ALLOW IN    Anywhere" 或带备注 "[ 9] 80/tcp ... # web"
            const m = /^\s*\[\s*(\d+)\]\s*(.*)$/.exec(line.trim());
            if (!m) continue;
            const rest = m[2].trim();
            if (!rest) continue;
            // UFW 用至少两个空格分隔 To / Action / From（From 后可带 "# comment" 备注）
            const seg = rest.split(/\s{2,}/).map(s => s.trim()).filter(s => s.length > 0);
            const to = seg[0] || "";
            const action = seg[1] || "";
            // From 与备注：seg[2] 为 From，其后（如 "# ssh"）为备注
            let from: string | undefined;
            let description: string | undefined;
            if (seg.length >= 3) {
                const fromSeg = seg[2];
                // 备注形如 "# ssh"，拆出来
                const hashIdx = fromSeg.indexOf("#");
                if (hashIdx >= 0) {
                    from = fromSeg.slice(0, hashIdx).trim() || undefined;
                    description = fromSeg.slice(hashIdx + 1).trim();
                } else {
                    from = fromSeg;
                }
                if (seg.length >= 4) {
                    description = (description ? description + " " : "") + seg.slice(3).join(" ").replace(/^#\s*/, "");
                }
            }
            if (to) {
                rules.push({number: Number(m[1]), to, action, from, description});
            }
        }
        return {active, raw: out, rules};
    }

    /**
     * 严格校验端口号（允许单端口 1-65535，或 ufw 端口范围 1000:2000）
     */
    private validate_port(port: number | string): string {
        const s = `${port}`.trim();
        if (!/^\d+$/.test(s)) {
            // 端口不可控：要么是单个数字，要么是数字:数字的范围
            if (!/^\d{1,5}:\d{1,5}$/.test(s)) throw "端口号不合法（单个 1-65535 或范围 如 1000:2000）";
            const [a, b] = s.split(":").map(Number);
            if (a < 1 || a > 65535 || b < 1 || b > 65535 || a > b) throw "端口号范围不合法";
        } else {
            const n = Number(s);
            if (n < 1 || n > 65535) throw "端口号不合法（1-65535）";
        }
        return s;
    }

    /**
     * 严格校验来源地址（可选）：仅允许 IP 或 CIDR（IPv4 / IPv6），防止 shell 命令注入。
     *  - IPv4  如 192.168.1.0、192.168.1.0/24
     *  - IPv6  如 ::1、2001:db8::1、2001:db8::/64
     *  - IPv6 zone 如 fe80::1%eth0 也允许
     */
    private validate_from(from?: string): string | null {
        if (!from || !from.trim()) return null;
        const s = from.trim();
        // 拒绝一切非 [0-9a-fA-F:.]/[.\]] 的字符（含空格、分号、$、`、|、&、括号等注入字符）
        if (/[^\w:.\%\-/\[\]]/.test(s)) throw "来源地址包含非法字符";
        // 按 / 拆分 CIDR 后缀
        const parts = s.split("/");
        if (parts.length > 2) throw "来源地址不合法（最多一个 / 表示网段）";
        const ip = parts[0];
        // 兼容 IPv6 zone（如 fe80::1%eth0）
        const base = ip.includes("%") ? ip.split("%")[0] : ip;
        const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(base);
        const isIPv6 = /^[0-9a-fA-F:]+$/.test(base) && base.includes(":");
        if (!isIPv4 && !isIPv6) throw "来源地址必须是合法 IP 或网段";
        if (isIPv4 && base.split(".").some(seg => Number(seg) > 255)) throw "IPv4 地址段超出 0-255";
        if (parts.length === 2) {
            const mask = parts[1];
            if (!/^\d{1,3}$/.test(mask)) throw "网段掩码不合法";
            const m = Number(mask);
            if (ip.includes(":") ? m > 128 : m > 32) throw "网段掩码超出范围";
        }
        return s;
    }

    /**
     * 添加一条规则（按 动作 + 方向 + 协议 + 端口 [+ 来源]）
     * @param action    allow / deny / limit / reject
     * @param direction in（入站，默认）/ out（出站）
     * @param proto     tcp / udp
     * @param port      端口号或范围（如 80 或 "10000:20000"）
     * @param from      来源地址（IP / CIDR，可选，仅入站有意义）
     *
     * 命令示例：
     *   add_rule("allow","tcp",80)                    → ufw allow in proto tcp to any port 80
     *   add_rule("allow","tcp",80,"192.168.1.0/24")   → ufw allow in proto tcp to any port 80 from 192.168.1.0/24
     *   add_rule("deny","out","udp",53)               → ufw deny out proto udp to any port 53
     *   add_rule("limit","tcp",22)                    → ufw limit in proto tcp to any port 22   （ssh 防爆破）
     */
    public async add_rule(action: FirewallAction, direction: FirewallDirection, proto: FirewallProto, port: number | string, from?: string): Promise<string> {
        await this.require_ufw();
        const p = this.validate_port(port);
        const f = this.validate_from(from);
        if (!(["allow", "deny", "limit", "reject"] as string[]).includes(action)) throw "动作不合法（allow / deny / limit / reject）";
        if (!["in", "out"].includes(direction)) direction = "in";
        if (!["tcp", "udp"].includes(proto)) throw "协议不合法（tcp / udp）";
        // limit 仅支持入站（UFW 限速语义只对入站连接有效）
        if (action === "limit" && direction === "out") throw "limit（限速）仅支持入站方向";
        // 出站方向下 from 无意义（表示出站包源，一般无需指定），忽略之
        const fromPart = direction === "in" && f ? ` from ${f}` : "";
        const cmd = `${action} ${direction} proto ${proto} to any port ${p}${fromPart}`.trim();
        await this.execUfw(cmd);
        const dirLabel = direction === "out" ? "出站" : "入站";
        const actionLabel = {allow: "放行", deny: "拒绝", limit: "限速", reject: "拒绝响应"}[action];
        const fromLabel = direction === "in" && f ? ` (from ${f})` : "";
        return `${dirLabel} ${proto}/${p}${fromLabel} 已${actionLabel}`;
    }

    /**
     * 按 ufw 编号删除一条规则（编号来自 `ufw status numbered` 的输出）
     * @param number 规则编号（正整数）
     */
    public async del_ufw_rule(number: number): Promise<string> {
        await this.require_ufw();
        if (!Number.isInteger(number) || number < 1) throw "规则编号不合法";
        const cmd = `delete ${number}`;
        try {
            await this.execUfw(cmd,true);
        } catch (e) {
            // UFW 找不到对应编号规则时会以非零退出；转成中文提示
            throw `未找到编号为 ${number} 的规则，可能已被删除，请刷新规则列表`;
        }
        return `编号 ${number} 的规则已删除`;
    }
}

export const firewallService = new FirewallServiceImpl();
