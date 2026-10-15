import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {ddnsService, DEFAULT_SYNC_INTERVAL} from "./ddns.service";
import {DdnsConnection, DdnsIPPojo} from "../../../common/req/ddns.pojo";
import {DataUtil} from "../data/DataUtil";
import {Fail, Sucess} from "../../other/Result";
import {deleteList} from "../../../common/ListUtil";
import {data_common_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";

@JsonController("/ddns")
export class DdnsController {

    /** 获取全部 DDNS 配置 */
    @Get("/list")
    async list(@Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess(ddnsService.get_list());
    }

    /** 获取同步间隔（秒） */
    @Get("/interval")
    async interval(@Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess({interval: ddnsService.get_interval(), default_interval: DEFAULT_SYNC_INTERVAL});
    }

    /** 设置同步间隔（秒） */
    @Post("/interval")
    async set_interval(@Body() data: { interval: number }, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        const v = Number(data.interval);
        if (!v || v < 10) {
            return Fail("间隔不能小于 10 秒");
        }
        ddnsService.set_interval(v);
        return Sucess({interval: ddnsService.get_interval()});
    }

    /** 获取当前可用的 IP 来源（网卡 + HTTP），并把已绑定域名回填 */
    @Get("/ip_options")
    async ip_options(@Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess(await ddnsService.get_ip_options());
    }

    /** 立即同步一次，返回同步后的完整列表 */
    @Post("/sync_now")
    async sync_now(@Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        const r = await ddnsService.sync_now();
        return Sucess(r.list);
    }

    /** 验证某个配置的账号 */
    @Post("/verify")
    async verify(@Body() data: { id: string }, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess(await ddnsService.verify(data.id));
    }

    /** 保存一个 DDNS 配置（新增/更新），保存时会验证账号 */
    @Post("/save")
    async save(@Body() data: DdnsConnection, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        if (!data.provider) {
            return Fail("请选择平台");
        }
        if (!data.account || !data.account.trim()) {
            return Fail("请填写账号凭证");
        }
        const list = await ddnsService.save(data);
        return Sucess(list);
    }

    /** 删除一个 DDNS 配置 */
    @Post("/del")
    async del(@Body() data: { id: string }, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess(ddnsService.del(data.id));
    }

    /** 添加一个 HTTP IP 来源 */
    @Post('/http/add')
    add_http(@Body() item: DdnsIPPojo, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        const list: DdnsIPPojo[] = DataUtil.get(data_common_key.ddns_http_url_key) ?? [];
        if (list.find(value => value.ifaceOrWww === item.ifaceOrWww)) {
            return Fail("已经存在");
        }
        list.push(item);
        DataUtil.set(data_common_key.ddns_http_url_key, list);
        return Sucess('ok');
    }

    /** 删除一个 HTTP IP 来源 */
    @Post('/http/del')
    del_http(@Body() item: DdnsIPPojo, @Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        const list: DdnsIPPojo[] = DataUtil.get(data_common_key.ddns_http_url_key) ?? [];
        deleteList(list, (v) => v.ifaceOrWww === item.ifaceOrWww);
        DataUtil.set(data_common_key.ddns_http_url_key, list);
        return Sucess('ok');
    }

    /** 获取已配置的 HTTP IP 来源列表 */
    @Get('/http/list')
    http_list(@Req() req) {
        userService.have_user_auth(req.headers.authorization, UserAuth.ddns);
        return Sucess(DataUtil.get(data_common_key.ddns_http_url_key) ?? []);
    }
}
