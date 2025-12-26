import {Body, Get, JsonController, Post, Req} from "routing-controllers";
import {UserAuth, UserBaseInfo, UserData, UserLogin} from "../../../common/req/user.req";
import {AuthFail, Sucess} from "../../other/Result";
import {Cache} from "../../other/cache";
import {generateSaltyUUID} from "../../../common/StringUtil";
import {data_dir_tem_name} from "../data/data_type";
import {hash_string} from "./user.hash";
import {userService} from "./user.service";
import {getSys} from "../shell/shell.service";
import {settingService} from "../setting/setting.service";
import {Request} from "express";
import {self_auth_jscode} from "../../../common/req/customerRouter.pojo";
import {Http_controller_router} from "../../../common/req/http_controller_router";
import {Env} from "../../../common/Env";
import {HttpRequest} from "../../../common/http";

interface UserLoginData {
    username: string;
    id: string;
}

@JsonController("/user")
export class UserController {

    @Post('/login')
    async login(@Body() user: UserLogin, @Req() req: Request) {
        // 超级用户账号 会自动生成 不再读取环境变量内的 如果用户忘记密码 可以修改环境变量文件 reset_root_password 然后重启服务器 （安全需要用户保证环境变量文件不会被修改)
        // const username = DataUtil.get(data_common_key.username) as string;
        // 只用于第一次登录 或者token 过期了
        const user_data = userService.get_user_info_by_username(user.username);
        if (settingService.getSelfAuthOpen()) {
            // 开启了自定义处理鉴权功能
            const selfHandler = settingService.getHandlerClass(self_auth_jscode, data_dir_tem_name.sys_file_dir);
            if (!selfHandler) {
                return false;
            }
            // 开启了自定义处理
            try {
                const result = await selfHandler.handler(req.headers, req);
                if (result) {
                    const uuid = generateSaltyUUID(user_data.username + user_data.hash_password);
                    const cache: UserLoginData = {username: user.username, id: user_data.id};
                    Cache.setValue(`${uuid}`, cache);
                    return Sucess(uuid)
                }
            } catch (e) {
                console.log(e)
            }
            // 失败了继续正常的登录
        }

        // const password_hash = DataUtil.get(data_common_key.password_hash) as string;

        if (!!user_data && hash_string(user.password) === user_data.hash_password) {
            const uuid = generateSaltyUUID(user_data.username + user_data.hash_password);
            const cache: UserLoginData = {username: user.username, id: user_data.id};
            Cache.setValue(`${uuid}`, cache);
            return Sucess(uuid)
        }
        // if (Env.username && !password_hash) {
        //     // 环境变量只要不为空 就用环境变量文件的判断
        //     if (user.username === `${Env.username}` && user.password === `${Env.password}`) {
        //         const uuid = generateSaltyUUID(username);
        //         // Cache.setToken(`${uuid}`)
        //         Cache.setValue(`${uuid}`,cache);
        //         return Sucess(uuid)
        //     }
        // } else if (username) {
        //     // 有密码的
        //     const password = DataUtil.get(data_common_key.password);
        //     if(password_hash) {
        //         if(user.username === `${username}` && hash_string(user.password) === password_hash) {
        //             const uuid = generateSaltyUUID(username);
        //             // Cache.setToken(`${uuid}`)
        //             Cache.setValue(`${uuid}`,cache);
        //             return Sucess(uuid)
        //         }
        //     } else if(user.username === `${username}` && user.password === `${password}`) {
        //         const uuid = generateSaltyUUID(username);
        //         // Cache.setToken(`${uuid}`)
        //         Cache.setValue(`${uuid}`,cache);
        //         return Sucess(uuid)
        //     }
        // } else {
        //     if (user.username === "admin" && user.password === "admin") {
        //         const uuid = generateSaltyUUID(username);
        //         // Cache.setToken(`${uuid}`)
        //         Cache.setValue(`${uuid}`,cache);
        //         return Sucess(uuid)
        //     }
        // }
        return AuthFail('password error');
    }


    @Post('/updatePassword')
    async updatePassword(@Body() user: UserLogin, @Req() req) {
        userService.check_user_auth(req.headers.authorization, UserAuth.update_password);
        const user_data = userService.get_user_info_by_user_id(user.user_id);
        if (!user_data) {
            throw "user data not found";
        }
        // if(user.username)
        // user_data.username = user.username;
        // user_data.hash_password = hash_string(user.password);
        await userService.save_user_info(user.user_id, {
            username: user.username,
            hash_password: hash_string(user.password)
        } as UserData);
        return Sucess('ok');
    }


    // @Post('/language/save')
    // async languageSetting(@Body() req:{language:string},@Req()r) {
    //     const user_data = userService.get_user_info_by_token(r.headers.authorization);
    //     user_data.language = req.language
    //     await userService.save_user_info(user_data.id, user_data);
    //     return Sucess("1");
    // }

    start_server_time = Date.now();
    latest_version = process.env.version
    latest_count_time = Date.now();

    @Get("/userInfo/get")
    getUserInfo(@Req() req: Request) {
        const pojo = new UserBaseInfo();
        // pojo.language = DataUtil.get(this.language)??"zh";
        pojo.sys = getSys();
        const list = settingService.getSoftware();
        const map = {};
        for (const item of list) {
            map[item.id] = item;
        }
        pojo.sysSoftWare = map;
        pojo.runing_time_length = this.start_server_time;
        pojo.user_data = userService.get_user_info_by_username(Cache.getValue(req.headers.authorization).username);
        pojo.dir_user_upload_max_num = settingService.get_dir_upload_max_num();
        pojo.watch = Env.watch
        pojo.latest_version = process.env.version !== this.latest_version?this.latest_version: process.env.version;
        if(Date.now() - this.latest_count_time > 3000) {
            HttpRequest.get(`https://registry.npmjs.org/filecat`,{},5000).then((res) => {
                if(res && typeof res === "object") {
                    this.latest_version = res["dist-tags"].latest;
                }
            })
            this.latest_count_time = Date.now();
        }
        return Sucess(pojo);
    }

    // 获取所有用户
    @Get('/all_users')
    all_users(@Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.user_manage);
        return Sucess(userService.get_user_list());
    }

    // 创建用户
    @Post('/create_user')
    async create_user(@Body() user: UserData, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.user_manage);
        if (!user.cwd) throw "cwd not found";
        await userService.create_user(user)
        return Sucess("");
    }

    // 修改保存用户
    @Post('/save_user')
    async save_user(@Body() user: UserData, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.user_manage);
        if (user.password) {
            user.hash_password = hash_string(user.password);
            delete user.password;
        }
        if (!user.cwd) throw "cwd not found";
        await userService.save_user_info(user.id, user)
        return Sucess("");
    }

    // 用户样式类型
    @Post(`/${Http_controller_router.user_save_user_file_list_show_type}`)
    save_user_file_list_show_type(@Body() body: {
        type: string,
        is_file_list_type?: boolean,
        is_dir_list_type?: boolean,
        not_pre_show_image?: boolean,
        is_pagination_mode?: boolean
    }, @Req() req: Request) {
        const user_data = userService.get_user_info_by_token(req.headers.authorization);
        const user_id = userService.get_user_id(user_data.username);
        if (body.is_dir_list_type) {
            userService.only_update_user_data(user_id, {dir_show_type: body.type} as UserData);
        } else if (body.not_pre_show_image !== undefined) {
            userService.only_update_user_data(user_id, {not_pre_show_image: body.not_pre_show_image} as UserData);
        } else if (body.is_pagination_mode) {
            userService.only_update_user_data(user_id, {file_list_pagination_mode: body.type} as UserData);
        } else {
            userService.only_update_user_data(user_id, {file_list_show_type: body.type} as UserData);
        }
        return Sucess("");
    }


    // 删除用户
    @Post('/delete_user')
    delete_user(@Body() user: UserData, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.user_manage);
        userService.delete_user(user.username)
        return Sucess("");
    }


    @Get('/all_roles')
    all_roles(@Req() req: Request) {
        // 查看角色的权限还是有的
        return Sucess(userService.get_role_list());
    }

    // 已经绑定用户不允许删除
    @Post('/create_role')
    async create_role(@Body() user: UserData, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.role_manage);
        await userService.create_role(user);
        return Sucess("1");
    }

    @Post('/delete_role')
    delete_role(@Body() body: { role_id: string }, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.role_manage);
        userService.delete_role(body.role_id)
        return Sucess("1");
    }

    @Post('/save_role')
    async save_role(@Body() user: UserData, @Req() req: Request) {
        userService.check_user_auth(req.headers.authorization, UserAuth.role_manage);
        await userService.update_role(user)
        return Sucess("");
    }

}

export const userController = new UserController();
