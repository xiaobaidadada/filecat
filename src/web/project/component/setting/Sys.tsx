import React, {useContext, useEffect, useState} from 'react'
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputCheckbox, InputPassword, InputRadio, InputText, Select} from "../../../meta/component/Input";
import {settingHttp, userHttp} from "../../util/config";
import {themes, UserAuth, UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {useAtom} from 'jotai';
import {$stroe} from "../../util/store";
import {Rows} from "../../../meta/component/Table";
import {
    sys_setting_type,
    TokenSessionMode,
    TokenSettingReq,
    TokenTimeMode
} from "../../../../common/req/setting.req";
import {useTranslation} from "react-i18next";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {editor_data, use_auth_check} from "../../util/store.util";
import {NotyFail, NotySuccess} from "../../util/noty";
import {using_tip} from "../prompts/prompts.util";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {CONTROL_ENV_STR_DEFAULT} from "../../../../common/req/common.pojo";
import {getShortTime} from "../../util/common_util";
import {GlobalContext} from "../../GlobalProvider";
import BrowserProxyCard from "./BrowserProxyCard";


export function Sys() {
    const [web_site_title, set_web_site_title] = useState("");
    const [site_logo, set_site_logo] = useState("");
    const [show_login_user_info, set_show_login_user_info] = useState(false);
    // http 代理地址已经挪到「环境控制」的 yaml 里，这里仅保留历史值原样回传，避免保存时把它清空
    const [http_proxy, set_http_proxy] = useState("");
    const [recycle_open, set_recycle_open] = useState(false);
    const [recycle_dir, set_recycle_dir] = useState("");
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const [, setEditorSetting] = useAtom($stroe.editorSetting);


    const [tokenMode, setTokenMode] = useState(TokenTimeMode.close);
    const [tokenPersist, setTokenPersist] = useState(false);
    const [tokenSessionMode, setTokenSessionMode] = useState(TokenSessionMode.independent);
    const tip = using_tip();
    const [tokenSeconds, setTokenSeconds] = useState(undefined);
    // 环境控制原始文本
    const [control_env_str, set_control_env_str] = useState("");

    const {t, i18n} = useTranslation();
    // 三种登录会话模式的说明，点 info 按钮弹出
    const session_mode_tip = [
        t("独立token：每次登录都签发新的token，同一账号可以在多个设备同时登录，互不影响"),
        t("复用token：该账号已有未过期的token时直接复用它，不会签发新的"),
        t("单会话：每次登录签发新的token，并让该账号此前的所有token立即失效")
    ].join('\n');
    const [userInfo, setUserInfo] = useAtom($stroe.user_base_info);
    const {check_user_auth} = use_auth_check();

    const {initUserInfo} = useContext(GlobalContext);


    const set_recycle_save = async () => {
        if (recycle_open) {
            if (!recycle_dir) {
                NotyFail(t("目录不能为空"))
                return;
            }
        }
        const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {
            type: sys_setting_type.cyc,
            value: recycle_dir,
            open: recycle_open
        });
        if (result.code === RCode.Success) {
            NotySuccess(t("修改成功"))
        }
    }
    const getOpen = async () => {
        const all_open_result = await settingHttp.get("sys_option/status");
        if (all_open_result.code === RCode.Success) {
            set_recycle_open(all_open_result.data.recycle_open);
            set_recycle_dir(all_open_result.data.recycle_dir);
            const sys_env = all_open_result.data.sys_env;
            set_web_site_title(sys_env?.web_site_title);
            set_site_logo(sys_env?.logo || '');
            set_show_login_user_info(sys_env?.show_login_user_info);
            set_http_proxy(sys_env?.http_proxy || '');
            set_control_env_str(sys_env?.control_env_str || CONTROL_ENV_STR_DEFAULT);
        }
        const result1 = await settingHttp.get("token");
        if (result1.code === RCode.Success) {
            const data = result1.data as TokenSettingReq;
            if (!data) {
                return;
            }
            if (data['length']) {
                setTokenSeconds(data['length']);
            }
            if (data['mode']) {
                setTokenMode(data['mode']);
            }
            if (data['persist'] !== undefined) {
                setTokenPersist(data['persist']);
            }
            if (data['session_mode'] !== undefined) {
                setTokenSessionMode(data['session_mode']);
            }
        }
    }
    useEffect(() => {
        getOpen();
    }, []);

    // token 管理
    const tokenUpdate = async () => {
        const data = new TokenSettingReq();
        data.mode = tokenMode;
        data.persist = tokenPersist;
        data.session_mode = tokenSessionMode;
        if (TokenTimeMode.length === data.mode && !tokenSeconds) {
            NotyFail(t("秒数不能为空"))
        }
        data.length = parseInt(tokenSeconds);
        const result1 = await settingHttp.post("token/save", data);
        if (result1.code === RCode.Success) {
            NotySuccess(t("保存成功"))
        }
    }

    // 语言国际化
    // const switchLanguage = async () =>{
    //
    // }

    const tokenClearAll = async () => {
        const result1 = await settingHttp.get("token/clear");
        if (result1.code === RCode.Success) {
            NotySuccess(t("清理完成，重新登录"))
        }
    }
    const save_sys_env = async () => {
        const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {
            type: sys_setting_type.sys_env, value: {
                web_site_title,
                show_login_user_info,
                http_proxy,
                logo: site_logo
            }
        });
        if (result.code === RCode.Success) {
            NotySuccess(t("修改成功"))
        } else {
            return;
        }
        initUserInfo();
    }

    return <div>
        {/* 顶部状态栏（全宽，独立于内容，与项目其它页面保持一致：Header 在内容之上） */}
        <HeaderPortal>
                                <>
                            <span className={"credits"}>{t('系统运行于')}: {getShortTime(userInfo.runing_time_length)}</span>
                            <span className={"credits"}><a href="https://github.com/xiaobaidadada/filecat"
                                                           target="_blank">{`version:${process.env.version}`}{userInfo.latest_version != null && userInfo.latest_version !== process.env.version ? ` -> ${userInfo.latest_version}` : ''}</a></span>
                            <span className={"credits"}><a href={t("官网地址")} target="_blank">{`filecat ${t("功能文档")}`}</a></span>
                            <span className={"credits"}>{t("安装方式")} :{userInfo.process_env_run_env}</span>
                        </>
            </HeaderPortal>
        <Dashboard>
            <Row>


                <Column widthPer={33}>
                    <Card
                        self_title={<span className={" div-row "}><h2>{t("通用设置")}</h2> <ActionButton
                            icon={"info"} onClick={() => {
                            set_prompt_card({
                                open: true, title: t("信息"), context_div: (
                                    <div>
                                        <div>{t(`sys_env_setting_tip`)}</div>
                                    </div>
                                )
                            })
                        }} title={t("信息")}/></span>}
                        rightBottomCom={<ButtonText text={t('确定修改')} clickFun={save_sys_env}/>}
                        rightTopCom={<ActionButton icon={"tune"} title={t("环境控制")}
                                                   onClick={() => {
                                                       editor_data.set_value_temp(control_env_str || CONTROL_ENV_STR_DEFAULT);
                                                       setEditorSetting({
                                                           model: "ace/mode/yaml",
                                                           open: true,
                                                           fileName: "",
                                                           not_auto_save: true,// 这里比较敏感，禁止使用自动保存
                                                            save: async (context: string) => {
                                                                const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {
                                                                    type: sys_setting_type.sys_env,
                                                                    value: {control_env_str: context}
                                                                });
                                                                if (result.code === RCode.Success) {
                                                                    set_control_env_str(context);
                                                                    NotySuccess(t("修改成功"));
                                                                    getOpen();
                                                                } else {
                                                                    // 语法错误等保存失败要明确告知，否则用户以为存上了
                                                                    NotyFail(`${result.message ?? t("保存失败")}`);
                                                                }
                                                            }
                                                       });
                                                   }}/>}>

                        {t("网站标题")}
                        <InputText value={web_site_title} handleInputChange={(value) => {
                            set_web_site_title(value)
                        }}/>

                        {t("网站 Logo")}
                        <InputText placeholder={t('lclorur')} value={site_logo}
                                   handleInputChange={(value) => {
                                       set_site_logo(value)
                                   }}/>

                        {t("lgn_usr")}
                        <input
                            type="checkbox"
                            checked={show_login_user_info}
                            onChange={() => {
                                set_show_login_user_info(!show_login_user_info)
                            }}
                        />

                    </Card>
                    <BrowserProxyCard/>
                </Column>

                <Column widthPer={33}>
                    <Card
                        self_title={<span className={" div-row "}><h2>{t("文件回收站")}</h2> <ActionButton icon={"info"}
                                                                                                           onClick={() => {
                                                                                                               set_prompt_card({
                                                                                                                   open: true,
                                                                                                                   title: t("信息"),
                                                                                                                   context_div: (
                                                                                                                       <div>
                                                                                                                           {t(`格式：[被删除的文件所在父目录] 回收站目录 [; ...]`)}
                                                                                                                       </div>
                                                                                                                   )
                                                                                                               })
                                                                                                           }}
                                                                                                           title={t("信息")}/></span>}
                        rightBottomCom={<ButtonText text={t('确定修改')} clickFun={set_recycle_save}/>}>
                        <InputText placeholder={t('目录')} value={recycle_dir} handleInputChange={(value) => {
                            set_recycle_dir(value)
                        }}/>
                        <Select value={recycle_open} onChange={(value) => {
                            set_recycle_open(value)
                        }} options={[{title: t("开启"), value: true}, {title: t("关闭"), value: false}]}/>

                    </Card>
                    {/*<Card title={t("语言")} rightBottomCom={<ButtonText text={t('保存')} clickFun={switchLanguage}/>}>*/}

                    {/*</Card>*/}
                    <Card title={t("tk_exp")} rightBottomCom={<Rows isFlex={true} columns={[
                        <ButtonText text={t('清空token')} clickFun={tokenClearAll}/>,
                        <ButtonText text={t('保存')} clickFun={tokenUpdate}/>]}/>}>
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("关闭")} selected={tokenMode === TokenTimeMode.close}
                                        onchange={() => {
                                            setTokenMode(TokenTimeMode.close)
                                        }}/>,
                            <InputRadio value={1} context={t("指定时间")} selected={tokenMode === TokenTimeMode.length}
                                        onchange={() => {
                                            setTokenMode(TokenTimeMode.length)
                                        }}/>,
                            <InputRadio value={1} context={t("永不过期")} selected={tokenMode === TokenTimeMode.forver}
                                        onchange={() => {
                                            setTokenMode(TokenTimeMode.forver)
                                        }}/>
                        ]}/>
                        {tokenMode === TokenTimeMode.length &&
                            <InputText placeholder={t('秒')} value={tokenSeconds} handleInputChange={(value) => {
                                setTokenSeconds(value)
                            }}/>}
                        <div className="form_row">
                            <InputCheckbox context={t("持久化")} selected={tokenPersist}
                                           onchange={() => setTokenPersist(!tokenPersist)}/>
                        </div>
                        <div className="form_row">
                            <Rows isFlex={true} columns={[
                                <InputRadio value={TokenSessionMode.independent} context={t("独立token")}
                                            selected={tokenSessionMode === TokenSessionMode.independent}
                                            onchange={() => setTokenSessionMode(TokenSessionMode.independent)}/>,
                                <InputRadio value={TokenSessionMode.reuse} context={t("复用token")}
                                            selected={tokenSessionMode === TokenSessionMode.reuse}
                                            onchange={() => setTokenSessionMode(TokenSessionMode.reuse)}/>,
                                <InputRadio value={TokenSessionMode.single} context={t("单会话")}
                                            selected={tokenSessionMode === TokenSessionMode.single}
                                            onchange={() => setTokenSessionMode(TokenSessionMode.single)}/>,
                            ]}/>
                            <ActionButton icon={"info"} title={t("登录会话")} onClick={() => tip(session_mode_tip)}/>
                        </div>

                    </Card>
                </Column>
            </Row>
        </Dashboard>
    </div>
}
