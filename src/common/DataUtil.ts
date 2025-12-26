import {UserData} from "./req/user.req";


// 获取用户当前目录
export function get_user_now_pwd(user_data:UserData) {
    return user_data.folder_item_now === 0 || user_data.folder_item_now === undefined ? user_data.cwd : user_data.folder_items[user_data.folder_item_now - 1].path as string;

}