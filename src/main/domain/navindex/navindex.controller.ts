import {Body, Controller, Get, JsonController, Post} from "routing-controllers";
import {Sucess} from "../../other/Result";
import {Service} from "typedi";
import {NavIndexItem} from "../../../common/req/common.pojo";
import {DataUtil} from "../data/DataUtil";

const navindex_key = "navindex_key_list";

@Service()
@JsonController("/navindex")
export class NavindexController {

    @Post('/add')
    add(@Body() item: NavIndexItem) {
        const list = DataUtil.get(navindex_key);
        if (Array.isArray(list)) {
            list.push(item);
            DataUtil.set(navindex_key, list);
        } else {
            DataUtil.set(navindex_key, [item]);
        }
        return Sucess('ok');
    }

    @Post('/save')
    save(@Body() items: NavIndexItem[]) {
        DataUtil.set(navindex_key, items);
        return Sucess('ok');
    }

    @Get()
    get() {
        let list = DataUtil.get(navindex_key);
        return Sucess(list || []);
    }
}
