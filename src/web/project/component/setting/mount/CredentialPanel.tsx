import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, TextTip} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
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
    /** 删除前的二次确认 */
    const confirm_del = using_confirm();
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
        set_step(1);
        set_shared_options([]);
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
        // SMB 已有共享目录（就是要编辑它），直接从第 2 步进，先把目录列表拉出来
        if (item.type === "smb") {
            set_step(2);
            // 编辑时密码是脱敏的，带上 id 让后端用已保存的密码去连
            mountHttp.post("share/list", {
                driver: "smb",
                id: item.id,
                config: item.config ?? {},
            }).then(rsq => {
                const shares = rsq?.data ?? [];
                set_shared_options(shares.map((s: any) => ({label: s.name, value: s.name})));
            }).catch(() => {
                // Http 层已提示
            });
        } else {
            set_step(1);
        }
    };

    /**
     * SMB 分两步填：
     *  · 1 填基本信息（主机/账号）→ 点「下一步」验证并拉共享目录列表
     *  · 2 从列表里选共享目录 → 保存
     * 其他驱动没有这个流程，恒为 1。
     */
    const [step, set_step] = useState(1);
    /** 列表用的行内删除按钮，需要知道删的是哪一行，这里直接复用 */
    const is_smb = type === "smb";

    /** 共享目录候选项：切到第 2 步时从远程主机拉取，供下拉选择 */
    const [shared_options, set_shared_options] = useState<{ label: string; value: string }[]>([]);

    /**
     * 拉取远程主机的共享列表（目前仅 SMB 支持）。
     * 拿主机/用户名/密码去问，用户不用自己去别处查共享叫什么。
     */
    const load_shares = async () => {
        const rsq = await mountHttp.post("share/list", {
            driver: type,
            id: id || undefined,
            config: {server: config.server, username: config.username, password: config.password},
        });
        return rsq?.data ?? [];
    };

    /**
     * SMB 第 1 步 → 第 2 步。
     * 直接用「列共享目录」来验证连接 —— 它只需要主机/用户名/密码，
     * 正好是这一步收集到的东西，不必等共享目录填了才能测。
     */
    const next_step = async () => {
        // 第 1 步只校验基本信息，共享目录要到第 2 步才选
        for (const f of fields) {
            if (f.key === "share") continue;
            const val = String(config[f.key] ?? "").trim();
            const filled = val || (id && SECRET_KEYS.includes(f.key));
            if (f.required && !filled) {
                NotyFail(`${t("请填写")}${t(f.label)}`);
                return;
            }
        }
        if (!name.trim()) {
            NotyFail(t("请填写名称"));
            return;
        }
        try {
            const shares = await load_shares();
            if (!shares.length) {
                NotyFail(t("没有找到共享"));
                return;
            }
            set_shared_options(shares.map((s: any) => ({label: s.name, value: s.name})));
            set_step(2);
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
        confirm_del({
            title: t("确认删除"),
            sub_title: item.name,
            confirm_fun: async () => {
                try {
                    await mountHttp.post("credential/delete", {id: item.id});
                    NotySuccess(t("已删除"));
                    await load();
                } catch (e) {
                    // Http 层已提示（仍被挂载引用时会报错）
                }
            },
        });
    };

    const type_name = (v: string) => metas.find(m => m.type === v)?.name ?? v;

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("普通凭据管理")}</h2>
            <ActionButton icon={"info"} title={t("信息")} onClick={mount_info_click}/></span>}
              rightBottomCom={<div>
                  {/* 未展开表单时只显示「+」开始新增 */}
                  {!editing && <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>}
                  {/* 第 1 步：验证并进入下一步（仅 SMB）；其他驱动直接可保存 */}
                  {editing && is_smb && step === 1 && <ActionButton icon={"arrow_forward"} title={t("下一步")} onClick={next_step}/>}
                  {/* 第 2 步（或非 SMB）：保存 */}
                  {editing && (!is_smb || step === 2) && <ActionButton icon={"save"} title={t("保存")} onClick={save}/>}
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
                            set_shared_options([]);
                            set_step(1);
                        }}/>
                {fields.map(f => {
                    const is_share = f.key === "share" && is_smb;
                    // SMB 的共享目录属于第 2 步（要先连上主机才能列出目录供选择）
                    if (is_share && step === 1) return null;
                    if (!is_share && is_smb && step === 2) return null;
                    if (is_share) {
                        return <InputRow key={f.key} label={t(f.label)} label_width={"6rem"}>
                            <Select value={config[f.key] ?? ""}
                                    options={shared_options}
                                    onChange={(v) => set_config({...config, [f.key]: v})}/>
                        </InputRow>;
                    }
                    return <React.Fragment key={f.key}>
                        <InputText
                            type={SECRET_KEYS.includes(f.key) ? "password" : "text"}
                            placeholder={SECRET_KEYS.includes(f.key) && has_password
                                ? t("留空表示不修改")
                                : f.label}
                            value={config[f.key] ?? ""}
                            handleInputChange={(v) => set_config({...config, [f.key]: v})}/>
                    </React.Fragment>;
                })}
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
