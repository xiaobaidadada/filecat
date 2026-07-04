import React, {useEffect, useState} from 'react'
import {Card} from "../../../meta/component/Card";
import {ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {AutoUpgradeSettingReq} from "../../../../common/req/setting.req";
import {useTranslation} from "react-i18next";
import {NotyFail, NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";

export function AutoUpgrade() {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();
    
    const [open, setOpen] = useState(false);
    const [npmRegistry, setNpmRegistry] = useState('');
    const [exeDownloadUrl, setExeDownloadUrl] = useState('');
    const [checkInterval, setCheckInterval] = useState(180);
    
    // 获取安装方式
    const runEnv = process.env.run_env as string || 'npm'; // 默认 npm
    
    const fetchSetting = async () => {
        const result = await settingHttp.get("auto_upgrade_setting");
        if (result.code === RCode.Success) {
            const data = result.data as AutoUpgradeSettingReq;
            setOpen(data.open || false);
            setNpmRegistry(data.npm_registry || '');
            setExeDownloadUrl(data.exe_download_url || '');
            setCheckInterval(data.check_interval_seconds || 180);
        }
    };
    
    useEffect(() => {
        fetchSetting();
    }, []);
    
    const saveSetting = async () => {
        if (open && (!checkInterval || checkInterval < 10)) {
            NotyFail(t("检测间隔不能小于10秒"));
            return;
        }
        const req = new AutoUpgradeSettingReq();
        req.open = open;
        req.npm_registry = npmRegistry;
        req.exe_download_url = exeDownloadUrl;
        req.check_interval_seconds = checkInterval;
        const result = await settingHttp.post("auto_upgrade_setting/save", req);
        if (result.code === RCode.Success) {
            NotySuccess(t("保存成功"));
        }
    };
    
    if (!check_user_auth(UserAuth.sys_setting_page)) {
        return null;
    }
    
    return <Card title={t("自动升级")} rightBottomCom={<ButtonText text={t('保存')} clickFun={saveSetting}/>}>
        <Select 
            value={open} 
            onChange={(value) => { setOpen(value); }} 
            options={[{title: t("开启"), value: true}, {title: t("关闭"), value: false}]} 
        />
        {open && <>
            {runEnv === 'npm' ? (
                <div>
                    <div>{t("npm 镜像地址")}</div>
                    <InputText 
                        placeholder={t('留空使用官方 registry.npmjs.org')} 
                        value={npmRegistry} 
                        handleInputChange={(value) => { setNpmRegistry(value); }} 
                    />
                </div>
            ) : (
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
        </>}
    </Card>;
}
