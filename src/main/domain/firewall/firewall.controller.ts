import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {Request} from "express";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {Sucess} from "../../other/Result";
import {firewallService, FirewallAction, FirewallDirection, FirewallProto} from "./firewall.service";

/**
 * 防火墙（UFW）管理接口。
 *
 * 所有接口（含页面权限）统一由 UserAuth.firewall 控制：
 * 具有该权限的用户可查看本页并调用全部接口，无权限则接口与页面均不可用。
 * 仅 Linux 系统有意义，前端菜单也在"Linux + 有权限 + ufw 已安装"下才展示。
 */
@JsonController("/firewall")
export class FirewallController {

    // 校验用户是否拥有防火墙权限
    private auth(req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.firewall);
    }

    // ufw 状态（是否安装、是否启用）
    @Get("/status")
    async status(@Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.get_status());
    }

    // 启用 / 停用 ufw
    @Post("/enable")
    async enable(@Body() body: { enabled: boolean }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.set_enabled(body.enabled));
    }

    // 查看规则列表
    @Get("/rules")
    async rules(@Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.get_rules());
    }

    // 添加（放行/拒绝/限速/拒绝响应）一条规则
    @Post("/rule/add")
    async ruleAdd(@Body() body: {
        action: FirewallAction,
        direction: FirewallDirection,
        proto: FirewallProto,
        port: number | string,
        from?: string
    }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.add_rule(body.action, body.direction, body.proto, body.port, body.from));
    }

    // 按 ufw 编号删除一条规则
    @Post("/ufw/rule/del")
    async ufwRuleDel(@Body() body: { number: number }, @Req() req: Request) {
        this.auth(req);
        return Sucess(await firewallService.del_ufw_rule(body.number));
    }
}
