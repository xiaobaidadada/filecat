import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn, TextLine} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {self_auth_jscode} from "../../../../common/req/customerRouter.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Rows, Table} from "../../../meta/component/Table";
import {SysSoftware, TokenSettingReq, TokenTimeMode} from "../../../../common/req/setting.req";
import {TableListRender} from "./component/TableListRend";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import Header from "../../../meta/component/Header";
import {editor_data} from "../../util/store.util";
import {NotyFail, NotySucess} from "../../util/noty";




export function  Sys() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authopen, setAuthopen] = useState(false);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);

    const [tokenMode,setTokenMode]  = useState(TokenTimeMode.close);
    const [tokenSeconds,setTokenSeconds] = useState(undefined);

    const { t, i18n } = useTranslation();
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);


    const update = async () =>{
        if (!username || !password) {
            NotyFail("账号密码不能为空")
            return;
        }
        const user = new UserLogin();
        user.username = username;
        user.password = password;
        const result = await settingHttp.post("updatePassword",user);
        if (result.code === RCode.Sucess) {
            NotySucess("修改成功")
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
                    editor_data.set_value_temp('')
                    setEditorSetting({open: false,model:'',fileName:'',save:null})
                }
            }
        })
        editor_data.set_value_temp(res.data)
    }
    const authOpenSave = async () =>{
        const result = await settingHttp.post("self_auth_open/save", {open:authopen});
        if (result.code === RCode.Sucess) {
            NotySucess("修改成功")
        }
    }

    // token 管理
    const tokenUpdate = async ()=>{
        const data = new TokenSettingReq();
        data.mode = tokenMode;
        if (TokenTimeMode.length === data.mode && !tokenSeconds) {
            NotyFail("秒数不能为空")
        }
        data.length = parseInt(tokenSeconds);
        const result1 = await settingHttp.post("token/save",data);
        if (result1.code === RCode.Sucess) {
            NotySucess("保存成功")
        }
    }

    // 语言国际化
    const switchLanguage = async () =>{
        i18n.changeLanguage(userInfo.language)
        await settingHttp.post("language/save",{language:userInfo.language});
    }

    const tokenClearAll = async () => {
        const result1 = await settingHttp.get("token/clear");
        if (result1.code === RCode.Sucess) {
            NotySucess("清理完成，重新登录")
        }
    }


    return <Row>
        <Column widthPer={30}>
            <Dashboard>
                <Card title={t("自定义auth")} rightBottomCom={<ButtonText text={t('保存')} clickFun={authOpenSave}/>} titleCom={<ActionButton icon={"edit"} title={t("代码修改")} onClick={jscode}/>}>
                    <Select value={authopen} onChange={(value)=>{setAuthopen(value==="true")}} options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]}/>
                </Card>
                <Card title={t("修改密码")} rightBottomCom={<ButtonText text={t('确定修改')} clickFun={update}/>}>
                    <InputText placeholder={t('新账号')}  value={username} handleInputChange={(value)=>{setUsername(value)}} />
                    <InputText placeholder={t('新密码')}  value={password} handleInputChange={(value)=>{setPassword(value)}} />
                </Card>

            </Dashboard>
        </Column>
        <Column widthPer={30}>
            <Dashboard>
                <Card title={t("语言")} rightBottomCom={<ButtonText text={t('保存')} clickFun={switchLanguage}/>}>
                    <Select value={userInfo.language} onChange={(value)=>{
                        const newInfo = {...userInfo};
                        newInfo.language = value;
                        setUserInfo(newInfo);
                    }} options={[{title:"english",value:"en"},{title:"中文",value:"zh"}]}/>
                </Card>
                <Card title={t("token过期时间")} rightBottomCom={<Rows isFlex={true} columns={[
                    <ButtonText text={t('清空token')} clickFun={tokenClearAll}/>,
                    <ButtonText text={t('保存')} clickFun={tokenUpdate}/>]}/>}>
                    <Rows isFlex={true} columns={[
                        <InputRadio value={1} context={t("关闭")} selected={tokenMode === TokenTimeMode.close} onchange={()=>{setTokenMode(TokenTimeMode.close)}}/>,
                        <InputRadio value={1} context={t("指定时间")} selected={tokenMode === TokenTimeMode.length}  onchange={()=>{setTokenMode(TokenTimeMode.length)}}/>,
                        <InputRadio value={1} context={t("永不过期")} selected={tokenMode === TokenTimeMode.forver}  onchange={()=>{setTokenMode(TokenTimeMode.forver)}}/>
                    ]}/>
                    {tokenMode === TokenTimeMode.length && <InputText placeholder={t('秒')}  value={tokenSeconds} handleInputChange={(value)=>{setTokenSeconds(value)}} />}

                </Card>
            </Dashboard>
        </Column>
        <Header left_children={<span> <span className={"credits"}>{`version:${process.env.version}`}</span><span
            className={"credits"}>系统运行于:{userInfo.runing_time_length}</span></span>}/>
    </Row>
}
