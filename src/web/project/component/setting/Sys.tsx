import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn, TextLine} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../meta/component/Card";
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
import {SysSoftware, TokenSettingReq, TokenTimeMode} from "../../../../common/req/setting.req";
import {TableListRender} from "./component/TableListRend";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import Header from "../../../meta/component/Header";
import {editor_data} from "../../util/store.util";




export function  Sys() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authopen, setAuthopen] = useState(false);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);

    const [tokenMode,setTokenMode]  = useState(TokenTimeMode.close);
    const [tokenSeconds,setTokenSeconds] = useState(undefined);

    const [rows, setRows] = useState([]);
    const [rows_outside_software, setRows_outside_software] = useState([]);
    const { t, i18n } = useTranslation();
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);

    const headers = [t("编号"),t("路径"), t("是否默认"), t("备注") ];
    const headers_outside_software = [t("软件"),t("是否安装"), t("路径") ];

    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const getItems = async () => {
        const result = await settingHttp.get("filesSetting");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }
        const result1 = await settingHttp.get("outside/software/get");
        if (result1.code === RCode.Sucess) {
            setRows_outside_software(result1.data);
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

    // 语言国际化
    const switchLanguage = async () =>{
        i18n.changeLanguage(userInfo.language)
        await settingHttp.post("language/save",{language:userInfo.language});
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
            reloadUserInfo();
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
    // 外部软件
    const save_outside_software = async () => {
        const result = await settingHttp.post("outside/software/save", rows_outside_software);
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '保存成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
            initUserInfo();
        }
    }

    // 外部软件信息解释
    const soft_ware_info_click = (id)=>{
        let context;
        if(id === SysSoftware.ffmpeg) {
            context = <div>
                视频转换，rtsp播放器等媒体功能都需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置
            </div>
        } else if (id === SysSoftware.smartmontools) {
            context = <div>
                磁盘检查需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置。
            </div>
        } else if (id === SysSoftware.ntfs_3g) {
            context = <div>
                如果在linux需要挂载ntfs的硬盘，需要这个软件支持。
            </div>
        }
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return <Row>
        <Column widthPer={30}>
            <Dashboard>
                <Card title={t("修改密码")} rightBottomCom={<ButtonText text={t('确定修改')} clickFun={update}/>}>
                    <InputText placeholder={t('新账号')}  value={username} handleInputChange={(value)=>{setUsername(value)}} />
                    <InputText placeholder={t('新密码')}  value={password} handleInputChange={(value)=>{setPassword(value)}} />
                </Card>
            </Dashboard>
            <Dashboard>
                <Card title={t("自定义auth")} rightBottomCom={<ButtonText text={t('保存')} clickFun={authOpenSave}/>} titleCom={<ActionButton icon={"edit"} title={t("代码修改")} onClick={jscode}/>}>
                    <Select value={authopen} onChange={(value)=>{setAuthopen(value==="true")}} options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]}/>
                </Card>
            </Dashboard>
            <Dashboard>
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
                <Card title={t("语言")} rightBottomCom={<ButtonText text={t('保存')} clickFun={switchLanguage}/>}>
                    <Select value={userInfo.language} onChange={(value)=>{
                        const newInfo = {...userInfo};
                        newInfo.language = value;
                        setUserInfo(newInfo);
                    }} options={[{title:"english",value:"en"},{title:"中文",value:"zh"}]}/>
                </Card>

            </Dashboard>
        </Column>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull title={t("文件夹路径")} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                    <Table headers={headers} rows={rows.map((item, index) => {
                        const new_list = [
                            <div>{index}</div>,
                            <InputText value={item.path} handleInputChange={(value) => {
                                item.path = value;
                            }} no_border={true}/>,
                            <Select value={item.default} onChange={(value) => {
                                onChange(item,value,index);
                            }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                {index!==0 && <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/> }
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
            <Dashboard>
                <CardFull title={t("外部软件")} titleCom={<ActionButton icon={"save"} title={t("保存")} onClick={save_outside_software}/>}>
                    <Table headers={headers_outside_software} rows={rows_outside_software.map((item, index) => {
                        const new_list = [
                            <div>{item.id}</div>,
                            <StatusCircle ok={item.installed} />,
                            <InputText value={item.path} handleInputChange={(value) => {
                                item.path = value;
                            }} no_border={true} placeholder={t("默认使用环境变量")}/>,
                            <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click(item.id)}} title={"信息"}/>
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
        <Header left_children={<span className={"credits"}>{`version:${process.env.version}`}</span>}/>
    </Row>
}
