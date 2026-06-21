import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";
import {useTranslation} from "react-i18next";
import {NetProxy} from "./NetProxy";
import {UserAuth} from "../../../../common/req/user.req";
import {routerConfig} from "../../../../common/RouterConfig";
import {use_auth_check} from "../../util/store.util";
import {Dnspod} from "./ddns/Dnspod";
import {TengXun} from "./ddns/TengXun";






export default function  Net() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [];
    if(check_user_auth(UserAuth.vir_net)) {
        menuRots.push(...[
            {index: 1, name:t("系统")+ t("代理"), rto: "proxy_sys/",component: <NetProxy />},
            {index: 2, name:"Tun proxy "+ t("客户端"), rto: "client/",component: <NetClient/>},
            {index: 3, name: "Tun proxy "+t("服务端"), rto: "server/",component: <NetServer/>},
        ])
    }
    if (check_user_auth(UserAuth.ddns)) {
        menuRots.push(...[
            {index: 4, name:`ddns-dnspod(${t("腾讯")})`, rto: "dnspod/",component:<Dnspod/>},
            {index: 5, name: `ddns-${t("腾讯")}${t("云")}`, rto: "tengxun/",component: <TengXun/>},
        ])
    }
    return  <Menu optionList={menuRots} father_route={routerConfig.net}>
    </Menu>
}
