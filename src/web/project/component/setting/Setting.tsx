import React from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {UserAuth} from "../../../../common/req/user.req";
import {Sys} from "./Sys";
import {useTranslation} from "react-i18next";
import {Env} from "./Env";
import {User} from "./User";
import {use_auth_check} from "../../util/store.util";
import {Role} from "./Role";
import {PrivateEnv} from "./PrivateEnv";
import {MountSetting} from "./MountSetting";
import {FileServerSetting} from "./FileServerSetting";
import {routerConfig} from "../../../../common/RouterConfig";


export default function  Settings() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [
        {index: 2, name: `${t('个人环境')}`, rto: "private_env_setting",component:  <PrivateEnv />},
    ];
    if(check_user_auth(UserAuth.sys_setting_page)) {
        menuRots.unshift(    {index: 1, name: t("系统"), rto: "password",component: <Sys />},)
    }
    if(check_user_auth(UserAuth.sys_env_page)) {
        menuRots.push(     {index: 3, name: `${t("系统环境")}`, rto: "env_setting/",component: <Env />},)
    }
    if(check_user_auth(UserAuth.file_mount)) {
        menuRots.push({index: 5, name:t("网盘挂载"),rto: "mount_setting/",component: <MountSetting />})
    }
    if(check_user_auth(UserAuth.file_server)) {
        menuRots.push({index: 6, name:t("文件服务"),rto: "file_server_setting/",component: <FileServerSetting />})
    }
    if(check_user_auth(UserAuth.user_manage)) {
        menuRots.push({index:7, name:t("用户管理"), rto:"user_manager/",component: <User />})
    }
    if(check_user_auth(UserAuth.role_manage)) {
        menuRots.push({index: 8, name:t("角色管理"),rto: "role_manager/",component: <Role />})
    }


    return  <Menu optionList={menuRots} father_route={routerConfig.setting}>
    </Menu>
}
