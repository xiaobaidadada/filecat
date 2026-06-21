import React from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {UserAuth} from "../../../../common/req/user.req";
import {CustomerRouter} from "./CustomerRouter";
import {Sys} from "./Sys";
import {useTranslation} from "react-i18next";
import {Env} from "./Env";
import {User} from "./User";
import {use_auth_check} from "../../util/store.util";
import {Role} from "./Role";
import {PrivateEnv} from "./PrivateEnv";
import {routerConfig} from "../../../../common/RouterConfig";


export default function  Settings() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [
        {index: 1, name: t("系统"), rto: "password",component: <Sys />},
        {index: 1, name: `${t('个人')}${t("环境")}`, rto: "private_env_setting",component:  <PrivateEnv />},
    ];
    if(check_user_auth(UserAuth.sys_page)) {
        menuRots.push(     {index: 1, name: `${t("系统")}${t("环境")}`, rto: "env_setting/",component: <Env />},)
    }
    if(check_user_auth(UserAuth.auth_router_page)) {
        menuRots.push( {index: 1, name: t("自定义路由"), rto: "customer_router/",component: <CustomerRouter />},)
    }
    if(check_user_auth(UserAuth.user_manage)) {
        menuRots.push({index:1, name:t("用户管理"), rto:"user_manager/",component: <User />})
    }
    if(check_user_auth(UserAuth.role_manage)) {
        menuRots.push({index: 1, name:t("角色管理"),rto: "role_manager/",component: <Role />})
    }


    return  <Menu optionList={menuRots} father_route={routerConfig.setting}>
    </Menu>
}
