import {Body, Controller, Get, JsonController, Post, Req} from "routing-controllers";
import {Sucess} from "../../other/Result";
import {NavIndexItem} from "../../../common/req/common.pojo";
import { DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";

@JsonController("/navindex")
export class NavindexController {

    @Post('/add')
    add(@Body() item: NavIndexItem,@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.net_site_tag_update);
        const list = DataUtil.get(data_common_key.navindex_key,file_key.navindex_key);
        if (Array.isArray(list)) {
            list.push(item);
            DataUtil.set(data_common_key.navindex_key, list,file_key.navindex_key);
        } else {
            DataUtil.set(data_common_key.navindex_key, [item],file_key.navindex_key);
        }
        return Sucess('ok');
    }

    @Post('/save')
    save(@Body() items: NavIndexItem[],@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.net_site_tag_update);
        DataUtil.set(data_common_key.navindex_key, items,file_key.navindex_key);
        return Sucess('ok');
    }

    @Get()
    get(@Req()req) {
        userService.check_user_auth(req.headers.authorization,UserAuth.nav_net_tag);
        let list = DataUtil.get(data_common_key.navindex_key,file_key.navindex_key);
        return Sucess(list || []);
    }
}
