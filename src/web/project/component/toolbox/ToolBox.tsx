import React, {Suspense, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, } from "../../../meta/component/Dashboard";
import {TimeConverTer} from "./TimeConverTer";
import {NetWol} from "./NetWol";
import {useTranslation} from "react-i18next";
import {Crypto} from "./Crypto";
import {PortScan} from "./PortScan";
import {FormatConvert} from "./FormatConvert";
import {Codec} from "./Codec";
import {RegexTester} from "./RegexTester";
import {DeveloperTool} from "./DeveloperTool";
import {QrCode} from "./QrCode";
import {TextDiff} from "./TextDiff";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {routerConfig} from "../../../../common/RouterConfig";


export default function ToolBox(props) {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [];

    menuRots.push(...[
        {index: 1, name: t("开发者工具"), rto: "developer/",component: <DeveloperTool/>},
        {index: 1, name: t("时间工具"), rto: "timeutil/",component: <TimeConverTer/>},
        {index: 1, name: t("JSON 格式转换"), rto: "format/",component: <FormatConvert/>},
        {index: 1, name: t("编解码"), rto: "codec/",component: <Codec/>},
        {index: 1, name: t("正则测试"), rto: "regex/",component: <RegexTester/>},
        {index: 1, name: t("文本对比"), rto: "diff/",component: <TextDiff/>},
        {index: 1, name: t("二维码"), rto: "qrcode/",component: <QrCode/>},
        {index: 1, name: t("非对称密钥"), rto: "crypto/",component:    <Crypto/>},
    ])
    if (check_user_auth(UserAuth.port_scan)) {
        menuRots.push({index: 1, name: t("端口扫描"), rto: "portscan/",component: <PortScan/>});
    }
    if (check_user_auth(UserAuth.wol_proxy)) {
        menuRots.push({index: 1, name: t("网络唤醒"), rto: "netwol/",component: <NetWol/>});
    }

    return (
        <Menu optionList={menuRots} father_route={routerConfig.toolbox}>
        </Menu>

    )
}
