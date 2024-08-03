// src/context/GlobalState.js
import React, { createContext, useState } from 'react';
import {UserBaseInfo} from "../../common/req/user.req";
import {useRecoilState} from "recoil";
import {$stroe} from "./util/store";
import {fileHttp, settingHttp} from "./util/config";
import {RCode} from "../../common/Result.pojo";
import {useTranslation} from "react-i18next";

export const GlobalContext = createContext();

export const GlobalProvider = ({ children }) => {
    const [state, setState] = useState({} as UserBaseInfo);

    const [file_paths, setFile_paths] = useRecoilState($stroe.file_root_list);
    const [file_root_path,setFile_root_path] = useRecoilState($stroe.file_root_index);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const { t, i18n } = useTranslation();

    const getItems = async () => {
        const result = await settingHttp.get("filesSetting");
        const list = [];
        if (result.code === RCode.Sucess) {
            for (let i=0; i<result.data.length; i++) {
                list.push({
                    r:(<div>{result.data[i].note}</div>),
                    v:i
                })
            }
            setFile_paths(list);
        }
        const swith_result = await fileHttp.post("base_switch/get");
        if (swith_result.code === RCode.Sucess) {
            if (swith_result.data) {
                setFile_root_path(swith_result.data);}
        }
    }
    const reloadFileRoot = async ()=>{
       await getItems();
    }
    const initUserInfo = async ()=> {
        await reloadFileRoot();
        const result = await settingHttp.get("userInfo/get");
        if (result.code === RCode.Sucess) {
            setUser_base_info(result.data)
            i18n.changeLanguage(result.data.language);

        }
    }

    return (
        <GlobalContext.Provider value={{initUserInfo,reloadUserInfo: reloadFileRoot}}>
            {children}
        </GlobalContext.Provider>
    );
};
