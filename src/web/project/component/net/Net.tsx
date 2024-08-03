import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {NetServer} from "./NetServer";
import {NetClient} from "./NetClient";
import {useTranslation} from "react-i18next";





export function  Net() {
    const { t } = useTranslation();
    const menuRots = [{index: 2, name: t("服务端"), rto: "server/"},{index: 1, name: t("客户端"), rto: "client/"}];

    return  <Menu optionList={menuRots}>
        <NetClient />
        <NetServer />
    </Menu>
}
