import {useAtom} from 'jotai';
import {$stroe} from "./store";
import {Ace as AceItem} from "ace-builds";
import {UserAuth} from "../../../common/req/user.req";

// async function get_file_context(path, is_sys_path) {
//     if (is_sys_path) {
//         path += "?is_sys_path=1"
//     }
//     const rsq = await fileHttp.get(path);
//     if (rsq.code === RCode.Sucess) {
//         NotyFail("超过20MB");
//         return;
//     }
//     return rsq.data;
// }

export const auth_key_map = new Map() // 更新的时候清空一下
export const use_auth_check = () => {
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);

    const check_user_auth = (auth: UserAuth) => {
        const v = auth_key_map.get(auth);
        if (v !== undefined) {
            return v;
        }
        if (user_base_info?.user_data?.is_root) return true;
        for (const v of (user_base_info.user_data?.auth_list ?? [])) {
            if (v === auth) {
                auth_key_map.set(auth, true);
                return true;
            }

        }
        auth_key_map.set(auth, false);
        return false;
    }

    return {check_user_auth};
}

export const use_file_to_running = () => {
    const [to_running_files_set, set_to_runing_files_set] = useAtom($stroe.to_running_files);
    // useEffect(()=>{
    //     // console.log(to_runing_files_set)
    // },[to_running_files_set])
    const file_is_running = (filename: string) => {
        return to_running_files_set.has(filename);
    }

    return {file_is_running};
}

export class editor_data {

    static cache_str_map: Map<number, string> = new Map();
    static editor_map: Map<number, AceItem.Editor> = new Map();

    //  设置临时值 用于全局传递
    public static set_value_temp(v: string, editor_id?: number) {
        editor_data.cache_str_map.set(editor_id === undefined ? 0 : editor_id, v)
    }

    public static get_value_temp(editor_id?: number) {
        return editor_data.cache_str_map.get(editor_id === undefined ? 0 : editor_id);
    }

    public static set_editor_temp(v: AceItem.Editor, editor_id?: number) {
        editor_data.editor_map.set(editor_id === undefined ? 0 : editor_id, v);
    }

    public static delete_editor_temp(editor_id?: number) {
        editor_data.editor_map.delete(editor_id === undefined ? 0 : editor_id);
    }

    public static get_editor_value(editor_id?: number) {
        // if (!editor_data.editor_map.has(editor_id)) {
        //     throw "不存在编辑器";
        // }
        return editor_data.editor_map.get(editor_id === undefined ? 0 : editor_id).getValue();
    }

    public static get_editor(editor_id?: number) {
        return this.editor_map.get(editor_id === undefined ? 0 : editor_id);
    }

    // public static set_value(v: string, filename?: string) {
    //     if (filename) {
    //         localStorage.setItem(filename, v);
    //     } else {
    //         localStorage.setItem("cache_str", v);
    //     }
    // }

    // public static get_value(filename?: string) {
    //     if (filename) {
    //         localStorage.getItem(filename);
    //     } else {
    //         localStorage.getItem("cache_str");
    //     }
    // }

    // public static delete_value(filename?: string) {
    //     if (filename) {
    //         localStorage.removeItem(filename);
    //     } else {
    //         localStorage.removeItem("cache_str");
    //     }
    // }
}


export function get_proxy_menuRots() {
    const {check_user_auth} = use_auth_check();

    if (check_user_auth(UserAuth.http_proxy)) {
        return true
    }
    if (check_user_auth(UserAuth.ssh_proxy)) {
        return true
    }
    if (check_user_auth(UserAuth.browser_proxy)) {
       return true
    }
    if (check_user_auth(UserAuth.rdp_proxy)) {
        return true
    }
    if (check_user_auth(UserAuth.rtsp_proxy)) {
       return true
    }
    return false
}
