import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, TextTip} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {CredentialMeta, CredentialRow} from "./mount_common";

/** 密码类字段：编辑时留空表示不修改 */
const SECRET_KEYS = ["password", "private_key", "secret_key"];

/** 新增凭据的默认类型 */
const DEFAULT_TYPE = "webdav";

/**
 * 普通凭据管理。
 * 卡片上方直接平铺输入框填新增的凭据，下方表格列出已有凭据可编辑。
 * 百度账号不出现在这里：它由「百度网盘」面板授权产生，挂载时直接选账号。
 */
export default function CredentialPanel() {
    const {t} = useTranslation();
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [list, set_list] = useState<CredentialRow[]>([]);
    const [metas, setMetas] = useState<CredentialMeta[]>([]);

    /** 标题旁的信息按钮：说明凭据用途，以及每种类型的适用场景 */
    const mount_info_click = () => {
        set_prompt_card({
            open: true,
            title: t("信息"),
            context_div: (
                <div>
                    <ul>
                        <li>{t("crd_tp")}</li>
                        <li>{t("bidacct")}</li>
                        <li>{t("pwdkept")}</li>
                        <li>{t("tstbfrs")}</li>
                    </ul>
                    {/* 各类型的作用说明 */}
                    <ul>
                        <li><b>WebDAV</b>：{t("prtwbdv")}</li>
                        <li><b>SSH / SFTP</b>：{t("prtsftp")}</li>
                        <li><b>S3 兼容对象存储</b>：{t("prt_s3")}</li>
                    </ul>
                </div>
            ),
        });
    };

    /**
     * 表单是否展开（新增或编辑中）。
     * 未展开时只展示列表，输入框和操作按钮都隐藏，
     * 避免用户看到常驻的「保存」却不知道在保存什么。
     */
    const [editing, set_editing] = useState(false);
    /** 表单：新增或编辑都复用（id 为空表示新增） */
    const [id, set_id] = useState("");
    const [type, set_type] = useState(DEFAULT_TYPE);
    const [name, set_name] = useState("");
    const [config, set_config] = useState<Record<string, any>>({});
    const [has_password, set_has_password] = useState(false);

    const load = async () => {
        try {
            const [c, m] = await Promise.all([
                mountHttp.post("credential/list", {}),
                mountHttp.post("credential/meta", {}),
            ]);
            set_list(Array.isArray(c?.data) ? c.data : []);
            setMetas(Array.isArray(m?.data) ? m.data : []);
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        load();
    }, []);

    /** 当前类型需要的字段 */
    const fields = metas.find(m => m.type === type)?.fields ?? [];

    /** 关闭表单并清空（新增完成后、切换编辑对象时用） */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_type(DEFAULT_TYPE);
        set_name("");
        set_config({});
        set_has_password(false);
    };

    /** 点标题栏的「+」开始新增 */
    const start_add = () => {
        close_form();
        set_editing(true);
    };

    const edit = (item: CredentialRow) => {
        set_editing(true);
        set_id(item.id);
        set_type(item.type);
        set_name(item.name ?? "");
        set_config({...(item.config ?? {})});
        set_has_password(Boolean(item.has_password));
    };

    const test = async () => {
        try {
            const rsq = await mountHttp.post("credential/test", {id: id || undefined, type, config});
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
        if (!name.trim()) {
            NotyFail(t("请填写名称"));
            return;
        }
        for (const f of fields) {
            const val = String(config[f.key] ?? "").trim();
            // 编辑时密码类字段留空表示不改
            const filled = val || (id && SECRET_KEYS.includes(f.key));
            if (f.required && !filled) {
                NotyFail(`${t("请填写")}${t(f.label)}`);
                return;
            }
        }
        try {
            await mountHttp.post(id ? "credential/update" : "credential/add", {
                id: id || undefined,
                type,
                name,
                config,
                enabled: true,
            });
            NotySuccess(t("保存成功"));
            close_form();
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const del = async (item: CredentialRow) => {
        try {
            await mountHttp.post("credential/delete", {id: item.id});
            NotySuccess(t("已删除"));
            await load();
        } catch (e) {
            // Http 层已提示（仍被挂载引用时会报错）
        }
    };

    const type_name = (v: string) => metas.find(m => m.type === v)?.name ?? v;

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("普通凭据管理")}</h2>
            <ActionButton icon={"info"} title={t("信息")} onClick={mount_info_click}/></span>}
              rightBottomCom={<div>
                  {/* 未展开表单时只显示「+」开始新增；展开后显示测试、保存与取消 */}
                  {!editing && <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>}
                  {editing && <ActionButton icon={"network_check"} title={t("测试连接")} onClick={test}/>}
                  {editing && <ActionButton icon={"save"} title={t("保存")} onClick={save}/>}
                  {editing && <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>}
              </div>}>

            {/* 表单只在新增/编辑时展开 */}
            {editing && <React.Fragment>
                <InputText placeholder={t("名称")} value={name} handleInputChange={set_name}/>
                <Select value={type} options={metas.map(m => ({title: m.name, value: m.type}))}
                        onChange={(v) => {
                            set_type(v);
                            // 换类型时清掉旧字段，避免串类型
                            set_config({});
                        }}/>
                {fields.map(f => (
                    <React.Fragment key={f.key}>
                        <InputText
                            type={SECRET_KEYS.includes(f.key) ? "password" : "text"}
                            placeholder={SECRET_KEYS.includes(f.key) && has_password
                                ? t("留空表示不修改")
                                : f.label}
                            value={config[f.key] ?? ""}
                            handleInputChange={(v) => set_config({...config, [f.key]: v})}/>
                    </React.Fragment>
                ))}
            </React.Fragment>}

            {/* 列表只在未展开表单时显示，避免编辑中误点其它行的操作按钮 */}
            {!editing && <Table headers={[t("名称"), t("类型"), t("操作")]}
                   rows={list.map(item => [
                       <TextTip  context={item.name}/>,
                       <TextTip  context={type_name(item.type)}/>,
                       <div>
                           <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                           <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                       </div>,
                   ])}/>}
        </Card>
    );
}
