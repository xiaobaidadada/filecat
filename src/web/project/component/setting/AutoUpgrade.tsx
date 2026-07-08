import React, {useEffect, useState} from 'react'
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {AutoUpgradeSettingReq} from "../../../../common/req/setting.req";
import {useTranslation} from "react-i18next";
import {NotyFail, NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {useAtom} from "jotai/index";
import {$stroe} from "../../util/store";

export function AutoUpgrade() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();
    
    const [open, setOpen] = useState(false);
    const [versionCheckUrl, setVersionCheckUrl] = useState('https://registry.npmjs.org');
    const [exeDownloadUrl, setExeDownloadUrl] = useState('');
    const [checkInterval, setCheckInterval] = useState(180);
    const [upgrading, setUpgrading] = useState(false);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);

    const runEnv = process.env.run_env as string || 'npm';
    
    const fetchSetting = async () => {
        const result = await settingHttp.get("auto_upgrade_setting");
        if (result.code === RCode.Success) {
            const data = result.data as AutoUpgradeSettingReq;
            setOpen(data.open || false);
            setVersionCheckUrl(data.version_check_url || 'https://registry.npmjs.org');
            setExeDownloadUrl(data.exe_download_url || '');
            setCheckInterval(data.check_interval_seconds || 180);
        }
    };
    
    useEffect(() => {
        fetchSetting();
    }, []);
    
    const saveSetting = async () => {
        if (!versionCheckUrl) {
            NotyFail(t("版本检测地址不能为空"));
            return;
        }
        if (open && (!checkInterval || checkInterval < 10)) {
            NotyFail(t("检测间隔不能小于10秒"));
            return;
        }
        const req = new AutoUpgradeSettingReq();
        req.open = open;
        req.version_check_url = versionCheckUrl;
        req.exe_download_url = exeDownloadUrl;
        req.check_interval_seconds = checkInterval;
        const result = await settingHttp.post("auto_upgrade_setting/save", req);
        if (result.code === RCode.Success) {
            NotySuccess(t("保存成功"));
        }
    };

    const upgradeNow = async () => {
        setUpgrading(true);
        try {
            const result = await settingHttp.post("auto_upgrade_setting/upgrade_now", {});
            if (result.code === RCode.Success) {
                NotySuccess(t("已触发升级检测，请查看服务端日志"));
            }
        } catch (e) {
            NotyFail(t("触发升级失败"));
        } finally {
            setUpgrading(false);
        }
    };
    
    if (!check_user_auth(UserAuth.sys_setting_page)) {
        return null;
    }
    
    return <Card
                 self_title={
                     <span className={" div-row "}>
                         <h2>
                             {t("自动升级")}
                         </h2>
                         <ActionButton icon={"info"} onClick={()=>{
                             set_prompt_card({open:true,title:"信息",context_div : (
                                     <div >
                                         {t(`自动升级在 windows 下目前可能不稳定`)}
                                     </div>
                                 )})
                         }} title={"信息"}/>
                     </span>
        }
                 rightBottomCom={<ButtonText text={t('保存')} clickFun={saveSetting}/>}>
        {/* 版本检测地址：始终显示 */}
        <div>{t("系统版本检测地址")}</div>
        <InputText 
            placeholder={'https://registry.npmjs.org'} 
            value={versionCheckUrl} 
            handleInputChange={(value) => { setVersionCheckUrl(value); }} 
        />

        {/* 开启/关闭开关 */}
        <Select 
            value={open} 
            onChange={(value) => { setOpen(value); }} 
            options={[{title: t("开启"), value: true}, {title: t("关闭"), value: false}]} 
        />
        {open && <>
            {runEnv === 'exe' && (
                <div>
                    <div>{t("exe 下载地址模板")}</div>
                    <InputText 
                        placeholder={t('留空使用官方 GitHub Releases')} 
                        value={exeDownloadUrl} 
                        handleInputChange={(value) => { setExeDownloadUrl(value); }} 
                    />
                </div>
            )}
            <div>{t("检测频率（秒）")}</div>
            <InputText 
                placeholder={t('默认180秒（3分钟）')} 
                value={checkInterval} 
                handleInputChange={(value) => { setCheckInterval(Number(value) || 180); }} 
            />
            {/* 立即升级按钮 */}
            <div style={{ marginTop: '12px' }}>
                <ButtonText 
                    text={upgrading ? t("升级检测中...") : t("立即升级")} 
                    clickFun={upgradeNow}
                />
            </div>
        </>}
    </Card>;
}
