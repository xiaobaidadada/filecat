import {SystemUtil} from "../sys/sys.utl";
import {settingService} from "../setting/setting.service";
import {SysSoftware} from "../../../common/req/setting.req";

/**
 * 防火墙管理服务。
 *
 * 支持两种后端：ufw（前端封装，命令简单可靠、原生持久化）与 nftables（nft 命令）。
 * 所有操作通过系统命令完成，执行前先检测对应后端是否安装；命令以 filecat 运行进程的用户身份执行，
 * 若权限不足会执行失败并抛错，不擅自 sudo 提权。
 *
 * 「切换管理模式」是指前端选用哪个后端来管理防火墙（ufw / nft），
 * 而非改动系统底层引擎（任何后端都只是防火墙规则的管理入口）。
 */

// 防火墙后端标识
export type FirewallBackend = SysSoftware.ufw | SysSoftware.nftables;

// 后端状态
export interface FirewallBackendStatus {
    id: FirewallBackend;
    installed: boolean;   // 是否安装（外部软件检测逻辑一致：commandIsExist）
    active: boolean;      // 对应服务是否已启用
    note: string;         // 简单说明
}

export class FirewallServiceImpl {

    /** 当前系统是否为 Linux（防火墙仅在 Linux 上可用）*/
    private is_linux(): boolean {
        return process.platform === "linux";
    }

    /** 检测某个后端命令是否安装 */
    private async backend_installed(backend: FirewallBackend) {
        const soft_list = await settingService.getSoftware();
        const f = soft_list.find(f => f.id === backend);
        return f && f.installed;
    }

    /** 检测后端对应服务是否启用 */
    private async backend_active(backend: FirewallBackend) {
        const soft_list = await settingService.getSoftware();
        const f = soft_list.find(f => f.id === backend);
        return f && f.active;
    }

    /**
     * 获取防火墙整体状态（仅 Linux 有意义，其它系统返回空列表）
     */
    public async get_status(): Promise<FirewallBackendStatus[]> {
        if (!this.is_linux()) return [];
        const list: FirewallBackendStatus[] = [];
        for (const id of ["ufw", "nft"] as FirewallBackend[]) {
            list.push({
                id,
                installed: await this.backend_installed(id),
                active: await this.backend_active(id),
                note: id === "ufw" ? "ufw（易用，规则持久化）" : "nftables（nft 命令）",
            });
        }
        return list;
    }

    /**
     * 校验后端是否已安装，否则抛错（供所有需要真实操作的接口调用）
     */
    public async require_backend(backend: FirewallBackend) {
        if (!this.is_linux()) throw "当前系统不是 Linux，无法管理防火墙";
        if (!await this.backend_installed(backend)) {
            throw `${backend === 'ufw' ? 'ufw' : 'nftables'} 未安装，请先在系统安装对应防火墙软件`;
        }
    }

    /**
     * 启用 / 停用系统防火墙（ufw 用 enable/disable；nftables 用 systemctl start/stop）
     */
    public async set_enabled(backend: FirewallBackend, enabled: boolean): Promise<string> {
        await this.require_backend(backend);
        if (backend === "ufw") {
            await SystemUtil.execAsync(enabled ? "ufw enable" : "ufw disable");
            return enabled ? "ufw 已启用" : "ufw 已停用";
        }
        const act = enabled ? "enable" : "disable";
        await SystemUtil.execAsync(`systemctl ${act} nftables`);
        return enabled ? "nftables 已启用" : "nftables 已停用";
    }

    /**
     * 查看某一后端的规则列表
     *  ufw：`ufw status numbered`   ；nft：`nft list ruleset`
     */
    public async get_rules(backend: FirewallBackend): Promise<string> {
        await this.require_backend(backend);
        if (backend === "ufw") {
            return (await SystemUtil.execAsync("ufw status numbered")).toString();
        }
        return (await SystemUtil.execAsync("nft list ruleset")).toString();
    }

    /**
     * 解析 ufw status numbered 输出，返回结构化规则列表（供前端列表化展示与按编号删除）
     * 每条规则含：number(ufw 编号)、to、action、from、description（# 后的备注）
     */
    public async get_ufw_rules(): Promise<{number: number, to: string, action: string, from: string, description: string}[]> {
        await this.require_backend(SysSoftware.ufw);
        const raw = (await SystemUtil.execAsync("ufw status numbered")).toString();
        const lines = raw.split(/\r?\n/);
        const list: {number: number, to: string, action: string, from: string, description: string}[] = [];
        const re = /^\s*\[\s*(\d+)\]\s+(.*)$/;
        for (const line of lines) {
            const m = line.match(re);
            if (!m) continue;
            let description = "";
            let body = m[2].trim();
            // 截取 # 后的备注
            const hashIdx = body.indexOf("#");
            if (hashIdx >= 0) {
                description = body.slice(hashIdx + 1).trim();
                body = body.slice(0, hashIdx).trim();
            }
            // ufw numbered 的列之间用多个空格分隔：To  | Action(如 ALLOW IN)  | From
            const parts = body.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
            list.push({
                number: parseInt(m[1], 10),
                to: parts[0] || "",
                action: parts[1] || "",
                from: parts[2] || "",
                description,
            });
        }
        return list;
    }

    /**
     * 按 ufw 编号删除一条规则（ufw delete <number>）
     * 用 `yes |` 喂入确认应答，避免 ufw 交互提示导致 execAsync 无标准输入而卡死；
     * 按编号删除只会删掉对应编号的那一条规则，不会误删其它规则。
     */
    public async del_ufw_rule(number: number): Promise<string> {
        await this.require_backend(SysSoftware.ufw);
        // 严格校验：只接受正整数编号，防止异常值进入命令
        if (!Number.isInteger(number) || number < 1) {
            throw "规则编号不合法";
        }
        await SystemUtil.execAsync(`yes | ufw delete ${number}`);
        return `规则 ${number} 已删除`;
    }

    /**
     * 添加（或删除）一条 ufw 端口规则，支持 ufw 的完整能力：
     *  - action：allow（放行）/ deny（拒绝）/ reject（拒绝并回应）/ limit（限速）
     *  - direction：in（入站，默认）/ out（出站）
     *  - proto：tcp / udp / both（两者，即不指定协议）
     *  - port：单端口 "80" 或端口范围 "1000:2000"
     *  - from：来源地址（IP / 网段，可选，空表示任意）
     *
     * 生成的正规 ufw 命令示例：
     *   ufw allow proto tcp to any port 80
     *   ufw deny out proto udp to any port 1000:2000 from 192.168.1.0/24
     *   ufw limit proto tcp to any port 22
     *   ufw reject proto udp to any port 53
     */
    public async add_rule(
        backend: FirewallBackend,
        action: "allow" | "deny" | "reject" | "limit",
        direction: "in" | "out",
        proto: "tcp" | "udp" | "both",
        port: string,
        from?: string,
    ): Promise<string> {
        await this.require_backend(backend);
        // 校验端口：单端口 1-65535 或范围 "起:止"（起<止，均在 1-65535）
        const trimmed = `${port}`.trim();
        if (!/^\d+(:\d+)?$/.test(trimmed)) {
            throw "端口号不合法：支持单端口（如 80）或范围（如 1000:2000）";
        }
        const nums = trimmed.split(":");
        for (const n of nums) {
            if (+n < 1 || +n > 65535) throw "端口号不合法（1-65535）";
        }
        if (nums.length === 2 && +nums[0] >= +nums[1]) throw "端口范围不合法（起始端口需小于结束端口）";

        if (backend === "ufw") {
            // 拼接：action + direction（in 省略）+ proto（both 省略）+ port + from
            const dirPart = direction === "out" ? "out " : "";
            const protoPart = proto === "both" ? "" : `proto ${proto} `;
            const fromPart = from && from.trim() ? ` from ${from.trim()}` : "";
            const cmd = `ufw ${action} ${dirPart}${protoPart}to any port ${trimmed}${fromPart}`.replace(/\s{2,}/g, " ").trim();
            await SystemUtil.execAsync(`yes | ${cmd}`);
            const actionText = {allow: "放行", deny: "拒绝", reject: "拒绝回应", limit: "限速"}[action];
            return `${actionText} 规则已添加`;
        }

        // nft：在 input 链的 ACCEPT 规则之前插入一条规则（仅对任意来源、tcp/udp 生效）
        // 注：nft 规则不自动持久化，跨重启不清空；持久化需写 /etc/nftables.conf，为避免破坏系统不自动处理。
        //     nft 仅支持 allow/deny 语义（accept/drop），reject/limit 需要额外 nft 语句，这里按 accept/drop 简化处理。
        const verdict = action === "deny" ? "drop" : "accept";
        const chain = direction === "out" ? "inet filter output" : "inet filter input";
        if (proto === "both") {
            // tcp、udp 分别插入一条
            const portSpec = trimmed.includes(":") ? trimmed.replace(":", "-") : trimmed;
            for (const p of ["tcp", "udp"] as const) {
                await SystemUtil.execAsync(
                    `nft insert rule ${chain} ip protocol ${p} ${p === 'tcp' ? 'tcp dport' : 'udp dport'} ${portSpec} ${verdict}`
                );
            }
        } else {
            const portSpec = trimmed.includes(":") ? trimmed.replace(":", "-") : trimmed;
            await SystemUtil.execAsync(
                `nft insert rule ${chain} ip protocol ${proto} ${proto === 'tcp' ? 'tcp dport' : 'udp dport'} ${portSpec} ${verdict}`
            );
        }
        const actionText = {allow: "放行", deny: "拒绝", reject: "拒绝回应", limit: "限速"}[action];
        return `${actionText} 规则已添加（nft，仅运行时生效）`;
    }
}

export const firewallService = new FirewallServiceImpl();
