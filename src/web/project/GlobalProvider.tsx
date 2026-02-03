// src/context/GlobalState.js
import React, { createContext, useState } from 'react';
import {UserBaseInfo} from "../../common/req/user.req";
import {useRecoilState} from "recoil";
import {$stroe} from "./util/store";
import {fileHttp, settingHttp, userHttp} from "./util/config";
import {RCode} from "../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {auth_key_map} from "./util/store.util";
import {setTheme} from "./util/FunUtil";
import {is_share} from "./util/WebPath";

export const GlobalContext = createContext(undefined);

export const GlobalProvider = ({ children }) => {
    const [state, setState] = useState({} as UserBaseInfo);

    const [file_paths, setFile_paths] = useRecoilState($stroe.file_root_list);
    const [file_root_path,setFile_root_path] = useRecoilState($stroe.file_root_index);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const { t, i18n } = useTranslation();

    const getItems = async () => {
        const switch_result = await fileHttp.post("base_switch/get");
        if (switch_result.code === RCode.Sucess) {
            setFile_root_path(switch_result.data);
        }
        const result = await settingHttp.get("filesSetting");
        const list = [];
        if (result.code === RCode.Sucess) {
            for (let i=0; i<result.data.dirs.length; i++) {
                list.push({
                    r:(<div>{result.data.dirs[i].note}</div>),
                    v:i
                })
            }
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
        const result = await userHttp.get("userInfo/get");
        if (result.code === RCode.Sucess) {
            const p :UserBaseInfo = result.data;
            if(user_base_info?.user_data?.theme  !== p.user_data.theme)
                setTheme(p.user_data.theme);
            setUser_base_info(p)
            i18n.changeLanguage(p?.user_data?.language);
            auth_key_map.clear();
        }
    }

    return (
        <GlobalContext.Provider value={{initUserInfo,reloadUserInfo: reloadFileRoot}}>
            {children}
        </GlobalContext.Provider>
    );
};
