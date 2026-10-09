import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, TextTip} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputRadio, InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {CredentialField, CredentialMeta, CredentialRow, MountAccountRow, fmt_time, mount_enable_options} from "./mount_common";

/** 密码类字段：编辑时留空表示不修改 */
const SECRET_KEYS = ["password", "private_key", "secret_key"];

/** 新增凭据的默认类型 */
const DEFAULT_TYPE = "webdav";

/** 授权步骤的占位 key：第 2 步渲染 OAuth 授权 UI，不是普通输入字段 */
const AUTHORIZE_STEP = "@authorize";

/**
 * 分步填写流程。
 * keys 是这一步要显示的字段（按顺序）；on_next 是点「下一步」时的动作：
 *  · load_shares —— 用已填的主机/账号去列共享目录，成功才进下一步
 *  · save_app    —— 先把应用配置存下来（授权链接需要它），成功才进下一步
 * 不在这里列出的类型就是单步，直接保存。
 */
const STEP_FLOW: Record<string, { keys: string[]; on_next?: "load_shares" | "save_app" }[]> = {
    smb: [
        {keys: ["server", "username", "password"], on_next: "load_shares"},
        {keys: ["share"]},
    ],
    baidu: [
        {keys: ["app_id", "app_key", "secret_key"], on_next: "save_app"},
        {keys: [AUTHORIZE_STEP]},
    ],
};

/**
 * 凭证管理。
 * 卡片上方直接平铺输入框填新增的凭据，下方表格列出已有凭据可编辑。
 * 多步类型（SMB / 百度网盘）由 STEP_FLOW 驱动，交互形式统一。
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
                        <li>{t("pwdkept")}</li>
                        <li>{t("tstbfrs")}</li>
                    </ul>
                    {/* 各类型的作用说明 */}
                    <ul>
                        <li><b>WebDAV</b>：{t("prtwbdv")}</li>
                        <li><b>SSH / SFTP</b>：{t("prtsftp")}</li>
                        <li><b>S3 兼容对象存储</b>：{t("prt_s3")}</li>
                        <li><b>SMB</b>：{t("prt_smb")}</li>
                        <li><b>百度网盘</b>：{t("prt_bd")}</li>
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
    const [note, set_note] = useState("");
    const [config, set_config] = useState<Record<string, any>>({});
    const [step, set_step] = useState(1);
    /** 共享目录候选项（SMB 第 2 步的下拉） */
    const [shared_options, set_shared_options] = useState<{ label: string; value: string }[]>([]);
    /** 百度授权相关状态 */
    const [auth_mode, set_auth_mode] = useState<"one_click" | "oob">("oob");
    const [auth_code, set_auth_code] = useState("");
    /** 凭据是否启用（列表行内的「使用」下拉） */
    const [enabled, set_enabled] = useState(true);

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
    /** 当前类型的分步流程；单一类型没有 */
    const flow = STEP_FLOW[type];
    /** 总步数 */
    const step_count = flow?.length ?? 1;

    /** 关闭表单并清空 */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_type(DEFAULT_TYPE);
        set_note("");
        set_config({});
        set_step(1);
        set_shared_options([]);
        set_auth_code("");
        set_enabled(true);
    };

    /** 点标题栏的「+」开始新增 */
    const start_add = () => {
        close_form();
        set_editing(true);
    };

    /** 拉取远程主机的共享列表（目前仅 SMB 支持） */
    const load_shares = async () => {
        const rsq = await mountHttp.post("share/list", {
            driver: type,
            id: id || undefined,
            config: {server: config.server, username: config.username, password: config.password},
        });
        const shares = rsq?.data ?? [];
        if (!shares.length) {
            NotyFail(t("没有找到共享"));
            return false;
        }
        set_shared_options(shares.map((s: any) => ({label: s.name, value: s.name})));
        return true;
    };

    /** 保存应用配置（百度第 1 步）。授权链接依赖它，必须先落库 */
    const save_app = async () => {
        try {
            const rsq = await mountHttp.post(id ? "credential/update" : "credential/add", {
                id: id || undefined,
                type,
                note,
                config,
                enabled,
            });
            // 新建时后端会分配 id，第 2 步的授权要带上它
            if (!id && rsq?.data?.id) {
                set_id(rsq.data.id);
            }
            return true;
        } catch (e) {
            // Http 层已提示
            return false;
        }
    };

    /** 校验必填字段（跳过本步不显示的字段） */
    const check_required = (keys: string[]): string | undefined => {
        if (!note.trim()) {
            return t("请填写备注");
        }
        for (const f of fields) {
            if (keys.includes(f.key) === false) {
                continue;
            }
            const val = String(config[f.key] ?? "").trim();
            // 编辑时密码类字段留空表示不改
            const filled = val || (id && SECRET_KEYS.includes(f.key));
            if (f.required && !filled) {
                return t(f.label);
            }
        }
        return undefined;
    };

    /** 点「下一步」：先校验本步字段，再执行本步动作 */
    const next_step = async () => {
        const step_keys = flow?.[step - 1]?.keys ?? [];
        const missing = check_required(step_keys);
        if (missing) {
            NotyFail(`${t("请填写")}${missing}`);
            return;
        }
        const action = flow?.[step - 1]?.on_next;
        try {
            if (action === "load_shares" && !await load_shares()) {
                return;
            }
            if (action === "save_app" && !await save_app()) {
                return;
            }
            set_step(step + 1);
        } catch (e) {
            // Http 层已提示
        }
    };

    const save = async () => {
        const missing = check_required(fields.map(f => f.key));
        if (missing) {
            NotyFail(`${t("请填写")}${missing}`);
            return;
        }
        try {
            await mountHttp.post(id ? "credential/update" : "credential/add", {
                id: id || undefined,
                type,
                note,
                config,
                enabled,
            });
            NotySuccess(t("保存成功"));
            close_form();
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const edit = (item: CredentialRow) => {
        set_editing(true);
        set_id(item.id);
        set_type(item.type);
        set_note(item.note ?? "");
        set_config({...(item.config ?? {})});
        set_auth_code("");
        set_enabled(item.enabled !== false);
        // 分步类型的编辑直接进最后一步：前面的字段已填过，点「上一步」可回去改。
        // 这里用 item.type 自己算步数，不能读 type —— set_type 是异步的，此时还是上一个类型的值
        set_step(STEP_FLOW[item.type]?.length ?? 1);
        // SMB 编辑时密码是脱敏的，带上 id 让后端用已保存的密码去列共享
        if (item.type === "smb") {
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
        }
    };

    /** 打开百度授权页面 */
    const open_authorize = async () => {        try {
            const rsq = await mountHttp.post("baidu/authorize_url", {id, mode: auth_mode});
            if (rsq?.data) {
                window.open(rsq.data, "_blank", "noopener,noreferrer");
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 提交授权码（oob）完成授权 */
    const submit_code = async () => {
        if (!auth_code.trim()) {
            NotyFail(t("请填写授权码"));
            return;
        }
        try {
            const rsq = await mountHttp.post("baidu/exchange", {id, code: auth_code.trim(), mode: auth_mode});
            NotySuccess(`${t("授权成功")}：${rsq?.data?.baidu_name ?? ""}`);
            set_auth_code("");
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    const del = async (item: CredentialRow) => {
        confirm_del({
            title: t("确认删除"),
            sub_title: item.note,
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

    /** 授权检测：调百度 uinfo 验活某个账号 */
    const verify_account = async (cred_id: string, account_id: string) => {
        try {
            const rsq = await mountHttp.post("baidu/verify", {id: cred_id, account_id});
            const d = rsq?.data ?? {};
            if (d.valid) {
                NotySuccess(t("账号可用"));
            } else {
                NotyFail(`${t("账号不可用")}：${d.error ?? ""}`);
            }
            await load();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 取消某个百度账号的授权（保留应用配置与凭据） */
    const deauthorize_account = (cred_id: string, acc: MountAccountRow) => {
        confirm_del({
            title: t("确认删除"),
            sub_title: acc.note || acc.account_name || acc.id,
            confirm_fun: async () => {
                try {
                    await mountHttp.post("baidu/deauthorize", {id: cred_id, account_id: acc.id});
                    NotySuccess(t("已删除"));
                    await load();
                } catch (e) {
                    // Http 层已提示
                }
            },
        });
    };

    const type_name = (v: string) => metas.find(m => m.type === v)?.name ?? v;

    /** 本步要显示的字段 key；单步类型就是全部字段 */
    const step_keys = flow?.[step - 1]?.keys ?? fields.map(f => f.key);
    /** 本步是否包含授权 UI */
    const show_authorize = step_keys.includes(AUTHORIZE_STEP);
    /** 是否最后一步（最后一步才有「保存」） */
    const is_last = step === step_count;
    /** 是否分步类型 */
    const multi_step = step_count > 1;

    /** 普通字段渲染 */
    const render_field = (f: CredentialField) => {
        // SMB 的共享目录用下拉（列表来自远程主机）
        if (f.key === "share" && type === "smb") {
            return <InputRow key={f.key} label={t(f.label)} label_width={"6rem"}>
                <Select value={config[f.key] ?? ""}
                        options={shared_options}
                        onChange={(v) => set_config({...config, [f.key]: v})}/>
            </InputRow>;
        }
        const is_secret = f.type === "password";
        return <React.Fragment key={f.key}>
            <InputText
                type={is_secret ? "password" : "text"}
                placeholder={f.label}
                value={config[f.key] ?? ""}
                handleInputChange={(v) => set_config({...config, [f.key]: v})}/>
        </React.Fragment>;
    };

    /** 百度账号列表：读当前凭据的 accounts 数组（一个应用可授权多个账号） */
    const baidu_accounts = (): MountAccountRow[] => {
        return list.find(c => c.id === id)?.accounts ?? [];
    };

    /** 第 2 步：上方授权表单 + 下方账号列表（一个应用可挂多个账号） */
    const render_authorize = () => {
        const accounts = baidu_accounts();
        return <React.Fragment key={AUTHORIZE_STEP}>
            {/* 授权方式与授权入口常驻，已授权时也可继续授权新账号 */}
            <InputRow label={t("授权方式")} label_width={"6rem"}>
                <div className={"div-row"}>
                    <InputRadio name={"baidu_auth_mode"} value={"one_click"} context={t("一键授权")}
                                selected={auth_mode === "one_click"}
                                onchange={() => set_auth_mode("one_click")}/>
                    <InputRadio name={"baidu_auth_mode"} value={"oob"} context={t("outh_ob")}
                                selected={auth_mode === "oob"}
                                onchange={() => set_auth_mode("oob")}/>
                </div>
            </InputRow>
            {/* oob 方式要粘贴授权码 */}
            {auth_mode === "oob" && <InputRow label={t("授权码")} label_width={"6rem"}>
                <InputText placeholder={t("粘贴授权码 code")} value={auth_code}
                           handleInputChange={set_auth_code}/>
            </InputRow>}
            <div className={"div-row"}>
                <ActionButton icon={"open_in_new"} title={t("去授权")} onClick={open_authorize}/>
                {auth_mode === "oob" &&
                    <ActionButton icon={"check"} title={t("完成授权")} onClick={submit_code}/>}
            </div>

            {/* 账号列表：每个已授权账号一行，可备注、检测、删除 */}
            {accounts.length > 0 && <Table headers={[t("账号名"), t("百度账号"), t("授权状态"), t("使用"), t("授权时间"), t("操作")]}
                   rows={accounts.map(acc => [
                       <TextTip context={acc.note || acc.account_name || acc.id}/>,
                       <TextTip context={acc.account_name || acc.id}/>,
                       <TextTip context={acc.authorized ? t("已授权") : t("未授权")}/>,
                       <TextTip context={acc.enabled === false ? t("停用") : t("启用")}/>,
                       <p>{acc.obtained_at ? fmt_time(acc.obtained_at) : "-"}</p>,
                       <div>
                           <ActionButton icon={"network_check"} title={t("授权检测")}
                                         onClick={() => verify_account(id, acc.id)}/>
                           <ActionButton icon={"delete"} title={t("删除")}
                                         onClick={() => deauthorize_account(id, acc)}/>
                       </div>,
                   ])}/>}
        </React.Fragment>;
    };

    return (
        <Card self_title={<span className={" div-row "}><h2>{t("凭证管理")}</h2>
            <ActionButton icon={"info"} title={t("信息")} onClick={mount_info_click}/></span>}
              rightBottomCom={<div>
                  {/* 未展开表单时只显示「+」开始新增 */}
                  {!editing && <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>}
                  {editing && <>
                      {/* 不是第一步就能退回上一步改前面的字段 */}
                      {multi_step && step > 1 &&
                          <ActionButton icon={"arrow_back"} title={t("上一步")} onClick={() => set_step(step - 1)}/>}
                      {/* 分步类型在前面的步骤只让「下一步」，最后一步才保存 */}
                      {multi_step && !is_last &&
                          <ActionButton icon={"arrow_forward"} title={t("下一步")} onClick={next_step}/>}
                      {(!multi_step || is_last) &&
                          <ActionButton icon={"save"} title={t("保存")} onClick={save}/>}
                      <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                  </>}
              </div>}>

            {/* 表单只在新增/编辑时展开 */}
            {editing && <React.Fragment>
                <InputText placeholder={t("备注")} value={note} handleInputChange={set_note}/>
                <Select value={type} options={metas.map(m => ({title: m.name, value: m.type}))}
                        onChange={(v) => {
                            set_type(v);
                            // 换类型时清掉旧字段，避免串类型
                            set_config({});
                            set_shared_options([]);
                            set_step(1);
                            set_auth_code("");
                        }}/>
                {/* 按当前步骤渲染字段；授权是特殊步骤，单独渲染 */}
                {show_authorize
                    ? render_authorize()
                    : fields.filter(f => step_keys.includes(f.key)).map(render_field)}
            </React.Fragment>}

            {/* 列表只在未展开表单时显示，避免编辑中误点其它行的操作按钮 */}
            {!editing && <Table headers={[t("备注"), t("类型"), t("账号"), t("操作")]}
                   rows={list.map(item => [
                       <TextTip context={item.note}/>,
                       <TextTip context={type_name(item.type)}/>,
                       <TextTip context={String((item.accounts ?? []).length || "-")}/>,
                       <div>
                           <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                           <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                       </div>,
                   ])}/>}
        </Card>
    );
}
