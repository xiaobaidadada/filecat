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
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";


export function CustomerRouter() {
    const {t} = useTranslation();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const headers = [t("路由"), `${t("文件")}|http${t("路径")}`, t("备注"),];
    const headers_workflow = [t("路由"), t("文件路径"),"token","user id", t("备注"),];

    const save = async (req: [[]]) => {
        const result = await settingHttp.post(Http_controller_router.setting_customer_router_save, req);
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
        const result = await settingHttp.get(Http_controller_router.setting_customer_router);
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }

    const soft_ware_info_click = ()=>{
        let context = <div>
            需要以 "/api" 开头的路由，会自动识别文件地址和http地址，将页面转到对应结果。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    const worlfow_api_info_click = ()=>{
        let context = <div>
            需要以 "/api" 开头的路由，文件路径是有效的workflow路径。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return <Row>
        <Column>
            <TableListRender title={t("页面资源路由")} headers={headers} getItems={getItems} save={save} info_click={soft_ware_info_click}/>
            <TableListRender title={t("workflow触发路由")} headers={headers_workflow} getItems={async ()=>{
                const result = await settingHttp.get(Http_controller_router.setting_customer_workflow_router);
                if (result.code === RCode.Sucess) {
                    return result.data;
                }
                return [];
            }} save={async (req: [[]]) => {
                const result = await settingHttp.post(Http_controller_router.setting_customer_workflow_router_save, req);
                if (result.code === RCode.Sucess) {
                    new Noty({
                        type: 'success',
                        text: '保存成功',
                        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                        layout: "bottomLeft"
                    }).show();
                }
            }} info_click={worlfow_api_info_click}/>
        </Column>
        <Column>
            <CustomerApiRouter />
        </Column>
    </Row>

}
