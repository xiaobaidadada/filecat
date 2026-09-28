import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {
    BaiduAccountRow,
    BAIDU_DRIVER,
    CredentialRow,
    DEFAULT_COLOR,
    DRIVER_CREDENTIAL_TYPE,
    DriverMeta,
    MountRow,
} from "./mount_common";

/**
 * 挂载列表。
 * 卡片上方平铺输入框新增挂载，下方表格列出已有挂载。
 *
 * 凭据来源分两种：
 *  · 百度网盘 → 直接用「百度网盘」面板里已授权的账号（不需要凭据）
 *  · 其他驱动 → 用「普通凭据管理」里对应类型的凭据
 */
export default function MountPanel() {
    const {t} = useTranslation();
    const [list, set_list] = useState<MountRow[]>([]);
    const [creds, set_creds] = useState<CredentialRow[]>([]);
    const [drivers, set_drivers] = useState<DriverMeta[]>([]);
    /** 百度已授权账号（选百度驱动时作为凭据来源） */
    const [baidu_accounts, set_baidu_accounts] = useState<BaiduAccountRow[]>([]);

    /** 表单：id 为空表示新增 */
    const [id, set_id] = useState("");
    const [driver, set_driver] = useState("webdav");
    const [mount_path, set_mount_path] = useState("");
    const [credential_id, set_credential_id] = useState("");
    const [root_dir, set_root_dir] = useState("");
    const [name, set_name] = useState("");

    const load = async () => {
        try {
            const [m, c, d, b] = await Promise.all([
                mountHttp.post("list", {}),
                mountHttp.post("credential/list", {}),
                mountHttp.post("driver/list", {}),
                mountHttp.post("baidu/app/get", {}),
            ]);
            set_list(Array.isArray(m?.data) ? m.data : []);
            set_creds(Array.isArray(c?.data) ? c.data : []);
            set_drivers(Array.isArray(d?.data) ? d.data : []);
            set_baidu_accounts(Array.isArray(b?.data?.accounts) ? b.data.accounts : []);
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        load();
    }, []);

    /** 当前驱动类型可选的凭据来源 */
    const cred_options = (drv: string) => {
        // 百度：直接用已授权的百度账号（value 用 uk，后端按账号解析）
        if (drv === BAIDU_DRIVER) {
            return baidu_accounts.map(a => ({
                title: a.name || a.baidu_name || String(a.uk),
                value: String(a.uk),
            }));
        }
        const need = DRIVER_CREDENTIAL_TYPE[drv];
        return creds.filter(c => !need || c.type === need).map(c => ({title: c.name, value: c.id}));
    };

    const reset = () => {
        set_id("");
        set_driver("webdav");
        set_mount_path("");
        set_credential_id("");
        set_root_dir("");
        set_name("");
    };

    const edit = (item: MountRow) => {
        set_id(item.id);
        set_driver(item.driver);
        set_mount_path(item.mount_path ?? "");
        set_credential_id(item.credential_id ?? "");
        set_root_dir(item.root_dir ?? "");
        set_name(item.name ?? "");
    };

    const test = async () => {
        if (!credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        try {
            const rsq = await mountHttp.post("test", {
                id: id || undefined,
                driver,
                credential_id,
                root_dir,
            });
            const r = rsq?.data;
            if (r?.ok) {
                NotySuccess(`${t("连接成功")}（${r.count ?? 0}）`);
            } else {
                NotyFail(`${t("连接失败")}：${r?.error ?? ""}`);
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    const save = async () => {
        if (!credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        if (!mount_path.trim()) {
            NotyFail(t("挂载目录不能为空"));
            return;
        }
        try {
            await mountHttp.post(id ? "update" : "add", {
                id: id || undefined,
                driver,
                mount_path,
                credential_id,
                root_dir,
                name,
                color: DEFAULT_COLOR,
                readonly: false,
                enabled: true,
            });
            NotySuccess(t("保存成功"));
            reset();
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const del = async (item: MountRow) => {
        try {
            await mountHttp.post("delete", {id: item.id});
            NotySuccess(t("已删除"));
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const driver_name = (v: string) => drivers.find(d => d.type === v)?.name ?? v;

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("挂载列表")}</h2></span>}
              rightBottomCom={<div>
                  <ActionButton icon={"cancel"} title={t("取消")} onClick={reset}/>
                  <ActionButton icon={"network_check"} title={t("测试连接")} onClick={test}/>
                  <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
              </div>}>

            {/* 挂载总开关在顶部 Header 上，这里不再重复放置 */}

            <Select value={driver}
                    options={drivers.map(d => ({title: d.name, value: d.type}))}
                    onChange={(v) => {
                        set_driver(v);
                        // 换类型时清掉已选凭据（类型可能不匹配）
                        set_credential_id("");
                    }}/>
            <Select value={credential_id} options={cred_options(driver)}
                    onChange={set_credential_id}/>
            <InputText placeholder={t("本地目录")} value={mount_path}
                       handleInputChange={set_mount_path}/>
            <InputText placeholder={t("起始目录，留空表示根目录")} value={root_dir}
                       handleInputChange={set_root_dir}/>
            <InputText placeholder={t("显示名称，留空则使用目录名")} value={name}
                       handleInputChange={set_name}/>

            <Table headers={[t("本地目录"), t("挂载类型"), t("凭据"), t("操作")]}
                   rows={list.map(item => {
                       const cred = creds.find(c => c.id === item.credential_id);
                       // 百度账号：凭据名从授权账号列表里取
                       const baidu = item.driver === BAIDU_DRIVER
                           ? baidu_accounts.find(a => String(a.uk) === String(item.credential_id))
                           : undefined;
                       return [
                           <p>{item.name || item.mount_path}</p>,
                           <p>{driver_name(item.driver)}</p>,
                           <p>{baidu
                               ? (baidu.name || baidu.baidu_name || String(baidu.uk))
                               : (cred ? cred.name : t("凭据已丢失"))}</p>,
                           <div>
                               <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                               <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                           </div>,
                       ];
                   })}/>
        </Card>
    );
}
