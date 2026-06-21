import React, {Suspense, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {TimeConverTer} from "./TimeConverTer";
import {NetWol} from "./NetWol";
import {useTranslation} from "react-i18next";
import {Crypto} from "./Crypto";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {routerConfig} from "../../../../common/RouterConfig";


export default function ToolBox(props) {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [];

    menuRots.push(...[
        {index: 1, name: t("时间工具"), rto: "timeutil/",component: <TimeConverTer/>},
        {index: 1, name: t("非对称密钥"), rto: "crypto/",component:    <Crypto/>},
    ])
    if (check_user_auth(UserAuth.wol_proxy)) {
        menuRots.push({index: 1, name: t("网络唤醒"), rto: "netwol/",component: <NetWol/>});
    }

    return (
        <Menu optionList={menuRots} father_route={routerConfig.toolbox}>
        </Menu>

    )
}
