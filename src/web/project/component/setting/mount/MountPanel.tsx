import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card, CardFull, TextTip} from "../../../../meta/component/Card";
import {Column, Dashboard, Row} from "../../../../meta/component/Dashboard";
import {ActionButton} from "../../../../meta/component/Button";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import MountForm, {empty_mount_form, MountFormValue} from "./MountForm";
import {
    CredentialRow,
    need_account_of,
    DEFAULT_COLOR,
    DRIVER_META_LIST,
    MountRow,
} from "./mount_common";

/**
 * 挂载列表。
 * 卡片上方平铺输入框新增挂载，下方表格列出已有挂载。
 * 凭据来源统一是「凭证管理」里对应类型的凭据。
 */
export default function MountPanel() {
    const {t} = useTranslation();
    /** 删除前的二次确认 */
    const confirm_del = using_confirm();
    const [list, set_list] = useState<MountRow[]>([]);
    const [creds, set_creds] = useState<CredentialRow[]>([]);

    /**
     * 表单是否展开（新建或编辑中）。
     * 未展开时只展示列表，输入框和操作按钮都隐藏，
     * 避免用户看到常驻的「保存」却不知道在保存什么。
     */
    const [editing, set_editing] = useState(false);
    /** 表单：id 为空表示新增 */
    const [id, set_id] = useState("");
    const [form, set_form] = useState<MountFormValue>(empty_mount_form());

    const load = async () => {
        try {
            const [m, c] = await Promise.all([
                mountHttp.post("list", {}),
                mountHttp.post("credential/list", {}),
            ]);
            set_list(Array.isArray(m?.data) ? m.data : []);
            set_creds(Array.isArray(c?.data) ? c.data : []);
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        load();
    }, []);

    /**
     * 当前凭据是否需要再选账号。
     * 只有「一凭据多账号」的凭据（百度、内网穿透）才有 accounts，其余凭据不需要。
     */
    const need_account = need_account_of(form.credential_id, creds);

    /** 关闭表单并清空（新增完成后、切换编辑对象时用） */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_form(empty_mount_form());
    };

    /** 点标题栏的「+」开始新增 */
    const start_add = () => {
        close_form();
        set_editing(true);
    };

    const edit = (item: MountRow) => {
        set_editing(true);
        set_id(item.id);
        set_form({
            driver: item.driver,
            mount_path: item.mount_path ?? "",
            credential_id: item.credential_id ?? "",
            account_id: item.account_id ?? "",
            root_dir: item.root_dir ?? "",
            note: item.note ?? "",
            color: item.color ?? DEFAULT_COLOR,
            readonly: Boolean(item.readonly),
            forward_to_remote: Boolean(item.forward_to_remote),
        });
    };

    const test = async () => {
        if (!form.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        try {
            const rsq = await mountHttp.post("test", {
                id: id || undefined,
                driver: form.driver,
                credential_id: form.credential_id,
                account_id: form.account_id,
                root_dir: form.root_dir,
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
        if (!form.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        if (need_account && !form.account_id) {
            NotyFail(t("请选择账号"));
            return;
        }
        if (!form.mount_path.trim()) {
            NotyFail(t("munt_rq"));
            return;
        }
        try {
            await mountHttp.post(id ? "update" : "add", {
                id: id || undefined,
                driver: form.driver,
                mount_path: form.mount_path,
                credential_id: form.credential_id,
                account_id: need_account ? form.account_id : undefined,
                root_dir: form.root_dir,
                note: form.note,
                color: form.color,
                readonly: form.readonly,
                enabled: true,
                // 非内网穿透驱动不支持转发，切走时显式置 false，避免残留脏值
                forward_to_remote: form.driver === "tcp_proxy" && Boolean(form.forward_to_remote),
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

    const driver_name = (v: string) => DRIVER_META_LIST.find(d => d.type === v)?.name ?? v;

    return (<Row>
        {/* 左侧：挂载列表 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("网盘挂载")}</h2></span>}
                          rightTopCom={<div className={"div-row"}>
                              <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>
                          </div>}>
                    <Table headers={[t("编号"),t("备注"), t("挂载类型"), t("凭据"), t("账号"), t("操作")]}
                           rows={list.map((item,index) => {
                               const cred = creds.find(c => c.id === item.credential_id);
                               const acc = (cred?.accounts ?? []).find(a => a.id === item.account_id);
                               return [
                                   <span>{index}</span>,
                                   <TextTip context={item.note || "-"}/>,
                                   <p>{driver_name(item.driver)}</p>,
                                   <TextTip context={cred ? cred.note : t("凭据已丢失")}/>,
                                   <TextTip context={item.account_id ? (acc ? (acc.note || acc.account_name || acc.nickname || acc.id) : t("账号已丢失")) : "-"}/>,
                                   <div>
                                       <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                       <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                                   </div>,
                               ];
                           })}/>
                </CardFull>
            </Dashboard>
        </Column>

        {/* 右侧：添加/编辑面板 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            {editing && <Dashboard>
                <Card self_title={<span className={" div-row "}>
                    <h2>{t(id ? "编辑" : "添加")}</h2></span>}
                      rightBottomCom={<div>
                          <ActionButton icon={"network_check"} title={t("测试连接")} onClick={test}/>
                          <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
                          <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                      </div>}>
                <MountForm value={form} onChange={set_form} creds={creds}/>
                </Card>
            </Dashboard>}
        </Column>
    </Row>);
}
