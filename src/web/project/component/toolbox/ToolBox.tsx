import React, {useEffect, useRef, useState} from 'react'
import {Card} from "../../../meta/component/Card";
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {InputText} from "../../../meta/component/Input";
import {TimeConverTer} from "./TimeConverTer";
import {BrowserProxy} from "./BrowserProxy";
import {RemoteLinux} from "./remotelinux/RemoteLinux";
import {Rdp} from "./rdp/Rdp";
import {NetWol} from "./NetWol";



export function ToolBox(props) {

    const menuRots = [{index: 1, name: "shell代理", rto: "remoteShell/"},{index: 2, name: "浏览器代理", rto: "browserproxy/"},{index: 3, name: "rdp代理", rto: "rdp/"},{index: 4, name: "网络唤醒", rto: "netwol/"},{index: 5, name: "时间工具", rto: "timeutil/"}];

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
        </Menu>

    )
}
