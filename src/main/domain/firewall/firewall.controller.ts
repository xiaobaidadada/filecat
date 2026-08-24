import {Body, Controller, Get, JsonController, Post, QueryParam, Req} from "routing-controllers";
import {Request} from "express";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Sucess} from "../../other/Result";
import {firewallService, FirewallBackend} from "./firewall.service";

/**
 * 防火墙管理接口。
 *
 * 所有接口（含页面权限）统一由 UserAuth.firewall 控制：
 * 具有该权限的用户可查看本页并调用全部接口，无权限则接口与页面均不可用。
 * 仅 Linux 系统有意义，前端菜单也在 Linux 下才展示。
 */
@JsonController("/firewall")
export class FirewallController {

    // 校验用户是否拥有防火墙权限（自动抛错则返回 no permission）
    private auth(req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.firewall);
    }

    // 防火墙整体状态（ufw / nft 是否安装、是否启用）
    @Get("/status")
    async status(@Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.get_status());
    }

    // 启用 / 停用防火墙
    @Post("/enable")
    async enable(@Body() body: { backend: FirewallBackend, enabled: boolean }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.set_enabled(body.backend, body.enabled));
    }

    // 查看规则列表
    @Get("/rules")
    async rules(@QueryParam('backend') backend: FirewallBackend, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.get_rules(backend));
    }

    // 查看 ufw 结构化规则列表（供前端列表化展示 + 按编号删除）
    @Get("/ufw/rules")
    async ufwRules(@Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.get_ufw_rules());
    }

    // 按 ufw 编号删除一条规则
    @Post("/ufw/rule/del")
    async ufwRuleDel(@Body() body: { number: number }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.del_ufw_rule(body.number));
    }

    // 放行（添加）端口规则
    @Post("/rule/add")
    async ruleAdd(@Body() body: {
        backend: FirewallBackend,
        action: "allow" | "deny" | "reject" | "limit",
        direction: "in" | "out",
        proto: "tcp" | "udp" | "both",
        port: string,
        from?: string
    }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.add_rule(body.backend, body.action, body.direction, body.proto, body.port, body.from));
    }
}
