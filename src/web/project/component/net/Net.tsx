import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";




const menuRots = [{index: 2, name: "服务端", rto: "server/"},{index: 1, name: "客户端", rto: "client/"}];

export function  Net() {

    return  <Menu optionList={menuRots}>
        <NetClient />
        <NetServer />
    </Menu>
}
