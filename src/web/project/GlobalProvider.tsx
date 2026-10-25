// src/context/GlobalState.js
import React, { createContext, useState } from 'react';
import {UserBaseInfo} from "../../common/req/user.req";
import { useAtom } from 'jotai'; 
import {$stroe} from "./util/store";
import {fileHttp, settingHttp, userHttp, mountHttp} from "./util/config";
import {RCode} from "../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {auth_key_map} from "./util/store.util";
import {get_select_style, setTheme} from "./util/FunUtil";
import {is_share} from "./util/WebPath";
import {FileMenuDirType} from "../../common/FileMenuType";
import {Icon} from "../meta/component/Button";
import {MD_EDITOR_SETTING_DEFAULT} from "../../common/req/common.pojo";

export const GlobalContext = createContext(undefined);

export const GlobalProvider = ({ children }) => {
    const [state, setState] = useState({} as UserBaseInfo);

    const [file_paths, setFile_paths] = useAtom($stroe.file_root_list);
    const [file_root_path,setFile_root_path] = useAtom($stroe.file_root_index);
    const [user_base_info,setUser_base_info] = useAtom($stroe.user_base_info);
    const [zoomPercent, setZoomPercent] = useAtom($stroe.zoom_style_by_percent);
    const [, set_ai_chat_zoom] = useAtom($stroe.ai_chat_zoom);
    const [, set_mount_enabled] = useAtom<boolean | null>($stroe.mount_enabled);
    const [, set_md_editor_setting] = useAtom($stroe.md_editor_setting);
    const [, set_md_theme_css] = useAtom($stroe.md_theme_css);
    const { t, i18n } = useTranslation();

    const getItems = async () => {
        const switch_result = await fileHttp.post("base_switch/get");
        if (switch_result.code === RCode.Success) {
            setFile_root_path(switch_result.data);
        }
        const result = await settingHttp.get("filesSetting");
        const list = [];
        if (result.code === RCode.Success) {
            for (let i=0; i<result.data.dirs.length; i++) {
                const dir = result.data.dirs[i];
                // 子目录一起带过来，切换目录菜单要展示成二级菜单
                const children = dir.children?.map((child) => ({
                    r: (<div style={{
                        ...get_select_style(false)
                    }}>{child.note || child.path}</div>),
                    v: {type: FileMenuDirType.child, index: i, rel: child.rel},
                }));
                list.push({
                    r:(<div style={{
                        ...get_select_style(i===switch_result.data)
                    }}>{dir.note}</div>),
                    v: {type: FileMenuDirType.root, index: i},
                    items: children?.length ? children : undefined,
                })
            }
            list.push({
                r:(<div className={"common-tag-center"}>
                    <Icon icon={'add'} not_use_icon_style={true}/>
                    <span>{"添加"}</span>
                </div>),
                v: {type: FileMenuDirType.add}
            })
            setFile_paths(list);
        }
    }
    const reloadFileRoot = async ()=>{
        if(is_share()) return
       await getItems();
    }
    const initUserInfo = async ()=> {
        if(is_share()) return
        await reloadFileRoot();
        // 网盘挂载总开关：全站感知用（关闭时不再请求挂载相关信息）；读取失败按关闭处理
        try {
            const mnt = await mountHttp.post("enabled/get", {});
            set_mount_enabled(mnt?.data === true);
        } catch (e) {
            set_mount_enabled(false);
        }

       const result = await userHttp.get("userInfo/get");
        if (result.code === RCode.Success) {
            const p :UserBaseInfo = result.data;
            setTheme(p.user_data.theme);
            if(p.user_data.upload_file_ignore) {
                try {
                    p.user_data.upload_file_ignore_list =  p.user_data.upload_file_ignore.split(/[; ]/);
                } catch (e) {
                }
            } else {
                p.user_data.upload_file_ignore_list = []
            }
            setUser_base_info(p)
            let language = p?.user_data?.language
            if(language === 'sys' || !language) {
                language = navigator.language
            }
            i18n.changeLanguage(language);
            auth_key_map.clear();
            if(p.user_data?.file_list_zoom != null) {
                setZoomPercent(p.user_data?.file_list_zoom);
            } else {
                setZoomPercent(100)
            }
            if(p.user_data?.ai_chat_zoom != null) {
                set_ai_chat_zoom(p.user_data?.ai_chat_zoom);
            } else {
                set_ai_chat_zoom(100)
            }
        }

        const md_setting_rsp = await settingHttp.get("md_editor_setting/get");
        set_md_editor_setting({...MD_EDITOR_SETTING_DEFAULT, ...(md_setting_rsp?.data ?? {})});
        const md_theme_rsp = await settingHttp.get("md_theme/active");
        set_md_theme_css(md_theme_rsp?.code === RCode.Success ? (md_theme_rsp.data ?? "") : "");

    }

    return (
        <GlobalContext.Provider value={{initUserInfo,reloadUserInfo: reloadFileRoot}}>
            {children}
        </GlobalContext.Provider>
    );
};
