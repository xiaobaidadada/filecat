import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, TextTip} from "../../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../../meta/component/Button";
import {InputRadio, InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {baidu_auth_mode_options, fmt_time, mount_enable_options} from "./mount_common";

/** 百度应用配置 */
interface BaiduApp {
    name: string;
    app_id: string;
    app_key: string;
    configured: boolean;
    redirect_uri: string;
    /** 授权方式：一键授权（自动跳回）/ 手动授权（粘贴授权码） */
    auth_mode: "one_click" | "oob";
    remark: string;
    enabled: boolean;
    auto_refresh: boolean;
}

/** 百度授权账号（脱敏） */
interface BaiduAccount {
    uk: number;
    name: string;
    baidu_name?: string;
    remark?: string;
    enabled: boolean;
    authorized: boolean;
    expired: boolean;
    created_at: number;
}

interface Props {
    /** 账号变化后通知父组件刷新凭据列表 */
    on_credential_change: () => void;
}

/**
 * 百度网盘：应用配置 + 授权账号。
 * 上方平铺输入框填应用配置，下方表格列账号。
 */
export default function BaiduPanel({on_credential_change}: Props) {
    const {t} = useTranslation();
    /** 删除前的二次确认 */
    const confirm_del = using_confirm();
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [app, set_app] = useState<BaiduApp | null>(null);
    const [list, set_list] = useState<BaiduAccount[]>([]);

    /** 应用配置表单 */
    const [name, set_name] = useState("百度网盘");
    const [app_id, set_app_id] = useState("");
    const [app_key, set_app_key] = useState("");
    const [secret_key, set_secret_key] = useState("");
    // 授权方式：一键授权走回调自动跳回；手动授权在百度页面复制 code 回来粘贴
    const [auth_mode, set_auth_mode] = useState<"one_click" | "oob">("oob");
    const [enabled, set_enabled] = useState(true);
    const [auto_refresh, set_auto_refresh] = useState(true);

    /** 是否手动授权（决定授权区显示哪种操作） */
    const is_oob = auth_mode === "oob";

    /** 应用配置表单是否展开（未展开时只展示账号列表） */
    const [editing_app, set_editing_app] = useState(false);
    /** 授权流程面板是否展开（与「应用配置」独立，互不干扰） */
    const [authorizing, set_authorizing] = useState(false);

    /** 授权码（手动授权时粘贴用） */
    const [code, set_code] = useState("");

    const load = async () => {
        try {
            const rsq = await mountHttp.post("baidu/app/get", {});
            const a: BaiduApp | null = rsq?.data?.app ?? null;
            set_app(a);
            set_list(rsq?.data?.accounts ?? []);
            set_name(a?.name ?? "百度网盘");
            set_app_id(a?.app_id ?? "");
            set_app_key(a?.app_key ?? "");
            set_auth_mode(a?.auth_mode === "one_click" ? "one_click" : "oob");
            set_enabled(a?.enabled !== false);
            set_auto_refresh(a?.auto_refresh !== false);
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        load();
        // 一键授权跳回来时会带上 baidu_auth 参数
        const params = new URLSearchParams(window.location.search);
        const auth = params.get("baidu_auth");
        if (auth === "success") {
            NotySuccess(`${t("授权成功")}：${params.get("name") ?? ""}`);
            on_credential_change();
        } else if (auth === "failed") {
            NotyFail(`${t("授权失败")}：${params.get("reason") ?? ""}`);
        }
        if (auth) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, []);

    const save_app = async () => {
        if (!app_key.trim()) {
            NotyFail(t("rqappky"));
            return;
        }
        if (!app?.configured && !secret_key.trim()) {
            NotyFail(t("rq_scrt"));
            return;
        }
        try {
            await mountHttp.post("baidu/app/save", {
                name, app_id, app_key, secret_key, auth_mode,
                remark: app?.remark ?? "",
                enabled, auto_refresh,
            });
            NotySuccess(t("保存成功"));
            set_secret_key("");
            set_editing_app(false);
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 取授权链接并打开 */
    const open_authorize = async () => {
        if (!app?.configured) {
            NotyFail(t("svappfr"));
            return;
        }
        try {
            const rsq = await mountHttp.post("baidu/authorize_url", {mode: auth_mode});
            if (rsq?.data) {
                window.open(rsq.data, "_blank", "noopener,noreferrer");
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 用授权码完成授权（模式跟随授权方式，否则百度会报 redirect_uri 不一致） */
    const exchange = async () => {
        if (!code.trim()) {
            NotyFail(t("请填写授权码"));
            return;
        }
        try {
            const rsq = await mountHttp.post("baidu/exchange", {
                code: code.trim(),
                mode: auth_mode,
            });
            NotySuccess(`${t("授权成功")}：${rsq?.data?.baidu_name ?? ""}`);
            set_code("");
            set_authorizing(false);
            await load();
            on_credential_change();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 授权说明（长文案收进弹框，避免撑乱页面布局） */
    const show_auth_tip = () => {
        set_prompt_card({
            open: true,
            title: t("信息"),
            context_div: (
                <ul>
                    <li>{t("atathtp")}</li>
                    <li>{t("atathnt")}</li>
                    <li>{t("pstatht")}</li>
                </ul>
            ),
        });
    };

    const del = async (item: BaiduAccount) => {
        confirm_del({
            title: t("确认删除"),
            sub_title: item.name,
            confirm_fun: async () => {
                try {
                    await mountHttp.post("baidu/delete", {uk: item.uk});
                    NotySuccess(t("已删除"));
                    await load();
                    on_credential_change();
                } catch (e) {
                    // Http 层已提示
                }
            },
        });
    };

    const deauthorize = async (item: BaiduAccount) => {
        try {
            await mountHttp.post("baidu/deauthorize", {uk: item.uk});
            NotySuccess(t("已取消授权"));
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 单个授权检测 */
    const verify = async (item: BaiduAccount) => {
        try {
            const rsq = await mountHttp.post("baidu/verify", {uk: item.uk});
            if (rsq?.data?.valid) {
                NotySuccess(t("账号可用"));
            } else {
                NotyFail(`${t("账号不可用")}：${rsq?.data?.error ?? ""}`);
            }
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 批量授权检测/刷新 */
    const verify_all = async () => {
        try {
            await mountHttp.post("baidu/verify/all", {});
            NotySuccess(t("检测完成"));
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const toggle = async (item: BaiduAccount) => {
        try {
            await mountHttp.post("baidu/account/update", {uk: item.uk, enabled: !item.enabled});
            await load();
            on_credential_change();
        } catch (e) {
            // Http 层已提示
        }
    };

    const rename = async (item: BaiduAccount, v: string) => {
        try {
            await mountHttp.post("baidu/account/update", {uk: item.uk, name: v});
            on_credential_change();
        } catch (e) {
            // Http 层已提示
        }
    };

    const status_text = (a: BaiduAccount): string => {
        if (!a.authorized) {
            return t("未授权");
        }
        return a.expired ? t("已过期") : t("已授权");
    };

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("百度网盘")}</h2>
            <ActionButton icon={"info"} title={t("信息")} onClick={show_auth_tip}/>
        </span>}
              rightBottomCom={<div>
                  {!editing_app && <ActionButton icon={"apps"} title={t("应用配置")}
                                                onClick={() => set_editing_app(true)}/>}
                  {editing_app && <ActionButton icon={"save"} title={t("保存应用配置")} onClick={save_app}/>}
                  {editing_app && <ActionButton icon={"cancel"} title={t("取消")}
                                                onClick={() => set_editing_app(false)}/>}
                  {!editing_app && <ActionButton icon={"key"} title={t("授权")}
                                                onClick={() => set_authorizing(true)}/>}
                  <ActionButton icon={"refresh"} title={t("授权检测/刷新")} onClick={verify_all}/>
              </div>}>

            {editing_app && <React.Fragment>
            <InputText placeholder={t("名称")} value={name} handleInputChange={set_name}/>
            <InputText placeholder={"AppID"} value={app_id} handleInputChange={set_app_id}/>
            <InputText placeholder={"AppKey"} value={app_key} handleInputChange={set_app_key}/>
            <InputText type={"password"}
                       placeholder={app?.configured ? t("scrtkep") : "SecretKey"}
                       value={secret_key} handleInputChange={set_secret_key}/>
            <InputRow label={t("授权方式")} label_width={"6rem"}>
                <Select value={auth_mode} options={baidu_auth_mode_options(t)}
                        onChange={(v) => set_auth_mode(v === "one_click" ? "one_click" : "oob")}/>
            </InputRow>
            <InputRow label={t("网盘使用")} label_width={"6rem"}>
                <Select value={enabled} options={mount_enable_options(t)} onChange={set_enabled}/>
            </InputRow>
            <InputRow label={t("atrfrsh")} label_width={"6rem"}>
                <Select value={auto_refresh} options={mount_enable_options(t)} onChange={set_auto_refresh}/>
            </InputRow>
            </React.Fragment>}

            {/* 授权流程：独立面板，由标题栏的「授权」按钮打开 */}
            {authorizing && <React.Fragment>
                <InputRow label={t("授权方式")} label_width={"6rem"}>
                    <div className={"div-row"}>
                        <InputRadio value={"one_click"} context={t("一键授权")}
                                    name={"baidu_auth_mode"}
                                    selected={auth_mode === "one_click"}
                                    onchange={() => set_auth_mode("one_click")}/>
                        <InputRadio value={"oob"} context={t("outh_ob")}
                                    name={"baidu_auth_mode"}
                                    selected={auth_mode === "oob"}
                                    onchange={() => set_auth_mode("oob")}/>
                    </div>
                </InputRow>

                {/* 手动授权需要把百度页面拿到的 code 贴回来换 token */}
                {is_oob && <InputText placeholder={t("pst_cd")} value={code}
                                      handleInputChange={set_code}/>}

                {/* 操作按钮横排居中 */}
                <div className={"div-row mount-actions"}>
                    <ButtonText text={is_oob ? t("去授权（手动）") : t("去授权（一键）")}
                                clickFun={open_authorize}/>
                    {is_oob && <ButtonText text={t("完成授权")} clickFun={exchange}/>}
                    <ButtonText text={t("取消")} clickFun={() => set_authorizing(false)}/>
                </div>
            </React.Fragment>}

            {/* 账号列表只在两个面板都收起时显示 */}
            {!editing_app && !authorizing && <Table headers={[t("账号名"), t("百度账号"), t("授权状态"), t("使用"), t("授权时间"), t("操作")]}
                   rows={list.map(item => [
                       <InputText value={item.name} no_border={true}
                                  handleInputChange={(v) => rename(item, v)}/>,
                       <TextTip  context={item.baidu_name || "-"}/>,
                       <TextTip  context={status_text(item)}/>,
                       <Select value={item.enabled} no_border={true} options={mount_enable_options(t)}
                               onChange={() => toggle(item)}/>,
                       <p>{fmt_time(item.created_at)}</p>,
                       <div>
                           <ActionButton icon={"network_check"} title={t("授权检测")}
                                         onClick={() => verify(item)}/>
                           <ActionButton icon={"link_off"} title={t("取消授权")}
                                         onClick={() => deauthorize(item)}/>
                           <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                       </div>,
                   ])}/>}
        </Card>
    );
}
