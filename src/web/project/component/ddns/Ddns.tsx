import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card} from "../../../meta/component/Card";
import {Dnspod} from "./Dnspod";
import {TengXun} from "./TengXun";
import {Ali} from "./Ali";


const menuRots = [{index: 1, name: "dnspod(腾讯)", rto: "dnspod/"}, {index: 2, name: "腾讯云", rto: "tengxun/"},
//     {
//     index: 3,
//     name: "阿里云",
//     rto: "ali/"
// }
];

export function Ddns() {

    return <Menu optionList={menuRots}>
        <Dnspod/>
        <TengXun/>
        {/*<Ali/>*/}
    </Menu>
}
