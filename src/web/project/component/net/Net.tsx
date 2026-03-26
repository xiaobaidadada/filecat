import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";
import {useTranslation} from "react-i18next";
import {NetProxy} from "./NetProxy";
import {TcpProxyServer} from "./TcpProxyServer";
import {TcpProxyClient} from "./TcpProxyClient";





export default function  Net() {
    const { t } = useTranslation();
    const menuRots = [
        {index: 1, name:t("系统")+" "+ t("代理"), rto: "proxy_sys/"},
        {index: 2, name:"Tcp proxy "+ t("客户端"), rto: "tcp_proxy_server/"},
        {index: 3, name:"Tcp proxy "+t("服务端"), rto: "tcp_proxy_client/"},
        {index: 4, name:"Tun proxy "+ t("客户端"), rto: "client/"},
        {index: 5, name: "Tun proxy "+t("服务端"), rto: "server/"}
    ];

    return  <Menu optionList={menuRots}>
        <NetProxy />
        <TcpProxyClient />
        <TcpProxyServer />
        <NetClient />
        <NetServer />
    </Menu>
}
