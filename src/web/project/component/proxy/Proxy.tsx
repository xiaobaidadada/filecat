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


export default function Proxy({menuRots}) {
    const {check_user_auth} = use_auth_check();

    return (
        <Menu optionList={menuRots}>
            {check_user_auth(UserAuth.http_proxy) && <Http /> }
            {check_user_auth(UserAuth.ssh_proxy) && <RemoteLinux /> }
            {check_user_auth(UserAuth.browser_proxy) && <BrowserProxy /> }
            {check_user_auth(UserAuth.rdp_proxy) && <Rdp /> }
            {check_user_auth(UserAuth.rtsp_proxy) && <Suspense fallback={<div></div>}><Rtsp /></Suspense>}
        </Menu>

    )
}
