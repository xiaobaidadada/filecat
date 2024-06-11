import React, {useEffect, useState} from 'react'
import {Menu} from "../../../meta/component/Dashboard";
import {Sys} from "./Sys";
import {Docker} from "./Docker";
import {Process} from "./Process";


export function SysInfo(props) {

    const menuRots = [{index: 1, name: "系统性能", rto: "sys/"},{index: 2, name: "系统进程", rto: "process/"}, {index: 3, name: "docker容器", rto: "docker/"}];

    return <Menu optionList={menuRots}>
        <Sys></Sys>
        <Process></Process>
        <Docker></Docker>
        {/*<div></div>*/}
        {/*<div></div>*/}
    </Menu>
}
