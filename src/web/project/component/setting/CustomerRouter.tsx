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
import {NotyFail, NotyWaring} from "../../util/noty";
import Header from "../../../meta/component/Header";


export function CustomerRouter() {
    const {t} = useTranslation();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [router_jump, set_router_jump] = useRecoilState($stroe.router_jump);

    const headers = [t("路由"), t("路径"), t("备注"),];
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
            if(router_jump?.page_self_router_api_data) {
                for (const it of result.data) {
                    if(it[1] === router_jump?.page_self_router_api_data[1]) {
                        NotyWaring("已经存在的页面资源路由配置目录设置")
                    }
                }
                const target = {}
                Object.assign(target,router_jump?.page_self_router_api_data)
                result.data = [target,...result.data];
                set_router_jump({})
            }
            return result.data;
        }
        return [];
    }

    const soft_ware_info_click = ()=>{
        let context = <div>
            默认需要以 "/api" 开头的路由，会自动识别地址，将页面转到对应结果。路径支持文件路径（如果是文件夹路径的最后最后一个名字将会成为资源实际地址，整个目录将会变成一个http目录），http地址。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    const worlfow_api_info_click = ()=>{
        let context = <div>
            默认需要以 "/api" 开头的路由，文件路径是有效的workflow路径。token也可以是文件绝对路径，请求的时候请设置同样的authorization请求头字段。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    const pre_api = async ()=>{
        const res = await settingHttp.get("customer_api_pre_key");
        let pre = res.data;
        set_prompt_card({
            open: true, title: "pre", context_div: (
                <div>
                    <div className="card-content">
                        其它路由设置仍需要要包括pre路由
                        <InputText placeholderOut={t("输入自定义全局pre路由,以 / 开头")} value={pre}
                                   handleInputChange={(value) => {pre=value}}/>

                    </div>
                    <div className="card-action">
                        <button className="button button--flat button--grey" onClick={()=>{ set_prompt_card({open: false});}}>
                            {t("取消")}
                        </button>
                        <button className="button button--flat" onClick={async () => {
                            await settingHttp.post("customer_api_pre_key/save",{pre})
                            set_prompt_card({open: false});
                        }}>
                            {t("确定")}
                        </button>
                    </div>
                </div>
            )
        })
    }
    return <React.Fragment>
        <Header>
            <ActionButton icon={"http"} title={t("pre路由")} onClick={pre_api} />
        </Header>
        <Row>
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
    </React.Fragment>

}
