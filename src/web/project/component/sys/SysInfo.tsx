import React, {useEffect, useState} from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {Sys} from "./Sys";
import {Docker} from "./Docker";
import {Process} from "./Process";
import {useTranslation} from "react-i18next";
import {Systemd} from "./Systemd";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {SysEnum} from "../../../../common/req/user.req";


export default function SysInfo(props) {
    const { t } = useTranslation();
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const menuRots = [{index: 1, name: t("系统性能"), rto: "sys/"},{index: 2, name: t("系统进程"), rto: "process/"}, {index: 3, name: t("docker容器"), rto: "docker/"}];
    if (userInfo.sys === SysEnum.linux) {
        menuRots.push({index:4,name: t("systemd"),rto:"systemd/"})
    }
    return <Menu optionList={menuRots}>
        <Sys></Sys>
        <Process></Process>
        <Docker></Docker>
        <Systemd/>
        {/*<div></div>*/}
        {/*<div></div>*/}
    </Menu>
}
