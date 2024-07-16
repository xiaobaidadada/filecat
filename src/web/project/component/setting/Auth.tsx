import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {CustomerRouter} from "./CustomerRouter";
import {CustomerApiRouter} from "./CustomerApiRouter";
import {self_auth_jscode} from "../../../../common/req/customerRouter.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Rows} from "../../../meta/component/Table";
import {TokenSettingReq, TokenTimeMode} from "../../../../common/req/setting.req";




export function  Auth() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authopen, setAuthopen] = useState(false);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue);

    const [tokenMode,setTokenMode]  = useState(TokenTimeMode.close);
    const [tokenSeconds,setTokenSeconds] = useState();

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
        </Column>
        <Column widthPer={30}>
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
    </Row>
}
