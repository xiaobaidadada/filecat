import React, {useEffect, useRef, useState} from 'react'
import {Card} from "../../../meta/component/Card";
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {InputText} from "../../../meta/component/Input";
import {TimeConverTer} from "./TimeConverTer";
import {BrowserProxy} from "./BrowserProxy";
import {RemoteLinux} from "./remotelinux/RemoteLinux";
import {Rdp} from "./rdp/Rdp";
import {NetWol} from "./NetWol";
import {useTranslation} from "react-i18next";
import {Rtsp} from "./Rtsp";



export function ToolBox(props) {
    const { t } = useTranslation();

    const menuRots = [{index: 1, name: `ssh${t("代理")}`, rto: "remoteShell/"},
        {index: 2, name: `${t("浏览器")}${t("代理")}`, rto: "browserproxy/"},
        {index: 3, name: `rdp${t("代理")}`, rto: "rdp/"},
        {index: 4, name: t("网络唤醒"), rto: "netwol/"},
        {index: 5, name: t("时间工具"), rto: "timeutil/"},
        {index: 6, name: t("rtsp播放器"), rto: "rtsp/"}];

    return (
        <Menu optionList={menuRots}>
            <RemoteLinux />
            <BrowserProxy />
            <Rdp />
            <NetWol />
            <Dashboard>
                <Row>
                    <Column>
                        <TimeConverTer />
                    </Column>
                    {/*<Column>*/}
                    {/*    <Card title={"测试"}>*/}
                    {/*        <div>ok</div>*/}
                    {/*    </Card>*/}

                    {/*</Column>*/}
                </Row>
            </Dashboard>
            <Rtsp />
        </Menu>

    )
}
