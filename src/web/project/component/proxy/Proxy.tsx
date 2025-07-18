import React, {Suspense, useEffect, useRef, useState} from 'react'
import {Card} from "../../../meta/component/Card";
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {InputText} from "../../../meta/component/Input";
import {BrowserProxy} from "./BrowserProxy";
import {RemoteLinux} from "./remotelinux/RemoteLinux";
import {Rdp} from "./rdp/Rdp";
import {useTranslation} from "react-i18next";
import {Http} from "./Http";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
const Rtsp = React.lazy(()=> import("./Rtsp"))


export default function Proxy(props) {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const menuRots = [];
    if(check_user_auth(UserAuth.http_proxy)) {
        menuRots.push({index: 1, name: t("http代理"),rto:'http/'})
    }
    if(check_user_auth(UserAuth.ssh_proxy)) {
        menuRots.push({index: 1, name: `ssh${t("代理")}`, rto: "remoteShell/*"})
    }
    if(check_user_auth(UserAuth.browser_proxy)) {
        menuRots.push({index: 1, name: `${t("浏览器")}${t("代理")}`, rto: "browserproxy/"})
    }
    if(check_user_auth(UserAuth.rdp_proxy)) {
        menuRots.push({index: 1, name: `rdp${t("代理")}`, rto: "rdp/"})
    }
    if(check_user_auth(UserAuth.rtsp_proxy)) {
        menuRots.push({index: 1, name: t("rtsp播放器"), rto: "rtsp/"})
    }


    return (
        <Menu optionList={menuRots}>
            {check_user_auth(UserAuth.http_proxy) && <Http /> }
            {check_user_auth(UserAuth.ssh_proxy) && <RemoteLinux /> }
    {check_user_auth(UserAuth.browser_proxy) && <BrowserProxy /> }
    {check_user_auth(UserAuth.rdp_proxy) && <Rdp /> }
    {check_user_auth(UserAuth.rtsp_proxy) &&
    <Suspense fallback={<div></div>}>
        <Rtsp />
        </Suspense>
    }
        <Crypto />
        </Menu>

    )
    }
