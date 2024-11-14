import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {Table} from "../../../meta/component/Table";
import {TableListRender} from "./component/TableListRend";
import {useTranslation} from "react-i18next";
import {CustomerApiRouter} from "./CustomerApiRouter";


export function CustomerRouter() {
    const {t} = useTranslation();
    const headers = [t("路由"), `${t("文件")}|http${t("路径")}`, t("备注"),];

    const save = async (req: [[]]) => {
        const result = await settingHttp.post("customer_router/save", req);
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '保存成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
        }
    }
    const getItems = async () => {
        const result = await settingHttp.get("customer_router");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    return <Row>
        <Column>
            <TableListRender headers={headers} getItems={getItems} save={save}/>
        </Column>
        <Column>
            <CustomerApiRouter />
        </Column>
    </Row>

}
