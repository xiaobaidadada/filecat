import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {self_auth_jscode} from "../../../../common/req/customerRouter.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Rows, Table} from "../../../meta/component/Table";
import {TokenSettingReq, TokenTimeMode} from "../../../../common/req/setting.req";
import {TableListRender} from "./component/TableListRend";



const headers = ["编号","路径", "是否默认", "备注" ];
export function  Sys() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authopen, setAuthopen] = useState(false);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue);

    const [tokenMode,setTokenMode]  = useState(TokenTimeMode.close);
    const [tokenSeconds,setTokenSeconds] = useState();

    const [rows, setRows] = useState([]);
    const getItems = async () => {
        const result = await settingHttp.get("filesSetting");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }
    }

    const update = async () =>{
        if (!username || !password) {
            new Noty({
                type: 'error',
                text: '账号密码不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
            return;
        }
        const user = new UserLogin();
        user.username = username;
        user.password = password;
        const result = await settingHttp.post("updatePassword",user);
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '修改成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }
    useEffect(() => {
        const getOpen = async ()=>{
            const result = await settingHttp.get("self_auth_open");
            setAuthopen(result.data);

            const result1 = await settingHttp.get("token");
            if (result1.code === RCode.Sucess) {
                const data = result1.data as TokenSettingReq;
                if (!data) {
                    return;
                }
                if (data['length']) {
                    setTokenSeconds(data['length']);
                }
                if (data['mode']){
                    setTokenMode(data['mode']);
                }
            }
        }
        getOpen();
        getItems();
    }, []);
    const jscode = async () =>{
        const res = await settingHttp.get(`self_auth_open/jscode`);
        setEditorSetting({
            model: "javascript",
            open: true,
            fileName: "",
            save:async (context)=>{
                const data  = {
                    context,
                    router:self_auth_jscode
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
    const authOpenSave = async () =>{
        const result = await settingHttp.post("self_auth_open/save", {open:authopen});
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '修改成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    // token 管理
    const tokenUpdate = async ()=>{
        const data = new TokenSettingReq();
        data.mode = tokenMode;
        if (TokenTimeMode.length === data.mode && !tokenSeconds) {
            new Noty({
                type: 'success',
                text: '秒数不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
        data.length = parseInt(tokenSeconds);
        const result1 = await settingHttp.post("token/save",data);
        if (result1.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '保存成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }
    const tokenClearAll = async () => {
        const result1 = await settingHttp.get("token/clear");
        if (result1.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '清理完成，重新登录',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    // 文件目录
    const save = async () => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        const result = await settingHttp.post("filesSetting/save", rows);
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
        setRows([...rows,{note:"",default:false,path:""}]);
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const onChange = (item,value,index)=> {
            const list = [];
            for (let i=0; i<rows.length; i++) {
                if (i !== index) {
                    rows[i].default = false;
                } else {
                    rows[i].default = value === "true";
                }
                list.push(rows[i])
            }
            setRows([]);
            setRows(list);
    }
    return <Row>
        <Column widthPer={30}>
            <Dashboard>
                <Card title={"修改密码"} rightBottomCom={<ButtonText text={'确定修改'} clickFun={update}/>}>
                    <InputText placeholder={'新账号'}  value={username} handleInputChange={(value)=>{setUsername(value)}} />
                    <InputText placeholder={'新密码'}  value={password} handleInputChange={(value)=>{setPassword(value)}} />
                </Card>
            </Dashboard>
            <Dashboard>
                <Card title={"自定义auth"} rightBottomCom={<ButtonText text={'保存'} clickFun={authOpenSave}/>} titleCom={<ActionButton icon={"edit"} title={"代码修改"} onClick={jscode}/>}>
                    <Select value={authopen} onChange={(value)=>{setAuthopen(value==="true")}} options={[{title:"开启",value:true},{title:"关闭",value:false}]}/>
                </Card>
            </Dashboard>
            <Dashboard>
                <Card title={"token过期时间"} rightBottomCom={<Rows isFlex={true} columns={[
                    <ButtonText text={'清空token'} clickFun={tokenClearAll}/>,
                    <ButtonText text={'保存'} clickFun={tokenUpdate}/>]}/>}>
                    <Rows isFlex={true} columns={[
                        <InputRadio value={1} context={"关闭"} selected={tokenMode === TokenTimeMode.close} onchange={()=>{setTokenMode(TokenTimeMode.close)}}/>,
                        <InputRadio value={1} context={"指定时间"} selected={tokenMode === TokenTimeMode.length}  onchange={()=>{setTokenMode(TokenTimeMode.length)}}/>,
                        <InputRadio value={1} context={"永不过期"} selected={tokenMode === TokenTimeMode.forver}  onchange={()=>{setTokenMode(TokenTimeMode.forver)}}/>
                    ]}/>
                    {tokenMode === TokenTimeMode.length && <InputText placeholder={'秒'}  value={tokenSeconds} handleInputChange={(value)=>{setTokenSeconds(value)}} />}

                </Card>

            </Dashboard>
        </Column>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull title={"文件夹路径"} titleCom={<div><ActionButton icon={"add"} title={"添加"} onClick={add}/><ActionButton icon={"save"} title={"保存"} onClick={save}/></div>}>
                    <Table headers={headers} rows={rows.map((item, index) => {
                        const new_list = [
                            <div>{index}</div>,
                            <InputText value={item.path} handleInputChange={(value) => {
                                item.path = value;
                            }} no_border={true}/>,
                            <Select value={item.default} onChange={(value) => {
                                onChange(item,value,index);
                            }}  options={[{title:"是",value:true},{title:"否",value:false}]} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                {index!==0 && <ActionButton icon={"delete"} title={"删除"} onClick={() => del(index)}/> }
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
    </Row>
}
