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


const headers = ["路由","auth",  "备注", ];

export function CustomerApiRouter() {

    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue);
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
                    setEditorValue('')
                    setEditorSetting({open: false,model:'',fileName:'',save:null})
                }
            }
        })
        setEditorValue(res.data);
    }
    return <RowColumn>
        <Dashboard>
            <CardFull title={"自定义路由"} titleCom={<div><ActionButton icon={"add"} title={"添加"} onClick={add}/><ActionButton icon={"save"} title={"保存"} onClick={save}/></div>}>
                <Table headers={headers} rows={rows.map((item, index) => {
                    const new_list = [
                        <InputText value={item.router} handleInputChange={(value) => {
                            item.router = value;
                        }} no_border={true}/>,
                        <Select defaultValue={item.needAuth} onChange={(value) => {
                            item.needAuth = value === "true";
                        }}  options={[{title:"是",value:true},{title:"否",value:false}]} no_border={true}/>,
                        <InputText value={item.note} handleInputChange={(value) => {
                            item.note = value;
                        }} no_border={true}/>,
                        <div>
                            <ActionButton icon={"delete"} title={"删除"} onClick={() => del(index)}/>
                            <ActionButton icon={"edit"} title={"编辑"} onClick={() => edit(item)}/>
                        </div>,
                    ];
                    return new_list;
                })} width={"10rem"}/>
            </CardFull>
        </Dashboard>
    </RowColumn>

}
