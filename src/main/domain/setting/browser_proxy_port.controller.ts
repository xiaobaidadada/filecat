/**
 * 网页代理（WebVPN）端口模式的管理接口。
 *
 * 提供「代理目标 → 独立端口」映射的增删查与备注修改。
 * 权限统一使用 UserAuth.browser_proxy。
 */
import {Body, Get, JsonController, Post, Req} from 'routing-controllers';
import {UserAuth} from '../../../common/req/user.req';
import {Fail, Sucess} from '../../other/Result';
import {Http_controller_router} from '../../../common/req/http_controller_router';
import {userService} from '../user/user.service';
import {browserProxyPortService} from '../setting/browser_proxy_port.service';

@JsonController('/browser_proxy_port')
export class BrowserProxyPortController {

    // 列出所有端口映射
    @Get(`/${Http_controller_router.browser_proxy_port_list}`)
    list(@Req() ctx) {
        userService.have_user_auth(ctx.headers.authorization, UserAuth.browser_proxy);
        return Sucess(browserProxyPortService.list());
    }

    // 添加代理目标（自动分配端口）
    @Post(`/${Http_controller_router.browser_proxy_port_add}`)
    async add(@Body() req: { address: string; note?: string }, @Req() ctx) {
        userService.have_user_auth(ctx.headers.authorization, UserAuth.browser_proxy_edit);
        try {
            const item = await browserProxyPortService.add({
                address: req.address,
                note: req.note,
            });
            return Sucess(item);
        } catch (e: any) {
            return Fail(e?.message ?? String(e));
        }
    }

    // 删除代理目标（释放端口）
    @Post(`/${Http_controller_router.browser_proxy_port_remove}`)
    remove(@Body() req: { id: string }, @Req() ctx) {
        userService.have_user_auth(ctx.headers.authorization, UserAuth.browser_proxy_edit);
        const ok = browserProxyPortService.remove(req?.id);
        return ok ? Sucess('1') : Fail('记录不存在');
    }

    // 修改代理目标（备注 + 目标地址）
    @Post(`/${Http_controller_router.browser_proxy_port_update}`)
    async update(@Body() req: { id: string; address?: string; note?: string }, @Req() ctx) {
        userService.have_user_auth(ctx.headers.authorization, UserAuth.browser_proxy_edit);
        try {
            const item = await browserProxyPortService.update(req?.id, {
                address: req.address,
                note: req.note,
            });
            return item ? Sucess(item) : Fail('记录不存在');
        } catch (e: any) {
            return Fail(e?.message ?? String(e));
        }
    }

    // 启用 / 禁用代理目标（禁用后停止监听对应端口）
    @Post(`/${Http_controller_router.browser_proxy_port_set_enabled}`)
    async set_enabled(@Body() req: { id: string; enabled: boolean }, @Req() ctx) {
        userService.have_user_auth(ctx.headers.authorization, UserAuth.browser_proxy_edit);
        const item = await browserProxyPortService.set_enabled(req?.id, !!req?.enabled);
        return item ? Sucess(item) : Fail('记录不存在');
    }
}
