import React, {useContext, useEffect, useState} from 'react'
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {settingHttp, userHttp} from "../../util/config";
import {themes, UserAuth, UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {self_auth_jscode} from "../../../../common/req/customerRouter.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Rows} from "../../../meta/component/Table";
import {sys_setting_type, TokenSettingReq, TokenTimeMode} from "../../../../common/req/setting.req";
import {useTranslation} from "react-i18next";
import Header from "../../../meta/component/Header";
import {editor_data, use_auth_check} from "../../util/store.util";
import {NotyFail, NotySucess} from "../../util/noty";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {getShortTime} from "../../../project/util/comm_util";
import {setTheme} from "../../util/FunUtil";
import {GlobalContext} from "../../GlobalProvider";


export function  Sys() {
    const [web_site_title, set_web_site_title] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authopen, setAuthopen] = useState(false);
    const [shell_cmd_open, set_shell_cmd_open] = useState(false);
    const [recycle_open, set_recycle_open] = useState(false);
    const [recycle_dir, set_recycle_dir] = useState("");
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);

    const [tokenMode,setTokenMode]  = useState(TokenTimeMode.close);
    const [tokenSeconds,setTokenSeconds] = useState(undefined);

    const { t, i18n } = useTranslation();
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const {check_user_auth} = use_auth_check();
    const [language,set_language] =  useState("");
    const [theme,set_theme] =  useState<themes>("");
    const {initUserInfo} = useContext(GlobalContext);

    const update = async () =>{
        if (!username || !password) {
            NotyFail("账号密码不能为空")
            return;
        }
        const user = new UserLogin();
        user.username = username;
        user.password = password;
        user.user_id = userInfo.user_data.id;
        const result = await userHttp.post("updatePassword",user);
        if (result.code === RCode.Sucess) {
            NotySucess("修改成功")
        }
    }
    const set_recycle_save = async () =>{
        if (recycle_open) {
            if(!recycle_dir) {
                NotyFail("目录不能为空")
                return;
            }
        }
        const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {type:sys_setting_type.cyc,value:recycle_dir,open:recycle_open});
        if (result.code === RCode.Sucess) {
            NotySucess("修改成功")
        }
    }
    useEffect(() => {
        const getOpen = async ()=>{
            const all_open_result = await settingHttp.get("sys_option/status");
            if(all_open_result.code === RCode.Sucess) {
                setAuthopen(all_open_result.data.self_auth_open);
                set_shell_cmd_open(all_open_result.data.shell_cmd_check_open);
                set_recycle_open(all_open_result.data.recycle_open);
                set_recycle_dir(all_open_result.data.recycle_dir);
                const sys_env = all_open_result.data.sys_env;
                set_web_site_title(sys_env?.web_site_title);
            }
            // const result = await settingHttp.get("self_auth_open");
            // setAuthopen(result.data);
            //
            // const result2 = await settingHttp.get("shell_cmd_check_open");
            // set_shell_cmd_open(result2.data);

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
        set_language(userInfo?.user_data?.language);
        set_theme(userInfo?.user_data?.theme);
    }, []);
    const jscode = async () =>{
        const res = await settingHttp.get(`self_auth_open/jscode`);
        setEditorSetting({
            model: "ace/mode/javascript",
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
    const shell_cmd_jscode = async () =>{
        const res = await settingHttp.get(`shell_cmd_check_open/jscode`);
        setEditorSetting({
            model: "ace/mode/javascript",
            open: true,
            fileName: "",
            save:async (context)=>{
                const data  = {
                    context,
                }
                const rsq = await settingHttp.post("shell_cmd_check_open/jscode/save", data);
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

    const auth_shell_open_Save = async () =>{
        const result = await settingHttp.post("shell_cmd_check_open/save", {open:shell_cmd_open});
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
    // const switchLanguage = async () =>{
    //
    // }

    const tokenClearAll = async () => {
        const result1 = await settingHttp.get("token/clear");
        if (result1.code === RCode.Sucess) {
            NotySucess("清理完成，重新登录")
        }
    }
    const save_sys_env = async () =>{

        const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {type:sys_setting_type.sys_env,value:{
                web_site_title,
                language,
                theme
            }});
        if (result.code === RCode.Sucess) {
            NotySucess("修改成功")
        } else {
            return;
        }
        // if(userInfo?.user_data?.language !== language) {
        //     i18n.changeLanguage(language)
        // }
        // setTheme(theme);
        initUserInfo();
    }

    return <Row>
        <Column widthPer={30}>
            <Dashboard>
                <Card title={t("修改密码")} rightBottomCom={<ButtonText text={t('确定修改')} clickFun={update}/>}>
                    <InputText placeholder={t('新账号')}  value={username} handleInputChange={(value)=>{setUsername(value)}} />
                    <InputText placeholder={t('新密码')}  value={password} handleInputChange={(value)=>{setPassword(value)}} />
                </Card>
                <Card title={t("自定义登录auth")} rightBottomCom={<ButtonText text={t('保存')} clickFun={authOpenSave}/>} titleCom={<ActionButton icon={"edit"} title={t("代码修改")} onClick={jscode}/>}>
                    <Select value={authopen} onChange={(value)=>{setAuthopen(value==="true")}} options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]}/>
                </Card>
                <Card title={t("自定义shell命令校验")} rightBottomCom={<ButtonText text={t('保存')} clickFun={auth_shell_open_Save}/>} titleCom={<ActionButton icon={"edit"} title={t("代码修改")} onClick={shell_cmd_jscode}/>}>
                    <Select value={shell_cmd_open} onChange={(value)=>{set_shell_cmd_open(value==="true")}} options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]}/>
                </Card>
            </Dashboard>

        </Column>
        <Column widthPer={30}>
            <Dashboard>
                <Card
                      self_title={<span className={" div-row "}><h2>{t("文件回收站")}</h2> <ActionButton icon={"info"} onClick={()=>{
                          set_prompt_card({open:true,title:"信息",context_div : (
                                  <div >
                                      {t(`格式：[被删除的文件所在父目录] 回收站目录 [; ...]`)}
                                  </div>
                              )})
                      }} title={"信息"}/></span>}
                      rightBottomCom={<ButtonText text={t('确定修改')} clickFun={set_recycle_save}/>}>
                    <InputText placeholder={t('目录')}  value={recycle_dir} handleInputChange={(value)=>{set_recycle_dir(value)}} />
                    <Select value={recycle_open} onChange={(value)=>{set_recycle_open(value==="true")}} options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]}/>

                </Card>
                {/*<Card title={t("语言")} rightBottomCom={<ButtonText text={t('保存')} clickFun={switchLanguage}/>}>*/}

                {/*</Card>*/}
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

        <Column widthPer={40}>
            <Dashboard>
                <Card title={t("通用设置")} rightBottomCom={<ButtonText text={t('确定修改')} clickFun={save_sys_env}/>}>
                    {t("语言")}
                    <Select  value={language} onChange={(value)=>{
                        set_language(value);
                    }} options={[{title:"English",value:"en"},{title:"中文",value:"zh"}]}/>
                    {t("主题")}
                    <Select  value={theme} onChange={(value)=>{
                        set_theme(value);
                    }} options={[{title:"light",value:"light"},{title:"dark",value:"dark"}]}/>
                    {t("网站标题")}
                    <InputText   value={web_site_title} handleInputChange={(value)=>{set_web_site_title(value)}} />
                </Card>
            </Dashboard>
        </Column>
        <Header left_children={<span> <span className={"credits"}>{`version:${process.env.version}`}</span><span
            className={"credits"}>{t('系统运行于')}: {getShortTime(userInfo.runing_time_length)}</span></span>}/>
    </Row>
}
