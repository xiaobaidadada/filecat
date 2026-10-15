import React from 'react'
import {Menu,} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";
import {useTranslation} from "react-i18next";
import {NetProxy} from "./NetProxy";
import {UserAuth} from "../../../../common/req/user.req";
import {routerConfig} from "../../../../common/RouterConfig";
import {use_auth_check} from "../../util/store.util";
import {DdnsSetting} from "./ddns/DdnsSetting";


export default function Net() {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [];
    if (check_user_auth(UserAuth.vir_net)) {
        menuRots.push(...[
            {index: 1, name: t("系统代理"), rto: "proxy_sys/", component: <NetProxy/>},
            {index: 3, name: "Tun proxy " + t("客户端"), rto: "client/", component: <NetClient/>},
            {index: 4, name: "Tun proxy " + t("服务端"), rto: "server/", component: <NetServer/>},
        ])
    }
    if (check_user_auth(UserAuth.ddns)) {
        menuRots.push(...[
            {index: 2, name: "DDNS", rto: "ddns/", component: <DdnsSetting/>},
        ])
    }
    return <Menu optionList={menuRots} father_route={routerConfig.net}>
    </Menu>
}
