import React, {useEffect, useState} from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {Sys} from "./Sys";
import {Docker} from "./Docker";
import {Process} from "./Process";
import {useTranslation} from "react-i18next";


export function SysInfo(props) {
    const { t } = useTranslation();

    const menuRots = [{index: 1, name: t("系统性能"), rto: "sys/"},{index: 2, name: t("系统进程"), rto: "process/"}, {index: 3, name: t("docker容器"), rto: "docker/"}];

    return <Menu optionList={menuRots}>
        <Sys></Sys>
        <Process></Process>
        <Docker></Docker>
        {/*<div></div>*/}
        {/*<div></div>*/}
    </Menu>
}
