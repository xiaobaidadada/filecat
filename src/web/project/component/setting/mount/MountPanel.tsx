import RemotePathPicker from "./RemotePathPicker";
import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card, CardFull, TextTip} from "../../../../meta/component/Card";
import {Column, Dashboard, Row} from "../../../../meta/component/Dashboard";
import {ActionButton} from "../../../../meta/component/Button";
import Switch from "../../../../meta/component/Button";
import {InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {
    CredentialRow,
    LocalSourceRow,
    credential_options,
    account_options,
    need_account_of,
    DEFAULT_COLOR,
    DriverMeta,
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
    const [drivers, set_drivers] = useState<DriverMeta[]>([]);

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
    const [account_id, set_account_id] = useState("");
    const [root_dir, set_root_dir] = useState("");
    const [note, set_note] = useState("");
    /** 转发到对端：仅内网穿透（tcp_proxy）挂载可开 */
    const [forward_to_remote, set_forward_to_remote] = useState(false);

    const load = async () => {
        try {
            const [m, c, d] = await Promise.all([
                mountHttp.post("list", {}),
                mountHttp.post("credential/list", {}),
                mountHttp.post("driver/list", {}),
            ]);
            set_list(Array.isArray(m?.data) ? m.data : []);
            set_creds(Array.isArray(c?.data) ? c.data : []);
            set_drivers(Array.isArray(d?.data) ? d.data : []);
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        load();
    }, []);

    /** 当前驱动类型可选的凭据来源 */
    const cred_options = (drv: string) => credential_options(drv, creds);

    /**
     * 当前凭据是否需要再选账号。
     * 只有「一凭据多账号」的凭据（百度、内网穿透）才有 accounts，其余凭据不需要。
     */
    const cur_account_options = account_options(credential_id, creds);
    const need_account = need_account_of(credential_id, creds);

    /** 关闭表单并清空（新增完成后、切换编辑对象时用） */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_driver("webdav");
        set_mount_path("");
        set_credential_id("");
        set_account_id("");
        set_root_dir("");
        set_note("");
        set_forward_to_remote(false);
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
        set_account_id(item.account_id ?? "");
        set_root_dir(item.root_dir ?? "");
        set_note(item.note ?? "");
        set_forward_to_remote(Boolean(item.forward_to_remote));
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
                account_id,
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
        if (need_account && !account_id) {
            NotyFail(t("请选择账号"));
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
                account_id: need_account ? account_id : undefined,
                root_dir,
                note,
                color: DEFAULT_COLOR,
                readonly: false,
                enabled: true,
                forward_to_remote,
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

    /** 路径字段按协议叫法命名，不要一律叫「起始目录」 */
    const dir_label = () => {
        if (driver === "smb" || driver === "s3") {
            return "子路径";
        }
        if (driver === "baidu") {
            return "网盘目录";
        }
        if (driver === "tcp_proxy") {
            return "对端目录";
        }
        return "目录";
    };

    /** 当前驱动的元信息 */
    const driver_meta = drivers.find(d => d.type === driver);
    /** 位置是「可远程列出」的形式（SMB 共享名、S3 存储桶 + 前缀） */
    const use_location_list = driver_meta?.location === "share";
    /** 位置从凭据里的「名称 → 路径」映射中挑（本地目录） */
    const use_local_source = driver_meta?.location === "local";
    /** 当前凭据登记的本地源目录映射 */
    const local_sources: LocalSourceRow[] = creds.find(c => c.id === credential_id)?.local_sources ?? [];
    const local_options = local_sources.map(v => ({title: `${v.name}（${v.path}）`, value: v.name}));

    return (<Row>
        {/* 左侧：挂载列表 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("网盘挂载")}</h2></span>}
                          rightTopCom={<div className={"div-row"}>
                              <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>
                          </div>}>
                    <Table headers={[t("备注"), t("挂载类型"), t("凭据"), t("账号"), t("操作")]}
                           rows={list.map(item => {
                               const cred = creds.find(c => c.id === item.credential_id);
                               const acc = (cred?.accounts ?? []).find(a => a.id === item.account_id);
                               return [
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
                <InputRow label={t("挂载类型")} label_width={"6rem"}>
                    <Select value={driver}
                            options={drivers.map(d => ({title: d.name, value: d.type}))}
                            onChange={(v) => {
                                set_driver(v);
                                // 换类型时清掉已选凭据（类型可能不匹配）和位置（语义不同）
                                set_credential_id("");
                                set_account_id("");
                                set_root_dir("");
                            }}/>
                </InputRow>
                <InputRow label={t("凭据")} label_width={"6rem"} required>
                    <Select value={credential_id} options={cred_options(driver)}
                            onChange={(v) => {
                                set_credential_id(v);
                                // 换凭据时清掉已选账号（账号属于原凭据）
                                set_account_id("");
                                set_root_dir("");
                            }}/>
                </InputRow>
                {/* 只有「一凭据多账号」的凭据（百度、内网穿透）才需要再选具体账号 */}
                {need_account && <InputRow label={t("账号")} label_width={"6rem"} required>
                    <Select value={account_id} options={cur_account_options}
                            onChange={set_account_id}/>
                </InputRow>}
                <InputRow label={t("本地目录")} label_width={"6rem"} required>
                    <InputText placeholder={t("被挂载的本地绝对路径")} value={mount_path}
                               handleInputChange={set_mount_path}/>
                </InputRow>
                {/* 位置：用目录树选择；SMB 列不出共享时可在下面直接填共享名 */}
                {use_location_list && <InputRow label={t(driver_meta?.location_label === "s3_bucket" ? "存储桶" : "共享目录")}
                                                label_width={"6rem"} required>
                    <RemotePathPicker driver={driver} credential_id={credential_id} account_id={account_id}
                                      require_account={need_account}
                                      value={root_dir} onChange={set_root_dir}/>
                    {driver === "smb" && <InputText value={String(root_dir ?? "").split("/")[0] ?? ""}
                                      placeholder={t("或直接输入共享名")}
                                      handleInputChange={(v) => {
                                          const sub = String(root_dir ?? "").split("/").slice(1).join("/");
                                          const name = v.trim();
                                          set_root_dir(name ? (sub ? `${name}/${sub}` : name) : "");
                                      }}/>}
                </InputRow>}
                {use_local_source && <InputRow label={t("源目录")} label_width={"6rem"} required>
                    <Select value={root_dir} options={local_options}
                            placeholder={t("选择源目录")}
                            onChange={(v) => set_root_dir(v)}/>
                </InputRow>}
                {!use_location_list && !use_local_source && <InputRow label={t(dir_label())} label_width={"6rem"}>
                    <RemotePathPicker driver={driver} credential_id={credential_id} account_id={account_id}
                                      require_account={need_account}
                                      value={root_dir} onChange={set_root_dir}/>
                </InputRow>}
                <InputRow label={t("备注")} label_width={"6rem"}>
                    <InputText placeholder={t("列表显示的名称")} value={note}
                               handleInputChange={set_note}/>
                </InputRow>
                {/* 只有内网穿透挂载能转发：其它驱动的对端不是 FileCat，没有它自己的前端和终端 */}
                {driver === "tcp_proxy" && <InputRow label={t("ftr2rmt")} label_width={"6rem"}>
                    <Switch checked={forward_to_remote} onChange={set_forward_to_remote}
                            title={t("ftr2rmt_tip")}/>
                </InputRow>}
                </Card>
            </Dashboard>}
        </Column>
    </Row>);
}
