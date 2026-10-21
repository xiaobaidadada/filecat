import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../util/store";
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputText, InputTextarea} from "../../../meta/component/Input";
import {Rows} from "../../../meta/component/Table";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {sys_setting_type} from "../../../../common/req/setting.req";
import {NotySuccess} from "../../util/noty";
import {Http_controller_router} from "../../../../common/req/http_controller_router";

/**
 * 网页代理（WebVPN）设置 card。
 *
 * 包含：目标访问白名单 + 端口模式使用的端口范围。
 * 只提交自己负责的字段（后端 set_sys_env 为合并语义），不与通用设置互相覆盖。
 */
export default function BrowserProxyCard() {
    const {t} = useTranslation();
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    // 目标访问白名单，多行文本：每行一条（CIDR / 精确 IP / 精确域名）
    const [allow_text, set_allow_text] = useState("");
    // 端口模式自动分配用的端口范围
    const [port_start, set_port_start] = useState(5610);
    const [port_end, set_port_end] = useState(5710);

    const load = async () => {
        const rsq = await settingHttp.get("sys_option/status");
        if (rsq.code === RCode.Success) {
            const sys_env = rsq.data?.sys_env;
            set_allow_text((sys_env?.browser_proxy_allow || []).join('\n'));
            set_port_start(sys_env?.browser_proxy_port_start || 5610);
            set_port_end(sys_env?.browser_proxy_port_end || 5710);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const save = async () => {
        // 白名单按行解析，去掉空行与首尾空白
        const browser_proxy_allow = allow_text
            .split('\n')
            .map(v => v.trim())
            .filter(v => !!v);
        const result = await settingHttp.post(Http_controller_router.setting_sys_option_status_save, {
            type: sys_setting_type.sys_env,
            value: {
                browser_proxy_allow,
                browser_proxy_port_start: Number(port_start) || 5610,
                browser_proxy_port_end: Number(port_end) || 5710
            }
        });
        if (result.code === RCode.Success) {
            NotySuccess(t("修改成功"));
        }
    };

    const info_click = () => {
        set_prompt_card({
            open: true,
            title: t("信息"),
            context_div: (
                <div>
                    <div>{t(`wbvpn_tip`)}</div>
                </div>
            ),
        });
    };

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("网页代理")}</h2>
            <ActionButton icon={"info"} title={t("信息")} onClick={info_click}/></span>}
              rightBottomCom={<ButtonText text={t('确定修改')} clickFun={save}/>}>

            <div>{t("wbvpn_allow")}</div>
            <InputTextarea
                style={{minHeight: '5rem', resize: 'vertical'}}
                placeholder={t('wbvpn_allow_ph')}
                value={allow_text}
                onChange={(e) => {
                    set_allow_text(e.target.value)
                }}
            />

            <div>{t("wbvpn_port_range")}</div>
            <Rows isFlex={true} columns={[
                <InputText placeholder={'5610'} value={port_start}
                           handleInputChange={(value) => set_port_start(value)}/>,
                <span style={{padding: '0 6px'}}>-</span>,
                <InputText placeholder={'5710'} value={port_end}
                           handleInputChange={(value) => set_port_end(value)}/>
            ]}/>
        </Card>
    );
}
