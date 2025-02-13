import {UserAuth, UserData} from "../../../common/req/user.req";
import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {Env} from "../../../common/Env";
import {have_empty_char, removeTrailingPath} from "../../../common/StringUtil";
import {hash_string} from "./user.hash";
import path from "path";
import fs from "fs";
import {Cache} from "../../other/cache";
import {deleteList} from "../../../common/ListUtil";

const root_id = "1";

export class UserService {

    // 创建一个新的不重复的全局唯一id
    public create_unique_user_id(): any {
        let v = DataUtil.get(data_common_key.user_unique_id_num);
        if (v === null || v === undefined) {
            v = "2";
            DataUtil.set(data_common_key.user_unique_id_num, v);
        } else {
            v = JSON.parse(`${v}`);
            // @ts-ignore
            v++;
        }
        DataUtil.set(data_common_key.user_unique_id_num, `${v}`);
        return `${v}`;
    }

    public create_unique_reole_id(): any {
        let v = DataUtil.get(data_common_key.role_unique_id_num);
        if (v === null || v === undefined) {
            v = root_id;
            DataUtil.set(data_common_key.role_unique_id_num, v);
        } else {
            v = JSON.parse(`${v}`);
            // @ts-ignore
            v++;
        }
        DataUtil.set(data_common_key.role_unique_id_num, `${v}`);
        return `${v}`;
    }

    public get_user_id(username: string): string {
        const root_username = this.get_root_name();
        if (username === root_username) {
            // root 账号 使用 -1
            return root_id;
        }
        let mapping = DataUtil.get(data_common_key.user_id_name_mapping);
        if (!mapping) {
            mapping = {}
            DataUtil.set(data_common_key.user_id_name_mapping, mapping);
        }
        return mapping[username];
    }

    // 也可以是修改
    public bind_user_id(username: string, id: string): any {
        const root_username = this.get_root_name();
        if (username === root_username) {
            // root 账号 不能绑定别的id
            return;
        }
        let mapping = DataUtil.get(data_common_key.user_id_name_mapping);
        if (!mapping) {
            mapping = {}
        }
        mapping[username] = id;
        DataUtil.set(data_common_key.user_id_name_mapping, mapping);
    }

    public unbind_user_id(username: string): any {
        const root_username = this.get_root_name();
        if (username === root_username) {
            // root 账号 不能绑定别的id
            return;
        }
        let mapping = DataUtil.get(data_common_key.user_id_name_mapping);
        if (!mapping) {
            mapping = {}
        }
        // 删除相同id别的名字 之前的名字
        delete mapping[username];
        DataUtil.set(data_common_key.user_id_name_mapping, mapping);
    }

    public get_user_info_by_username(username: string): UserData {
        const id = this.get_user_id(username);
        if (id === null || id === undefined) {
            throw "User id not found";
        }
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
            DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
        }
        return mapping[id] as UserData;
    }

    public get_user_info_by_token(token: string) {
        return this.get_user_info_by_username(Cache.getValue(token).username)
    }

    public get_user_info_by_user_id(id: string): UserData {
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
            DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
        }
        return mapping[id] as UserData;
    }

    /**
     * 更新用户信息( 不存在就报错)
     * @param id
     * @param data
     */
    public save_user_info(id: string, data: UserData) {
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
        }
        this.check_data_path(data);
        if (!mapping[id]) {
            throw "User id not found";
        }
        if (mapping[id].username !== data.username) {
            // 超级管理员不需要 自动兼容
            this.unbind_user_id(mapping[id].username);
            // 新名字绑定
            this.bind_user_id(data.username, id)
        }
        const is_root = mapping[id].is_root;
        mapping[id] = {...mapping[id], ...data};
        // 角色作用
        if(!is_root)
            this.update_user_role_data(mapping[id]);
        // 文件夹路径 重新校验
        mapping[id] = this.user_data_reset_check(mapping[id]);
        DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
        this.load_user_cmd_path(id); // 权限更新
    }

    // 重新设置用户路径数据
    private user_data_reset_check(user_data:UserData) {
        const list = []
        let update_now_index = false;
        for (let v of user_data.folder_items ?? []) {
            if(this.check_user_path_by_user_id(user_data.id,v.path,false)) {
                // 合法的重新加入
                list.push(v);
            } else if(v.default) {
                update_now_index = true;
            }
        }
        if(update_now_index) // 默认的已经被修改
            user_data.folder_item_now = 0;
        return user_data;
    }

    /**
     * 创建用户 同时生成  id
     * @param data
     */
    public create_user(data: UserData) {
        if (have_empty_char(data.username) || have_empty_char(data.password)) {
            throw " not empty char";
        }
        if(data.password) {
            data.hash_password = hash_string(data.password);
            delete data.password;
        }
        this.check_data_path(data);
        let id = this.get_user_id(data.username);
        const rootName = this.get_root_name();
        if (!!id || rootName === data.username) {
            // root 账号判断
            throw 'user already exists';
        }
        id = this.create_unique_user_id();
        data.id = id;
        this.bind_user_id(data.username, id);
        // 创建
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
        }
        mapping[id] = data;
        // 角色作用
        this.update_user_role_data(data);
        DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
        this.load_user_cmd_path(id); // 权限更新
    }

    // 删除用户 id
    public delete_user(username: string) {
        const id = this.get_user_id(username); // 找到 id
        if (id === null || id === undefined) {
            throw "User id not found";
        }
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping); // 根据 id 删除数据
        if (!mapping) {
            mapping = {}
        }
        if(mapping[id]?.is_root) {
            throw "root account not to delete"
        }
        delete mapping[id];
        DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
        this.unbind_user_id(username);
    }


    public get_root_name() {
        // const username = DataUtil.get(data_common_key.username) as string;
        // if (username) {
        //     return username;
        // }
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (mapping) {
            for (const key of Object.keys(mapping)) {
                if (mapping[key].is_root) return `${mapping[key].username}`; // 已经存在的root
            }
        }
        if (Env.username)
            return `${Env.username}`;
        return "admin"
    }


    public get_user_list() {
        // 被删除的用户 历史数据依然存在
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
        }
        let list: UserData[] = [];
        const root_username = this.get_root_name();
        for (const key of Object.keys(mapping)) {
            if (mapping[key].username === root_username) {
                // 让root账号排在第一个
                list = [mapping[key], ...list];
            } else {
                list.push(mapping[key]);
            }
        }
        return list;
    }

    public root_init() {
        try {
            // 以前的账号密码
            let root_name:string = DataUtil.get(data_common_key.username);

            if(!root_name) {
                // 找到root 账号
                root_name = this.get_root_name();
            }
            let value = this.get_user_info_by_user_id(root_id); // 查看超级管理员 1 是否有数据
            if (!value) {
                let root_password = DataUtil.get(data_common_key.password);
                if(!root_password) {
                    // 如果以前没有设置密码 使用环境变量的
                    root_password = Env.password;
                    if(!root_password) {
                        // 环境变量也没有密码使用 admin
                        root_password = "admin";
                    }
                }
                value = new UserData();
                value.cwd = Env.base_folder;
                value.note = 'root account';
                value.username = `${root_name}`;
                value.hash_password = hash_string(`${root_password}`);
                value.id = root_id;
                value.is_root = true;
                value.language = "en";
                // 创建
                let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
                if (!mapping) {
                    mapping = {}
                }
                mapping[value.id] = value;
                DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
                // root 不需要绑定名字和id
            }
            if (Env.reset_root_username) {
                value.username = Env.reset_root_username;
                this.save_user_info(value.id, value);
                Env.updateEnv([{key: "reset_root_username"}]);
            }
            if (Env.reset_root_password) {
                value.hash_password = hash_string(Env.reset_root_password);
                this.save_user_info(value.id, value);
                Env.updateEnv([{key: "reset_root_password"}]);
            }

            // 加载全部用户路径
            this.load_all_user_path_and_protection();
        } catch (err) {
            console.log(err)
        }
    }


    public path_exists(str:string) {
        if (!path.isAbsolute(str)) {
            throw " not a valid absolute path";
        }
        if (!fs.existsSync(str)) {
            throw "  path is not exists";
        }
    }

    public check_data_path(data:UserData) {
        if(data.cwd)
            this.path_exists(data.cwd);
        for (const item of data.access_dirs ?? []) {
            this.path_exists(item);
        }
        for (const item of data.not_access_dirs ?? []) {
            this.path_exists(item);
        }
    }


    // user_access_path_map = new Map();
    // user_not_access_path_map = new Map();
    user_access_cmd_map = new Map();

    // 加载单个用户的命令路径数据
    public load_user_cmd_path(id: string) {
        const user_data = this.get_user_info_by_user_id(id);
        this.user_access_cmd_map.set(id, new Set<string>( (user_data.access_cmd ?? "").split(/\s+/)));
    }

    // 一个路径是不是另一个路径的子路径
    public isSubPath(parent, child) {
        parent = removeTrailingPath(parent);
        child = removeTrailingPath(child);
        const relativePath = path.relative(parent, child);
        // 如果相对路径不以 .. 开头，说明 child 是 parent 的子目录
        return relativePath=== "" ||  (!relativePath.startsWith('..') && relativePath !== child && relativePath !== '.');
    }

    // 加载所有用户的路径
    public load_all_user_path_and_protection() {
        let mapping = DataUtil.get(data_common_key.user_id_name_mapping);
        if (!mapping) {
            mapping = {}
        }
        for (const key of Object.keys(mapping)) {
            this.load_user_cmd_path(mapping[key]);
        }
        // 超级管理员的加载
        this.load_user_cmd_path(root_id);
    }

    // ture 是合法
    public check_user_path_by_user_id(id: string, path: string,auto_throw = true) {
        const user_data = userService.get_user_info_by_user_id(id);
        // if(user_data.is_root) return true;
        // 检测是否是非法路径
        for (const item of user_data.not_access_dirs ?? []) {
            if (this.isSubPath(item, path)) {
                if(auto_throw) throw "path is invalid"
                return false;
            }
        }
        let ok = false;
        // 检测是否是合法路径
        const p_l = [];
        p_l.push(user_data.cwd);
        if(user_data.access_dirs) {
            p_l.push(...user_data.access_dirs);
        }
        if(user_data.only_read_dirs) {
            p_l.push(...user_data.only_read_dirs);
        }
        for (const item of  p_l) {
            if (this.isSubPath(item, path)) {
                ok = true;
                break;
            }
        }
        if(auto_throw && !ok) throw "path is invalid"
        return ok;
    }

    // 判断用户的路径是否合法 管理员有设置任意的权限 但是也要做校验
    public check_user_path(token: string, path: string,auto_throw = true) {
        const user_data = userService.get_user_info_by_token(token);
        return this.check_user_path_by_user_id(user_data.id, path,auto_throw);
    }

    // 检测只读路径 如果属于只读路径 则报错 或者返回true
    public check_user_only_path(token: string, path: string,auto_throw = true) {
        const user_data = userService.get_user_info_by_token(token);
        let ok = false;
        for (const item of  [
            ...user_data.only_read_dirs??[] // 只读路径
        ]) {
            if (this.isSubPath(item, path)) {
                ok = true;
                break;
            }
        }
        if(auto_throw===true && ok===true) throw "path is only read "
        return ok;
    }

    // 检测命令是否能执行 管理员有设置任意的权限 但是也要做校验
    public check_user_cmd(token: string, cmd: string,aotu_throw = true) {
        const user_data = userService.get_user_info_by_token(token);
        return this.check_user_cmd_by_id(user_data.id,cmd,aotu_throw)
    }

    public check_user_cmd_by_id(user_id: string, cmd: string,aotu_throw = true) {
        const set = this.user_access_cmd_map.get(user_id);
        if(set.has("*")) {
            return true; // * 所有命令支持
        }
        if(aotu_throw) {
            if(!set.has(cmd)) throw "cmd is invalid"
        }
        if (set) return set.has(cmd);
        return false;
    }

    public check_user_auth(token, auth: UserAuth, auto_throw = true) {
        const user_data = this.get_user_info_by_token(token);
        if(user_data.is_root) return true;
        const v = user_data?.auth_list.find(v => v === auth);
        if (auto_throw && !v) throw "no permission";
        return !!v;
    }

    public check_user_auth_by_user_id(user_id:string, auth: UserAuth, param?:{
        auto_throw?:boolean, // 是否自动抛出异常
        root_check?:boolean // 为 true 是连root都要检查
    }) {
        const user_data = this.get_user_info_by_user_id(user_id);
        if(param?.root_check && user_data.is_root) {
            return true;
        }
        const v = user_data?.auth_list.find(v => v === auth);
        if (!!param?.auto_throw && !v) throw "no permission"
        return !!v;
    }

    // to_path 是 set_path的子路径 还检测 *
    public static path_check_is_child(set_path:string,to_path:string){
        if(set_path === "*" || set_path === "**") {
            return true; // 所有文件都不能删除
        }
        set_path = removeTrailingPath(set_path);
        to_path = removeTrailingPath(to_path);
        let p = set_path;
        if(p.endsWith("**")) {
            // 只要是子目录都不行
            return userService.isSubPath(path.dirname(set_path),to_path);
        } else if (p.endsWith("*")) {
            p = path.dirname(p); // 单个名字的话是 . 当前目录
            const p2 = path.dirname(to_path);
            if (p === p2) {
                return true; // 有相同的父目录
            }
        } else {
            if (path.join(p) === to_path) {
                return true; // 路径一样
            }
            // const relative = path.relative(sys_path, p);
            // if(relative === "..") {
            //     return  true; // 直接子目录
            // }
        }
        // 不是子路径
        return false;
    }

    protectionCheck(sys_path: string, token: string) {
        const user_data = userService.get_user_info_by_token(token);
        const list = user_data.protection_directory ?? [];
        for (const item of list) {
            if(UserService.path_check_is_child(item.path,sys_path)) {
                return true; // 是子路径
            }
        }
        return false;
    }

    // 获取所有角色
    public get_role_list():UserData[] {
        // 被删除的用户 历史数据依然存在
        return DataUtil.get(data_common_key.sys_all_roles) ?? [];
    }

    // 创建角色
    public create_role(role:UserData) {
        this.check_data_path(role);
        role.role_id = this.create_unique_reole_id();
        const all_roles:UserData[]  = DataUtil.get(data_common_key.sys_all_roles) ??[];
        all_roles.push(role);
        DataUtil.set(data_common_key.sys_all_roles, all_roles);
    }

    // 删除角色
    public delete_role(id: string) {

        const all_roles:UserData[]  = DataUtil.get(data_common_key.sys_all_roles) ??[];
        for (const item of all_roles) {
            if(item.role_id == id) {
                this.update_role_all_bind_user(id,true,true);
            }
        }
        const v = deleteList(all_roles,v=>v.role_id === id);
        if(!v) throw "not found role";
        DataUtil.set(data_common_key.sys_all_roles, all_roles);

    }

    // 更新角色
    public update_role(role:UserData) {
        this.check_data_path(role);
        let all_roles:UserData[]  = DataUtil.get(data_common_key.sys_all_roles) ??[];
        let id;
        let auth_list:UserAuth[];
        for (let index =0;index<all_roles.length;index++) {
            if (all_roles[index].role_id === role.role_id) {
                id = all_roles[index].role_id;
                auth_list = all_roles[index].auth_list;
                all_roles[index] = role;
                break;
            }
        }
        if(!id) {
            throw "not found role";
        }
        DataUtil.set(data_common_key.sys_all_roles, all_roles);
        this.update_role_all_bind_user(role.role_id,true,false,auth_list);
    }

    private get_role_data(role_id:string) {
        return this.get_role_list().find(v=>v.role_id === role_id);
    }

    private update_role_all_bind_user(role_id:string,update= false,del = false,auth_list?:UserAuth[]) {
        let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
        if (!mapping) {
            mapping = {}
        }
        for (const key of Object.keys(mapping)) {
            if (mapping[key].bind_role_id === role_id) {
                this.update_user_role_data(mapping[key],update,del,auth_list);
            }
        }
    }

    private update_user_role_data(user_data:UserData,update= false,del = false,auth_list?:UserAuth[]) {
        if(!user_data.bind_role_id)return;
        const role = this.get_role_data(user_data.bind_role_id);
        if(role){
            if(del) {
                throw `not delete role pelease unbind user ${user_data.username}`;
            }
            if(role.cwd) {
                user_data.cwd = role.cwd;
            }
            if(role.access_dirs && role.access_dirs.length >0) {
                user_data.access_dirs = role.access_dirs;
            }
            if(role.only_read_dirs && role.only_read_dirs.length >0) {
                user_data.only_read_dirs = role.only_read_dirs;
            }
            if(role.not_access_dirs && role.not_access_dirs.length >0) {
                user_data.not_access_dirs = role.not_access_dirs;
            }
            if(role.access_cmd) {
                user_data.access_cmd = role.access_cmd;
            }
            if(role.language) {
                user_data.language = role.language;
            }
            if(role.auth_list && role.auth_list.length > 0) {
                const set = new Set(role.auth_list);
                const del_set = new Set();
                if(auth_list) {
                    for (const item of auth_list) {
                        if(!set.has(item)) {
                            del_set.add(item);
                        }
                    }
                }
                for (const key of user_data.auth_list??[]) {
                    if(!del_set.has(key)) {
                        set.add(key);
                    }
                }
                // 直接覆盖 优先角色的
                user_data.auth_list = Array.from(set);
            }
            if(update) {
                let mapping = DataUtil.get(data_common_key.user_id_info_data_mapping);
                if (!mapping) {
                    mapping = {}
                }
                mapping[user_data.id] = this.user_data_reset_check(user_data);
                DataUtil.set(data_common_key.user_id_info_data_mapping, mapping);
                this.load_user_cmd_path(user_data.id); // 权限更新
            }
        }
    }

}

export const userService = new UserService();
