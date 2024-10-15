import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card} from "../../../meta/component/Card";
import {Dnspod} from "./Dnspod";
import {TengXun} from "./TengXun";
import {Ali} from "./Ali";
import {useTranslation} from "react-i18next";



export default function Ddns() {
    const { t } = useTranslation();

    const menuRots = [{index: 1, name:`dnspod(${t("腾讯")})`, rto: "dnspod/"}, {index: 2, name: `${t("腾讯")}${t("云")}`, rto: "tengxun/"},
//     {
//     index: 3,
//     name: "阿里云",
//     rto: "ali/"
// }
    ];
    return <Menu optionList={menuRots}>
        <Dnspod/>
        <TengXun/>
        {/*<Ali/>*/}
    </Menu>
}
