import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, CardFull, TextTip} from "../../../../meta/component/Card";
import {Column, Dashboard, Row} from "../../../../meta/component/Dashboard";
import {ActionButton} from "../../../../meta/component/Button";
import {InputRadio, InputRow, InputText, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {InstanceItem} from "../../../../meta/component/InstanceList";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {CredentialField, CredentialMeta, CredentialRow, LocalSourceRow, MountAccountRow, fmt_time, mount_enable_options} from "./mount_common";

/** 新增凭据的默认类型 */
const DEFAULT_TYPE = "webdav";

/** 授权步骤的占位 key：第 2 步渲染 OAuth 授权 UI，不是普通输入字段 */
const AUTHORIZE_STEP = "@authorize";
/** 内网穿透的账号步骤占位 key：第 2 步渲染「对端账号」管理 UI */
const TCP_ACCOUNT_STEP = "@tcp_account";

/**
 * 分步填写流程。
 * keys 是这一步要显示的字段（按顺序）；on_next 是点「下一步」时的动作：
 *  · save_app    —— 先把应用配置存下来（授权链接需要它），成功才进下一步
 * 不在这里列出的类型就是单步，直接保存。
 */
const STEP_FLOW: Record<string, { keys: string[]; on_next?: "save_app" }[]> = {
    baidu: [
        {keys: ["baidu_app_id", "baidu_app_key", "baidu_secret_key"], on_next: "save_app"},
        {keys: [AUTHORIZE_STEP]},
    ],
    // 内网穿透：先选客户端存下来，再管理该客户端下的对端账号（可多个）
    tcp_proxy: [
        {keys: ["tcp_client_num_id"], on_next: "save_app"},
        {keys: [TCP_ACCOUNT_STEP]},
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
                        <li><b>{t("内网穿透 FileCat")}</b>：{t("prt_tcp")}</li>
                        <li><b>{t("本地目录")}</b>：{t("prt_local")}</li>
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
    const [config, set_config] = useState<Partial<CredentialRow>>({});
    /** 穿透客户端候选项（tcp_proxy 的下拉），按 options_source 缓存 */
    const [field_options, set_field_options] = useState<Record<string, { label: string; value: string }[]>>({});
    /** 百度授权相关状态 */
    const [auth_mode, set_auth_mode] = useState<"one_click" | "oob">("oob");
    const [auth_code, set_auth_code] = useState("");
    /** 多账号类型的账号列表（SMB/WebDAV/SFTP/S3 的认证信息） */
    const [accounts, set_accounts] = useState<MountAccountRow[]>([]);

    /** 凭据是否启用（列表行内的「使用」下拉） */
    const [enabled, set_enabled] = useState(true);

    const load = async () => {
        try {
            const [c, m] = await Promise.all([
                mountHttp.post("credential/list", {}),
                mountHttp.post("credential/meta", {}),
            ]);
            const next_list = Array.isArray(c?.data) ? c.data : [];
            set_list(next_list);
            setMetas(Array.isArray(m?.data) ? m.data : []);
            return next_list;
        } catch (e) {
            // Http 层已提示
            return [];
        }
    };

    /**
     * 账号增删改后，把当前编辑的凭据重新拉一遍回填。
     * 账号操作是即时落库的，但右侧表单持有的是「点编辑那一刻的快照」，
     * 不回填就会出现：保存后输入框还是旧对象（id 为空，再点保存又新建一条）、
     * 删除后界面上还留着已删掉的账号。
     */
    const refresh_accounts = async (credential_id: string) => {
        const next_list = await load();
        const cur = next_list.find((v: CredentialRow) => v.id === credential_id);
        if (cur) {
            set_accounts(cur.accounts ?? []);
        }
    };

    useEffect(() => {
        load();
    }, []);

    /** 当前类型需要的字段 */
    const meta = metas.find(m => m.type === type);
    const fields = meta?.fields ?? [];
    /** 该类型用「名称 → 路径」映射列表代替普通字段（本地目录） */
    const use_sources = meta?.sources === true;
    /** 该类型是否用账号列表（认证信息不在 config 里） */
    const use_accounts = meta?.accounts === true;
    const account_fields = meta?.account_fields ?? [];
    /** 当前的映射列表 */
    const sources: LocalSourceRow[] = config.local_sources ?? [];

    /** 改写映射列表的某一项 */
    const update_source = (index: number, patch: {name?: string; path?: string}) => {
        set_config({...config, local_sources: sources.map((s, i) => (i === index ? {...s, ...patch} : s))});
    };

    const add_source = () => {
        set_config({...config, local_sources: [...sources, {name: "", path: ""}]});
    };

    const remove_source = (index: number) => {
        set_config({...config, local_sources: sources.filter((_, i) => i !== index)});
    };

    /** 账号列表操作：增删改，认证信息都存在 accounts 里 */
    const add_account = () => {
        set_accounts((prev) => [...prev, {id: "", account_name: "", password: "", secret_key: ""} as MountAccountRow]);
    };

    const change_account = (index: number, patch: any) => {
        set_accounts((prev) => prev.map((v, i) => (i === index ? {...v, ...patch} : v)));
    };

    const remove_account = (index: number) => {
        set_accounts((prev) => prev.filter((_, i) => i !== index));
    };
    /** 当前类型的分步流程；单一类型没有 */
    const flow = STEP_FLOW[type];

    /** 关闭表单并清空 */
    const close_form = () => {
        set_editing(false);
        set_id("");
        set_type(DEFAULT_TYPE);
        set_note("");
        set_config({});
        set_accounts([]);
        set_auth_code("");
        set_enabled(true);
    };

    /** 点标题栏的「+」开始新增 */
    const start_add = () => {
        close_form();
        set_editing(true);
    };

    /** 按字段声明的 options_source 拉取下拉选项（目前只有穿透客户端） */
    const load_field_options = async (field_list: CredentialField[]) => {
        const sources = Array.from(new Set(
            field_list.map(f => f.options_source).filter((s): s is "tcp_client" => Boolean(s)),
        ));
        const next: Record<string, { label: string; value: string }[]> = {};
        for (const source of sources) {
            const rsq = await mountHttp.post("credential/options", {source});
            next[source] = (rsq?.data ?? []).map((v: any) => ({label: v.label, value: v.value}));
        }
        set_field_options(next);
    };

    /** 保存应用配置（百度第 1 步）。授权链接依赖它，必须先落库 */
    const save_app = async () => {
        try {
            const rsq = await mountHttp.post(id ? "credential/update" : "credential/add", {
                id: id || undefined,
                type,
                note,
                ...config,
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
            const val = String((config as Record<string, any>)[f.key] ?? "").trim();
            if (f.required && !val) {
                return t(f.label);
            }
        }
        return undefined;
    };

    const save = async () => {
        const missing = check_required(fields.map(f => f.key));
        if (missing) {
            NotyFail(`${t("请填写")}${missing}`);
            return;
        }
        // 映射列表：至少一条，且名称与路径都要填、名称不能重复
        if (use_sources) {
            // if (sources.length === 0) {
            //     NotyFail(t("请至少添加一条源目录"));
            //     return;
            // }
            const seen = new Set<string>();
            for (const src of sources) {
                const nm = String(src.name ?? "").trim();
                const pth = String(src.path ?? "").trim();
                if (!nm || !pth) {
                    NotyFail(t("源目录的名称和路径都不能为空"));
                    return;
                }
                if (seen.has(nm)) {
                    NotyFail(`${t("源目录名称重复")}：${nm}`);
                    return;
                }
                seen.add(nm);
            }
        }
        // 多账号类型：每个账号的必填字段都要有值
        if (use_accounts) {
            // if (accounts.length === 0) {
            //     NotyFail(t("请至少添加一个账号"));
            //     return;
            // }
            for (const acc of accounts) {
                for (const f of account_fields) {
                    if (!f.required) {
                        continue;
                    }
                    if (!String(acc[f.key] ?? "").trim()) {
                        NotyFail(`${t("请填写")}${t(f.label)}`);
                        return;
                    }
                }
            }
        }
        try {
            const rsq = await mountHttp.post(id ? "credential/update" : "credential/add", {
                id: id || undefined,
                type,
                note,
                ...config,
                accounts: use_accounts ? accounts : undefined,
                enabled,
            });
            NotySuccess(t("保存成功"));
            // 新增保存成功后转成编辑态，页面不关，接着还能改
            if (!id && rsq.data?.id) {
                set_id(rsq.data.id);
            }
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
        set_config({
            webdav_url: item.webdav_url,
            ssh_host: item.ssh_host,
            ssh_port: item.ssh_port,
            ssh_private_key: item.ssh_private_key,
            smb_server: item.smb_server,
            s3_endpoint: item.s3_endpoint,
            s3_region: item.s3_region,
            s3_force_path_style: item.s3_force_path_style,
            baidu_app_id: item.baidu_app_id,
            baidu_app_key: item.baidu_app_key,
            baidu_secret_key: item.baidu_secret_key,
            local_sources: item.local_sources,
            tcp_client_num_id: item.tcp_client_num_id,
        });
        set_accounts(item.accounts ?? []);
        set_auth_code("");
        set_enabled(item.enabled !== false);
        // 有动态下拉字段的类型（tcp_proxy），编辑时也要把选项拉回来
        const edit_fields = metas.find(m => m.type === item.type)?.fields ?? [];
        if (edit_fields.some(f => f.options_source)) {
            load_field_options(edit_fields).catch(() => {
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

    /** 内网穿透：保存该行账号 */
    const save_tcp_account = async (acc: any) => {
        if (!String(acc.account_name ?? "").trim()) {
            NotyFail(t("请填写对端账号"));
            return;
        }
        try {
            const rsq = await mountHttp.post("credential/account_save", {
                credential_id: id,
                account_id: acc.id || undefined,
                note: acc.note,
                account_name: acc.account_name,
                password: acc.password,
            });
            NotySuccess(t("已保存"));
            await refresh_accounts(id);
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 内网穿透：验证对端账号能否登录（密码错了立刻能看出来） */
    const verify_tcp_account = async (acc: any) => {
        try {
            const rsq = await mountHttp.post("credential/account_verify", {
                credential_id: id,
                account_id: acc.id,
                account_name: acc.account_name,
                password: acc.password,
            });
            const d = rsq?.data ?? {};
            if (d.ok) {
                NotySuccess(t("账号可用"));
            } else {
                NotyFail(`${t("账号不可用")}：${d.error ?? ""}`);
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 内网穿透：删除对端账号 */
    const remove_tcp_account = (acc: any) => {
        if (!acc.id) {
            // 还没落库的行，直接本地删掉
            set_accounts((prev) => prev.filter((v: any) => v !== acc));
            return;
        }
        confirm_del({
            title: t("确认删除"),
            sub_title: acc.note || acc.account_name || acc.id,
            confirm_fun: async () => {
                try {
                    await mountHttp.post("credential/account_remove", {credential_id: id, account_id: acc.id});
                    NotySuccess(t("已删除"));
                    await refresh_accounts(id);
                } catch (e) {
                    // Http 层已提示
                }
            },
        });
    };

    /** 第 2 步：对端账号管理（每个账号一行，可备注、可改密码、可验证、可删除） */
    const render_tcp_account = () => {
        return <React.Fragment key={TCP_ACCOUNT_STEP}>
            <div className={"div-row"}>
                <h3>{t("账号")}</h3>
                <ActionButton icon={"add"} title={t("添加")} onClick={add_account}/>
            </div>
            {accounts.map((acc, index) => (
                <InstanceItem key={index}
                              title={`${t("账号")} #${index + 1}`}
                              toolbar={<>
                                  <ActionButton icon={"save"} title={t("保存")}
                                                onClick={() => save_tcp_account(acc)}/>
                                  <ActionButton icon={"network_check"} title={t("验证登录")}
                                                onClick={() => verify_tcp_account(acc)}/>
                                  <ActionButton icon={"delete"} title={t("删除")}
                                                onClick={() => remove_tcp_account(acc)}/>
                              </>}>
                    <InputRow label={t("备注")} label_width={"6rem"}>
                        <InputText placeholder={t("便于辨认的名字")} value={acc.note ?? ""}
                                   handleInputChange={(v) => change_account(index, {note: v})}/>
                    </InputRow>
                    <InputRow label={t("对端账号")} label_width={"6rem"} required>
                        <InputText placeholder={t("对端 FileCat 登录名")} value={acc.account_name ?? ""}
                                   handleInputChange={(v) => change_account(index, {account_name: v})}/>
                    </InputRow>
                    <InputRow label={t("对端密码")} label_width={"6rem"}>
                        <InputText type={"password"} value={acc.password ?? ""}
                                   handleInputChange={(v) => change_account(index, {password: v})}/>
                    </InputRow>
                </InstanceItem>
            ))}
        </React.Fragment>;
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

    /** 是否分步类型（这些类型的字段需要先落库才能做后续动作） */
    const multi_step = (flow?.length ?? 1) > 1;

    /** 普通字段渲染 */
    const render_field = (f: CredentialField) => {
        const value = (config as Record<string, any>)[f.key];
        // 动态下拉字段（如穿透客户端）：选项来自后端
        if (f.options_source) {
            return <InputRow key={f.key} label={t(f.label)} label_width={"6rem"}>
                <Select value={String(value ?? "")}
                        options={field_options[f.options_source] ?? []}
                        onChange={(v) => set_config({...config, [f.key]: v})}/>
            </InputRow>;
        }
        // 开关字段
        if (f.type === "switch") {
            return <InputRow key={f.key} label={t(f.label)} label_width={"6rem"}>
                <Select value={value === true ? "on" : "off"}
                        options={[{title: t("开启"), value: "on"}, {title: t("关闭"), value: "off"}]}
                        onChange={(v) => set_config({...config, [f.key]: v === "on"})}/>
            </InputRow>;
        }
        return <React.Fragment key={f.key}>
            <InputText
                type={f.type === "password" ? "password" : "text"}
                placeholder={f.label}
                value={String(value ?? "")}
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

            {/* 账号列表：每个已授权账号一个实例项，与其它凭据的账号列表保持一致 */}
            {accounts.map((acc, index) => (
                <InstanceItem key={acc.id}
                              title={`${t("账号")} #${index + 1}`}
                              toolbar={<>
                                  <ActionButton icon={"network_check"} title={t("授权检测")}
                                                onClick={() => verify_account(id, acc.id)}/>
                                  <ActionButton icon={"delete"} title={t("删除")}
                                                onClick={() => deauthorize_account(id, acc)}/>
                              </>}>
                    <InputRow label={t("备注")} label_width={"6rem"}>
                        <TextTip context={acc.note || "-"}/>
                    </InputRow>
                    <InputRow label={t("百度账号")} label_width={"6rem"}>
                        <TextTip context={acc.account_name || acc.id}/>
                    </InputRow>
                    <InputRow label={t("授权状态")} label_width={"6rem"}>
                        <p>{acc.token ? t("已授权") : t("未授权")}</p>
                    </InputRow>
                    <InputRow label={t("授权时间")} label_width={"6rem"}>
                        <p>{acc.token?.obtained_at ? fmt_time(acc.token.obtained_at) : "-"}</p>
                    </InputRow>
                </InstanceItem>
            ))}
        </React.Fragment>;
    };

    return (<Row>
        {/* 左侧：凭据列表 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("网盘凭据")}</h2>
                    <ActionButton icon={"info"} title={t("信息")} onClick={mount_info_click}/></span>}
                          rightTopCom={<div className={"div-row"}>
                              <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>
                          </div>}>
                    <Table headers={[t("备注"), t("类型"), t("操作")]}
                           rows={list.map(item => [
                               <TextTip context={item.note || "-"}/>,
                               <TextTip context={type_name(item.type)}/>,
                               <div>
                                   <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                   <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                               </div>,
                           ])}/>
                </CardFull>
            </Dashboard>
        </Column>

        {/* 右侧：添加/编辑面板 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            {editing && <React.Fragment>
                <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("凭据")}</h2></span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
                              <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                          </div>}>
                        <InputText placeholder={t("备注")} value={note} handleInputChange={set_note}/>
                        <Select value={type} options={metas.map(m => ({title: m.name, value: m.type}))}
                                onChange={(v) => {
                                    set_type(v);
                                    // 换类型时清掉旧字段，避免串类型
                                    set_config({});
                                    set_field_options({});
                                    set_auth_code("");
                                    // 新类型若有动态下拉字段，立即拉取选项
                                    const next_fields = metas.find(m => m.type === v)?.fields ?? [];
                                    if (next_fields.some(f => f.options_source)) {
                                        load_field_options(next_fields);
                                    }
                                }}/>
                        {/* 认证类字段全部平铺，不再分步翻页 */}
                        {use_sources
                            ? <React.Fragment>
                                <div className={"div-row"}>
                                    <h3>{t("目录")}</h3>
                                    <ActionButton icon={"add"} title={t("添加")} onClick={add_source}/>
                                </div>
                                {sources.map((src, index) => (
                                    <InstanceItem key={index}
                                                  title={`${t("目录")} #${index + 1}`}
                                                  toolbar={<>
                                                      <ActionButton icon={"delete"} title={t("删除")}
                                                                    onClick={() => remove_source(index)}/>
                                                  </>}>
                                        <InputRow label={t("名称")} label_width={"6rem"}>
                                            <InputText placeholder={t("便于辨认的名字")} value={src.name}
                                                       handleInputChange={(v) => update_source(index, {name: v})}/>
                                        </InputRow>
                                        <InputRow label={t("目录")} label_width={"6rem"} required>
                                            <InputText placeholder={t("本地绝对路径")} value={src.path}
                                                       handleInputChange={(v) => update_source(index, {path: v})}/>
                                        </InputRow>
                                    </InstanceItem>
                                ))}
                            </React.Fragment>
                            : <React.Fragment>
                                {fields.map(render_field)}
                                {use_accounts && <React.Fragment>
                                    <div className={"div-row"}>
                                        <h3>{t("账号")}</h3>
                                        <ActionButton icon={"add"} title={t("添加")} onClick={add_account}/>
                                    </div>
                                    {accounts.map((acc, index) => (
                                        <InstanceItem key={index}
                                                      title={`${t("账号")} #${index + 1}`}
                                                      toolbar={<>
                                                          <ActionButton icon={"delete"} title={t("删除")}
                                                                        onClick={() => remove_account(index)}/>
                                                      </>}>
                                            {account_fields.map(f => (
                                                <InputRow key={f.key} label={t(f.label)} label_width={"7rem"}
                                                          required={f.required}>
                                                    <InputText type={f.type === "password" ? "password" : "text"}
                                                               placeholder={f.placeholder ? t(f.placeholder) : ""}
                                                               value={acc[f.key] ?? ""}
                                                               handleInputChange={(v) => change_account(index, {[f.key]: v})}/>
                                                </InputRow>
                                            ))}
                                        </InstanceItem>
                                    ))}
                                </React.Fragment>}
                            </React.Fragment>}
                    </Card>
                </Dashboard>

                {/* 依赖凭据本身才能进行的内容，放到下方独立卡片里 */}
                {flow?.[1]?.keys?.includes(AUTHORIZE_STEP) && <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("账号")}</h2></span>}>
                        {render_authorize()}
                    </Card>
                </Dashboard>}

                {flow?.[1]?.keys?.includes(TCP_ACCOUNT_STEP) && <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("账号")}</h2></span>}>
                        {render_tcp_account()}
                    </Card>
                </Dashboard>}
            </React.Fragment>}
        </Column>    </Row>);
}
