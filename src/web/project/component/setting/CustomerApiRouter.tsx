import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {fileHttp, settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {Table} from "../../../meta/component/Table";
import {TableListRender} from "./component/TableListRend";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {saveTxtReq} from "../../../../common/req/file.req";
import {useTranslation} from "react-i18next";
import {editor_data} from "../../util/store.util";
import {NotyFail} from "../../util/noty";



export function CustomerApiRouter() {
    const { t } = useTranslation();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const headers = [t("路由"),t("auth"),  t("备注"), ];
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [rows, setRows] = useState([]);
    const getItems = async () => {
        const result = await settingHttp.get("api/customer_router");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }
    }
    useEffect(() => {
        getItems();
    }, []);
    const save = async () => {
        const result = await settingHttp.post("api/customer_router/save", rows);
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '保存成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
        }
    }
    const add = ()=>{
        setRows([{note:"",needAuth:false,router:""}, ...rows]);
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const edit = async (item)=>{
        if (!item.router) {
            NotyFail("路由不能为空");
            return;
        }
        const res = await settingHttp.get(`jscode/${encodeURIComponent(item.router)}`);
        setEditorSetting({
            model: "javascript",
            open: true,
            fileName: item.router,
            save:async (context)=>{
                const data  = {
                    context,
                    router:item.router
                }
                const rsq = await settingHttp.post("jscode/save", data);
                if (rsq.code === 0) {
                    editor_data.set_value_temp('')
                    setEditorSetting({open: false,model:'',fileName:'',save:null})
                }
            }
        })
        editor_data.set_value_temp(res.data)
    }
    const soft_ware_info_click = ()=>{
        let context = <div>
            需要以 "/api" 开头的路由。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return <Dashboard>
        <CardFull  self_title={<span className={" div-row "}><h2>{t("自定义api路由")}</h2> <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
            <Table headers={headers} rows={rows.map((item, index) => {
                const new_list = [
                    <InputText value={item.router} handleInputChange={(value) => {
                        item.router = value;
                    }} no_border={true}/>,
                    <Select defaultValue={item.needAuth} onChange={(value) => {
                        item.needAuth = value === "true";
                    }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                    <InputText value={item.note} handleInputChange={(value) => {
                        item.note = value;
                    }} no_border={true}/>,
                    <div>
                        <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                        <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                    </div>,
                ];
                return new_list;
            })} width={"10rem"}/>
        </CardFull>
    </Dashboard>

}
