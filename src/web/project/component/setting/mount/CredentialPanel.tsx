import React, {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {Card, CardFull, TextTip} from "../../../../meta/component/Card";
import {Column, Dashboard, Row} from "../../../../meta/component/Dashboard";
import {ActionButton} from "../../../../meta/component/Button";
import {InputRadio, InputRow, InputText, InputTextarea, Select} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {InstanceItem} from "../../../../meta/component/InstanceList";
import {Avatar} from "../../../../meta/component/Avatar";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {using_confirm} from "../../prompts/prompt.util";
import {
    CREDENTIAL_META_LIST,
    CredentialField,
    CredentialMeta,
    CredentialRow,
    MountAccountRow,
    fmt_time,
    mount_enable_options
} from "./mount_common";

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
    /** 手动导入账号表单：id(uk) + 两个 token */
    const [import_uk, set_import_uk] = useState("");
    const [import_access, set_import_access] = useState("");
    const [import_refresh, set_import_refresh] = useState("");
    /** 多账号类型的账号列表（SMB/WebDAV/SFTP/S3 的认证信息） */
    const [accounts, set_accounts] = useState<MountAccountRow[]>([]);

    /** 凭据是否启用（列表行内的「使用」下拉） */
    const [enabled, set_enabled] = useState(true);

    const load = async () => {
        try {
            const c = await mountHttp.post("credential/list", {});
            const next_list = Array.isArray(c?.data) ? c.data : [];
            set_list(next_list);
            setMetas(CREDENTIAL_META_LIST);
            return next_list;
        } catch (e) {
            // Http 层已提示
            return [];
        }
    };

    /**
     * 账号增删改后，把当前编辑的凭据重新拉一遍回填。
     * 账号操作即时落库，但右侧表单持有的是「点编辑那一刻的快照」，
     * 不回填就会出现：保存后输入框还是旧对象、删除后界面还留着已删的账号。
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
    /** 当前的目录映射列表（本地目录类型复用 accounts：每条账号即一条目录映射） */
    const sources: MountAccountRow[] = accounts;

    /** 改写映射列表的某一项 */
    const update_source = (index: number, patch: { note?: string; account_name?: string; path?: string }) => {
        set_accounts((prev) => prev.map((s, i) => (i === index ? {...s, ...patch} : s)));
    };

    const add_source = () => {
        set_accounts((prev) => [...prev, {id: "", account_name: "", path: ""} as MountAccountRow]);
    };

    const remove_source = (index: number) => {
        remove_account(accounts[index]);
    };

    /** 保存单条目录映射（本地目录类型）：走账号接口逐条落库 */
    const save_source = async (index: number) => {
        const src = accounts[index];
        if (!id) {
            NotyFail(t("请先保存凭据"));
            return;
        }
        try {
            const body: Record<string, string> = {credential_id: id};
            if (src.id) {
                body.account_id = src.id;
            }
            if (src.note !== undefined) {
                body.note = src.note;
            }
            if (src.account_name !== undefined) {
                body.account_name = String(src.account_name);
            }
            if (src.path !== undefined) {
                body.path = String(src.path);
            }
            const rsq = await mountHttp.post("credential/account_save", body);
            NotySuccess(t("保存成功"));
            const saved = rsq?.data;
            set_accounts((prev) => prev.map((v, i) => (i === index ? {...v, ...saved} : v)));
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 账号列表操作：增删改，认证信息都存在 accounts 里 */
    const add_account = () => {
        set_accounts((prev) => [...prev, {id: "", account_name: "", password: "", secret_key: ""} as MountAccountRow]);
    };

    const change_account = (index: number, patch: any) => {
        set_accounts((prev) => prev.map((v, i) => (i === index ? {...v, ...patch} : v)));
    };

    /** 移除本地列表里的一条（只用于还没保存的账号，已保存的走接口删除） */
    const drop_account = (index: number) => {
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
                const nm = String(src.account_name ?? "").trim();
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
                // 账号走独立接口维护，这里不提交；新建时也不能带，
                // 否则后端会生成一批本地不认识的 id，后续保存会重复创建
                enabled,
            });
            NotySuccess(t("保存成功"));
            // 新增保存成功后转成编辑态，页面不关，接着还能改
            const credential_id = id || rsq.data?.id;
            if (!id && rsq.data?.id) {
                set_id(rsq.data.id);
            }
            // 把本地还没保存的账号逐条落库，避免刷新后临时账号丢失
            if ((use_accounts || use_sources) && credential_id) {
                for (const acc of accounts) {
                    if (acc.id) {
                        continue;
                    }
                    const body: Record<string, string> = {credential_id};
                    if (acc.note !== undefined) {
                        body.note = acc.note;
                    }
                    // 认证类字段由 account_fields 定义；本地目录的映射用 account_name 与 path
                    const keys = use_sources
                        ? ["account_name", "path"]
                        : account_fields.map(f => f.key);
                    for (const k of keys) {
                        const v = (acc as Record<string, any>)[k];
                        if (v !== undefined && v !== null) {
                            body[k] = String(v);
                        }
                    }
                    const saved = await mountHttp.post("credential/account_save", body);
                    Object.assign(acc, saved?.data ?? {});
                }
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
            tcp_client_num_id: item.tcp_client_num_id,
            tcp_base_url: item.tcp_base_url,
        });
        set_accounts(item.accounts ?? []);
        set_auth_code("");
        // 切换凭据时清空手动导入表单，避免上一次输入残留
        set_import_uk("");
        set_import_access("");
        set_import_refresh("");
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
    const open_authorize = async () => {
        try {
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
            // 授权后后端会新增一条账号，必须回填 accounts，否则要刷新页面才看得到
            await refresh_accounts(id);
        } catch (e) {
            // Http 层已提示
        }
    };

    /**
     * 手动导入账号：后端先用 access_token 调百度 uinfo 验证，
     * 通过后才写入 accounts，并回填头像/昵称。
     */
    const submit_import = async () => {
        if (!import_uk.trim()) {
            NotyFail(t("请填写账号 id"));
            return;
        }
        if (!import_access.trim()) {
            NotyFail(t("请填写 access_token"));
            return;
        }
        try {
            const rsq = await mountHttp.post("baidu/import", {
                id,
                uk: import_uk.trim(),
                access_token: import_access.trim(),
                refresh_token: import_refresh.trim(),
            });
            NotySuccess(`${t("添加成功")}：${rsq?.data?.baidu_name ?? ""}`);
            set_import_uk("");
            set_import_access("");
            set_import_refresh("");
            await refresh_accounts(id);
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

    /**
     * 账号列表卡片，所有凭据类型共用一套交互：
     * 备注 + 各类型自己的 account_fields，每个账号都有保存 / 验证 / 删除。
     * 百度账号的 uk、授权状态这类只读信息作为额外信息项传进来。
     */
    const render_accounts = () => {
        return <React.Fragment>
            {/* 百度账号只能通过 OAuth 授权产生，没有「手动添加」 */}
            {account_fields.length > 0 && <div className={"div-row"}>
                <ActionButton icon={"add"} title={t("添加")} onClick={add_account}/>
            </div>}
            {accounts.map((acc, index) => (
                <InstanceItem key={acc.id ?? index}
                              title={<>
                                  <span>{`${t("账号")} #${index + 1}`}</span>
                              </>}
                              toolbar={<>
                                  <ActionButton icon={"save"} title={t("保存")}
                                                onClick={() => save_account(acc)}/>
                                  <ActionButton icon={"network_check"} title={t("验证")}
                                                onClick={() => verify_account(acc)}/>
                                  <ActionButton icon={"delete"} title={t("删除")}
                                                onClick={() => remove_account(acc)}/>
                              </>}>
                    <InputRow label={t("备注")} label_width={"7rem"}>
                        <InputText placeholder={t("便于辨认的名字")} value={acc.note ?? ""}
                                   handleInputChange={(v) => change_account(index, {note: v})}/>
                    </InputRow>
                    {account_fields.map(f => (
                        <InputRow key={f.key} label={t(f.label)} label_width={"7rem"} required={f.required}>
                            {f.type === "textarea" ? (
                                <InputTextarea style={{width: "100%", height: "6rem"}}
                                               placeholder={f.placeholder ? t(f.placeholder) : ""}
                                               value={String(acc[f.key] ?? "")}
                                               handleInputChange={(v) => change_account(index, {[f.key]: v})}/>
                            ) : (
                                <InputText type={f.type === "password" ? "password" : "text"}
                                           placeholder={f.placeholder ? t(f.placeholder) : ""}
                                           value={String(acc[f.key] ?? "")}
                                           handleInputChange={(v) => change_account(index, {[f.key]: v})}/>
                            )}
                        </InputRow>
                    ))}
                    {/* 百度这类账号有服务端返回的只读信息，展示在字段下方 */}
                    {acc.id && acc.token !== undefined && <>
                        <Avatar src={acc.avatar_url}
                                name={acc.nickname || acc.account_name}
                                label={t("头像")}
                                label_width={"7rem"}/>
                        <InputRow label={t("百度账号")} label_width={"7rem"}>
                            <p>{acc.account_name || acc.id}</p>
                        </InputRow>
                        <InputRow label={t("授权状态")} label_width={"7rem"}>
                            <p>{acc.token ? t("已授权") : t("未授权")}</p>
                        </InputRow>
                        <InputRow label={t("授权时间")} label_width={"7rem"}>
                            <p>{acc.token?.obtained_at ? fmt_time(acc.token.obtained_at) : "-"}</p>
                        </InputRow>
                    </>}
                </InstanceItem>
            ))}
        </React.Fragment>;
    };

    /** 保存单个账号（立即落库，不影响凭据本体的其它字段） */
    const save_account = async (acc: MountAccountRow) => {
        try {
            const body: Record<string, string> = {credential_id: id};
            if (acc.id) {
                body.account_id = acc.id;
            }
            if (acc.note !== undefined) {
                body.note = acc.note;
            }
            for (const f of account_fields) {
                const v = acc[f.key];
                if (v !== undefined && v !== null) {
                    body[f.key] = String(v);
                }
            }
            const rsq = await mountHttp.post("credential/account_save", body);
            NotySuccess(t("保存成功"));
            // 用后端返回的账号（含新分配的 id）就地替换本地这条，
            // 避免整体重拉时丢掉其它还没保存的新增行
            const saved = rsq?.data;
            set_accounts((prev) => prev.map((v) => (v === acc ? {...v, ...saved} : v)));
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 验证单个账号能否连通 */
    const verify_account = async (acc: MountAccountRow) => {
        try {
            const body: Record<string, string> = {credential_id: id};
            if (acc.id) {
                body.account_id = acc.id;
            }
            // 带上界面上尚未保存的值，改完密码不保存也能先试
            for (const f of account_fields) {
                const v = acc[f.key];
                if (v !== undefined && v !== null) {
                    body[f.key] = String(v);
                }
            }
            const rsq = await mountHttp.post("credential/account_verify", body);
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

    /** 删除账号；已保存的走接口，刚添加还没保存的直接从列表移除 */
    const remove_account = (acc: MountAccountRow) => {
        if (!acc.id) {
            drop_account(accounts.indexOf(acc));
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

    /** 第 2 步：上方授权入口，账号列表由统一的 render_accounts 渲染 */
    const render_authorize = () => {
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
            {/* 手动导入：已有 id + token 时跳过 OAuth 直接添加账号 */}
            <InputRow label={t("手动添加")} label_width={"6rem"}>
                <InputText placeholder={t("账号 id（uk）")} value={import_uk}
                           handleInputChange={set_import_uk}/>
            </InputRow>
            <InputRow label={t("access_token")} label_width={"6rem"}>
                <InputText placeholder={t("粘贴 access_token")} value={import_access}
                           handleInputChange={set_import_access}/>
            </InputRow>
            <InputRow label={t("refresh_token")} label_width={"6rem"}>
                <InputText placeholder={t("粘贴 refresh_token")} value={import_refresh}
                           handleInputChange={set_import_refresh}/>
            </InputRow>
            <div className={"div-row"}>
                <ActionButton icon={"add"} title={t("添加账号")} onClick={submit_import}/>
            </div>
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
                    <Table headers={[t("编号"), t("备注"), t("类型"), t("操作")]}
                           rows={list.map((item, index) => [
                               <span>{index}</span>,
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
                        {/* 认证类字段全部平铺，不再分步翻页；本地目录的「目录」列表放在下方独立卡片 */}
                        {!use_sources && fields.map(render_field)}
                    </Card>
                </Dashboard>

                {/* 依赖凭据本身才能进行的内容（百度授权入口），放到下方独立卡片里 */}
                {flow?.[1]?.keys?.includes(AUTHORIZE_STEP) && <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("授权")}</h2></span>}>
                        {render_authorize()}
                    </Card>
                </Dashboard>}

                {/* 本地目录：一个凭据下登记多组「名称 → 路径」，挂载时挑其中一组。
                    和账号卡片同一套结构，避免挤在凭据卡片里 */}
                {use_sources && <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("目录")}</h2></span>}>
                        <div className={"div-row"}>
                            {/*<h3>{t("目录")}</h3>*/}
                            <ActionButton icon={"add"} title={t("添加")} onClick={add_source}/>
                        </div>
                        {sources.map((src, index) => (
                            <InstanceItem key={index}
                                          title={`#${index + 1}`}
                                          toolbar={<>
                                              <ActionButton icon={"save"} title={t("保存")}
                                                            onClick={() => save_source(index)}/>
                                              <ActionButton icon={"delete"} title={t("删除")}
                                                            onClick={() => remove_source(index)}/>
                                          </>}>
                                <InputRow label={t("备注")} label_width={"7rem"}>
                                    <InputText placeholder={t("便于辨认的名字")} value={src.note ?? ""}
                                               handleInputChange={(v) => update_source(index, {note: v})}/>
                                </InputRow>
                                <InputRow label={t("名称")} label_width={"7rem"}>
                                    <InputText placeholder={t("目录")} value={src.account_name ?? ""}
                                               handleInputChange={(v) => update_source(index, {account_name: v})}/>
                                </InputRow>
                                <InputRow label={t("目录")} label_width={"7rem"} required>
                                    <InputText placeholder={t("本地绝对路径")} value={src.path}
                                               handleInputChange={(v) => update_source(index, {path: v})}/>
                                </InputRow>
                            </InstanceItem>
                        ))}
                    </Card>
                </Dashboard>}

                {/* 账号列表：所有「一凭据多账号」类型（SMB / WebDAV / SFTP / S3 / 内网穿透 / 百度）
                    共用同一套渲染与同一组接口，各自字段由 CREDENTIAL_META_LIST 的 account_fields 决定 */}
                {use_accounts && <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t("账号")}</h2></span>}>
                        {render_accounts()}
                    </Card>
                </Dashboard>}
            </React.Fragment>}
        </Column> </Row>);
}
