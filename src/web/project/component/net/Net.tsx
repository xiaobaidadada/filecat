import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";
import {useTranslation} from "react-i18next";
import {NetProxy} from "./NetProxy";
import {TcpProxyServer} from "./TcpProxyServer";





export default function  Net() {
    const { t } = useTranslation();
    const menuRots = [
        {index: 1, name:t("系统")+" "+ t("代理"), rto: "proxy_sys/"},
        {index: 2, name:"Tcp Proxy Server", rto: "tcp_proxy_server/"},
        {index: 3, name:"tun "+ t("客户端"), rto: "client/"},
        {index: 4, name: "tun "+t("服务端"), rto: "server/"}
    ];

    return  <Menu optionList={menuRots}>
        <NetProxy />
        <TcpProxyServer />
        <NetClient />
        <NetServer />
    </Menu>
}
