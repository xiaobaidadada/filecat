import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../../meta/component/Dashboard";
import {useTranslation} from "react-i18next";
import {TcpProxyServerClient} from "./TcpProxyServerClient";
import {TcpProxyClient} from "./TcpProxyClient";
import {TcpProxyServerSetting} from "./TcpProxyServerSetting";
import {TcpProxyServerClientSetting} from "./TcpProxyServerClientSetting";





export default function  TcpProxy() {
    const { t } = useTranslation();
    const menuRots = [
        {index: 1, name:t("客户端"), rto: "tcp_proxy_client/",component:<TcpProxyClient />},
        {index: 2, name:t("服务端"), rto: "tcp_proxy_server_info/",component:<TcpProxyServerSetting />},
        {index: 3, name:t("服务端")+"-"+t("客户端列表"), rto: "tcp_proxy_server_client/",component:<TcpProxyServerClient />},
        {index: 4, name:t("服务端")+"-"+t("客户端设置"), rto: "tcp_proxy_server_client_setting/",component:<TcpProxyServerClientSetting />},
    ];

    return  <Menu optionList={menuRots}>
    </Menu>
}
