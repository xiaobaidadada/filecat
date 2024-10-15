import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {CustomerRouter} from "./CustomerRouter";
import {CustomerApiRouter} from "./CustomerApiRouter";
import {Sys} from "./Sys";
import {useTranslation} from "react-i18next";




export default function  Settings() {
    const { t } = useTranslation();
    const menuRots = [{index: 1, name: t("系统"), rto: "password/"},{index: 1, name: t("自定义页面路由"), rto: "customer_router/"},{index: 1, name: t("自定义api路由"), rto: "customer_api_router/"}];

    return  <Menu optionList={menuRots}>
        <Sys />
        <CustomerRouter />
        <CustomerApiRouter />
    </Menu>
}
