import React, {useEffect, useState} from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {Sys} from "./Sys";
import {Docker} from "./Docker";
import {Process} from "./Process";
import {useTranslation} from "react-i18next";
import {Systemd} from "./Systemd";
import {Firewall} from "./Firewall";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {SysEnum, UserAuth} from "../../../../common/req/user.req";
import {routerConfig} from "../../../../common/RouterConfig";


export default function SysInfo(props) {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useAtom($stroe.user_base_info);
    const menuRots = [{
        index: 1, name: t("系统性能"), rto: "sys/",component:<Sys/>},

        {index: 2, name: t("系统进程"), rto: "process/",component:<Process/>},
        {index: 3, name: t("docker容器"), rto: "docker/",component:<Docker/>},];
    if (userInfo.sys === SysEnum.linux) {
        menuRots.push({index:4,name: t("systemd"),rto:"systemd/",component: <Systemd/>})
        // 防火墙页：仅 Linux + 有 firewall 权限（root 默认拥有，is_root 天然通过）
        const can_firewall = userInfo.user_data?.is_root
            || (userInfo.user_data?.auth_list ?? []).includes(UserAuth.firewall);
        if (can_firewall) {
            menuRots.push({index:5, name: t("防火墙"), rto:"firewall/", component: <Firewall/>})
        }
    }
    return <Menu optionList={menuRots} father_route={routerConfig.info}>
    </Menu>
}
