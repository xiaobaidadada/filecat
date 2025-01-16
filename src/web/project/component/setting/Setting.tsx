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


export default function  Settings() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [
        {index: 1, name: t("系统"), rto: "password/"},
        {index: 1, name: t("环境"), rto: "env_setting/"},
        {index: 1, name: t("自定义路由"), rto: "customer_router/"},
    ];
    if(check_user_auth(UserAuth.user_manage)) {
        menuRots.push({index:1, name:t("用户管理"), rto:"user_manager/"})
    }
    if(check_user_auth(UserAuth.role_manage)) {
        menuRots.push({index: 1, name:t("角色管理"),rto: "role_manager/"})
    }

    return  <Menu optionList={menuRots}>
        <Sys />
        <Env />
        <CustomerRouter />
        {check_user_auth(UserAuth.user_manage) && <User />}
        {check_user_auth(UserAuth.role_manage) &&     <Role />}
    </Menu>
}
