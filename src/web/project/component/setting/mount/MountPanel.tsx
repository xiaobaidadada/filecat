import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {
    BaiduAccountRow,
    BAIDU_DRIVER,
    CredentialRow,
    credential_options,
    DEFAULT_COLOR,
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
    /** 删除前的二次确认 */
    const confirm_del = using_confirm();
    const [list, set_list] = useState<MountRow[]>([]);
    const [creds, set_creds] = useState<CredentialRow[]>([]);
    const [drivers, set_drivers] = useState<DriverMeta[]>([]);
    /** 百度已授权账号（选百度驱动时作为凭据来源） */
    const [baidu_accounts, set_baidu_accounts] = useState<BaiduAccountRow[]>([]);

    /**
     * 表单是否展开（新建或编辑中）。
     * 未展开时只展示列表，输入框和操作按钮都隐藏，
     * 避免用户看到常驻的「保存」却不知道在保存什么。
     */
    const [editing, set_editing] = useState(false);
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
    const cred_options = (drv: string) => credential_options(drv, creds, baidu_accounts);

    /** 关闭表单并清空（新增完成后、切换编辑对象时用） */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_driver("webdav");
        set_mount_path("");
        set_credential_id("");
        set_root_dir("");
        set_name("");
    };

    /** 点标题栏的「+」开始新增 */
    const start_add = () => {
        close_form();
        set_editing(true);
    };

    const edit = (item: MountRow) => {
        set_editing(true);
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
            NotyFail(t("munt_rq"));
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
            close_form();
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const del = async (item: MountRow) => {
        confirm_del({
            title: t("确认删除"),
            sub_title: item.mount_path,
            confirm_fun: async () => {
                try {
                    await mountHttp.post("delete", {id: item.id});
                    NotySuccess(t("已删除"));
                    await load();
                } catch (e) {
                    // Http 层已提示
                }
            },
        });
    };

    const driver_name = (v: string) => drivers.find(d => d.type === v)?.name ?? v;

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("挂载列表")}</h2></span>}
              rightBottomCom={<div>
                  {/* 未展开表单时只显示「+」开始新增；展开后显示测试、保存与取消 */}
                  {!editing && <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>}
                  {editing && <ActionButton icon={"network_check"} title={t("测试连接")} onClick={test}/>}
                  {editing && <ActionButton icon={"save"} title={t("保存")} onClick={save}/>}
                  {editing && <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>}
              </div>}>

            {/* 表单只在新增/编辑时展开 */}
            {editing && <React.Fragment>
                <InputRow label={t("挂载类型")} label_width={"6rem"}>
                    <Select value={driver}
                            options={drivers.map(d => ({title: d.name, value: d.type}))}
                            onChange={(v) => {
                                set_driver(v);
                                // 换类型时清掉已选凭据（类型可能不匹配）
                                set_credential_id("");
                            }}/>
                </InputRow>
                <InputRow label={t("凭据")} label_width={"6rem"} required>
                    <Select value={credential_id} options={cred_options(driver)}
                            onChange={set_credential_id}/>
                </InputRow>
                <InputRow label={t("本地目录")} label_width={"6rem"} required>
                    <InputText placeholder={t("被挂载的本地绝对路径")} value={mount_path}
                               handleInputChange={set_mount_path}/>
                </InputRow>
                {/* 起始目录决定读到远端哪个子目录，属于数据来源；显示名称只是列表上的标签 */}
                <InputRow label={t("strtdrt")} label_width={"6rem"}>
                    <InputText placeholder={t("远端目录")} value={root_dir}
                               handleInputChange={set_root_dir}/>
                </InputRow>
                <InputRow label={t("dspnmtp")} label_width={"6rem"}>
                    <InputText placeholder={t("列表显示的名称")} value={name}
                               handleInputChange={set_name}/>
                </InputRow>
            </React.Fragment>}

            {/* 列表只在未展开表单时显示，避免编辑中误点其它行的操作按钮 */}
            {!editing && <Table headers={[t("名称"), t("挂载类型"), t("凭据"), t("操作")]}
                   rows={list.map(item => {
                       const cred = creds.find(c => c.id === item.credential_id);
                       // 百度账号：凭据名从授权账号列表里取
                       const baidu = item.driver === BAIDU_DRIVER
                           ? baidu_accounts.find(a => String(a.uk) === String(item.credential_id))
                           : undefined;
                       return [
                           <p>{item.name}</p>,
                           <p>{driver_name(item.driver)}</p>,
                           <p>{baidu
                               ? (baidu.name || baidu.baidu_name || String(baidu.uk))
                               : (cred ? cred.name : t("凭据已丢失"))}</p>,
                           <div>
                               <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                               <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                           </div>,
                       ];
                   })}/>}
        </Card>
    );
}
