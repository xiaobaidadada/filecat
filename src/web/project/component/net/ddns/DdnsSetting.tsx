import React, {useEffect, useState} from 'react';
import {Column, Dashboard, Row} from "../../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {Table} from "../../../../meta/component/Table";
import {InputCheckbox, InputRow, InputText, Select} from "../../../../meta/component/Input";
import {InstanceItem} from "../../../../meta/component/InstanceList";
import {useTranslation} from "react-i18next";
import {ddnsHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {DdnsConnection, DdnsIPPojo, DdnsProvider, DdnsStatus, ip_source_type} from "../../../../../common/req/ddns.pojo";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {DDNS_PROVIDERS, get_provider_meta, join_account_fields, split_account_fields} from "./DdnsProviderMeta";

/** 时间戳格式化为可读本地时间 */
function format_time(ts?: number): string {
    if (!ts) return "-";
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 具体时间，用于列表紧凑显示 */
function short_time(ts?: number): string {
    if (!ts) return "-";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 状态圆点 + 文字 */
function StatusView(props: { status?: DdnsStatus }) {
    const {t} = useTranslation();
    if (props.status === DdnsStatus.ok) return <StatusCircle success={true} text={t("成功")}/>;
    if (props.status === DdnsStatus.fail) return <StatusCircle success={false} text={t("失败")}/>;
    return <StatusCircle text={t("未验证")}/>;
}

export function DdnsSetting() {
    const {t} = useTranslation();
    const [, set_confirm] = useAtom($stroe.confirm);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);

    const [list, set_list] = useState<DdnsConnection[]>([]);
    const [edit, set_edit] = useState<(DdnsConnection & { is_new?: boolean }) | null>(null);
    const [ip_options, set_ip_options] = useState<DdnsIPPojo[]>([]);
    const [http_sources, set_http_sources] = useState<DdnsIPPojo[]>([]);
    const [interval, set_interval_value] = useState(60);
    const [syncing, set_syncing] = useState(false);

    const load_list = async () => {
        const r = await ddnsHttp.get("list");
        if (r.code === RCode.Success) set_list(r.data ?? []);
    };
    const load_ip_options = async () => {
        const r = await ddnsHttp.get("ip_options");
        if (r.code === RCode.Success) set_ip_options(r.data ?? []);
    };
    const load_http_sources = async () => {
        const r = await ddnsHttp.get("http/list");
        if (r.code === RCode.Success) set_http_sources(r.data ?? []);
    };
    const load_interval = async () => {
        const r = await ddnsHttp.get("interval");
        if (r.code === RCode.Success) set_interval_value(r.data?.interval ?? 60);
    };

    useEffect(() => {
        load_list();
        load_ip_options();
        load_http_sources();
        load_interval();
    }, []);

    const provider_options = DDNS_PROVIDERS.map((v) => ({label: v.label, value: v.provider}));
    const source_options = ip_options.map((v) => ({
        label: `${v.ifaceOrWww} (${v.isIPv4 ? "IPv4" : "IPv6"}) ${v.ip ?? ""}`,
        value: source_key(v),
    }));

    /** 生成 IP 来源唯一键（与后端 source_id 保持一致） */
    function source_key(v: DdnsIPPojo) {
        return `${v.ifaceOrWww}#${v.scopeid ?? ""}#${v.isIPv4 ? "4" : "6"}`;
    }

    /** 新建配置 */
    const create = () => {
        set_edit({
            id: "",
            provider: DdnsProvider.dnspod,
            account: "",
            isOpen: false,
            note: "",
            ips: [],
            account_status: DdnsStatus.unverified,
            account_message: "",
            is_new: true,
        } as any);
    };

    const edit_item = (item: DdnsConnection) => set_edit(JSON.parse(JSON.stringify(item)));
    const close_edit = () => set_edit(null);

    /** 保存 */
    const save = async () => {
        if (!edit) return;
        // 检查必填凭证字段
        const meta = get_provider_meta(edit.provider);
        const fields = split_account_fields(edit.account, meta?.fields.length ?? 1);
        if (fields.some((v) => !v)) {
            NotyFail(t("请填写完整的账号凭证"));
            return;
        }
        // 去掉前端临时字段，避免写进数据库
        const {is_new, ...data} = edit as any;
        const r = await ddnsHttp.post("save", data);
        if (r.code === RCode.Success) {
            NotySuccess(t("保存成功"));
            set_edit(null);
            set_list(r.data ?? []);
            load_ip_options();
        } else {
            NotyFail(r.message ?? t("操作失败"));
        }
    };

    /** 删除 */
    const del = (id: string) => {
        set_confirm({
            open: true,
            title: t('确定删除吗'),
            handle: async () => {
                const r = await ddnsHttp.post("del", {id});
                if (r.code === RCode.Success) {
                    NotySuccess(t("成功"));
                    set_list(r.data ?? []);
                    if (edit?.id === id) set_edit(null);
                }
                set_confirm({open: false, handle: null});
            }
        });
    };

    /** 单独验证账号 */
    const verify = async (id: string) => {
        const r = await ddnsHttp.post("verify", {id});
        if (r.code === RCode.Success) {
            set_list(r.data ?? []);
            const conn = (r.data ?? []).find((v: DdnsConnection) => v.id === id);
            if (conn?.account_status === DdnsStatus.ok) NotySuccess(conn.account_message || t("验证成功"));
            else NotyFail(conn?.account_message || t("验证失败"));
        }
    };

    /** 立即同步 */
    const sync_now = async () => {
        set_syncing(true);
        try {
            const r = await ddnsHttp.post("sync_now", {});
            if (r.code === RCode.Success) {
                NotySuccess(t("同步完成"));
                set_list(r.data ?? []);
            } else {
                NotyFail(r.message ?? t("操作失败"));
            }
        } finally {
            set_syncing(false);
        }
    };

    /** 保存同步间隔 */
    const save_interval = async (value: number) => {
        if (!value || value < 10) {
            NotyFail(t("间隔不能小于 10 秒"));
            return;
        }
        const r = await ddnsHttp.post("interval", {interval: value});
        if (r.code === RCode.Success) {
            NotySuccess(t("保存成功"));
            set_interval_value(r.data?.interval ?? value);
        } else {
            NotyFail(r.message ?? t("操作失败"));
        }
    };

    const set_field = (key: keyof DdnsConnection, value: any) => {
        if (!edit) return;
        set_edit({...edit, [key]: value});
    };

    /** 修改指定凭证字段（拼回 account） */
    const set_cred_field = (index: number, value: string, field_count: number) => {
        if (!edit) return;
        const fields = split_account_fields(edit.account, field_count);
        fields[index] = value;
        set_field("account", join_account_fields(fields));
    };

    const add_ip = () => {
        if (!edit) return;
        const ips = [...(edit.ips ?? []), {isIPv4: true, ifaceOrWww: "", ddnsHost: "", source_type: ip_source_type.physics}];
        set_edit({...edit, ips});
    };

    const set_ip_field = (index: number, key: keyof DdnsIPPojo, value: any) => {
        if (!edit?.ips) return;
        const ips = [...edit.ips];
        ips[index] = {...ips[index], [key]: value};
        set_edit({...edit, ips});
    };

    /** 选择 IP 来源时同步 ifaceOrWww / scopeid / isIPv4（兼容下拉 value 或手输 label） */
    const select_source = (index: number, value: string) => {
        const target = ip_options.find((v) => source_key(v) === value)
            ?? ip_options.find((v) => `${v.ifaceOrWww} (${v.isIPv4 ? "IPv4" : "IPv6"}) ${v.ip ?? ""}` === value);
        if (!target || !edit?.ips) return;
        const ips = [...edit.ips];
        ips[index] = {
            ...ips[index],
            ifaceOrWww: target.ifaceOrWww,
            scopeid: target.scopeid,
            isIPv4: target.isIPv4,
            source_type: target.source_type,
        };
        set_edit({...edit, ips});
    };

    const del_ip = (index: number) => {
        if (!edit?.ips) return;
        const ips = [...edit.ips];
        ips.splice(index, 1);
        set_edit({...edit, ips});
    };

    const show_info = () => {
        if (!edit) return;
        const meta = get_provider_meta(edit.provider);
        set_prompt_card({
            open: true,
            title: meta?.label ?? t("信息"),
            context_div: <div>{meta?.info && <p>{meta.info}</p>}</div>
        });
    };

    const open_source_manager = () => {
        set_prompt_card({
            open: true,
            title: t("IP 来源管理"),
            context_div: (
                <HttpSourceManager sources={http_sources} on_refresh={async () => {
                    await load_http_sources();
                    await load_ip_options();
                }}/>
            )
        });
    };

    const provider_label = (v: DdnsProvider) => get_provider_meta(v)?.label ?? v;
    const edit_meta = edit ? get_provider_meta(edit.provider) : undefined;
    const cred_values = edit ? split_account_fields(edit.account, edit_meta?.fields.length ?? 1) : [];

    return (<Row>
        <Column widthPer={50} maxWidth={"60rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}>
                    <h2>{t("动态域名解析")}</h2>
                    <ActionButton icon={"info"} onClick={() => {
                        set_prompt_card({
                            open: true, title: t("信息"), context_div: (
                                <div>
                                    <p>{t("ddns_help_1")}</p>
                                    <p>{t("ddns_help_2")}</p>
                                </div>
                            )
                        })
                    }} title={t("信息")}/>
                </span>}
                          rightTopCom={<div>
                              <ActionButton icon={"sync"} title={t("立即同步")} selected={syncing} onClick={sync_now}/>
                              <ActionButton icon={"dns"} title={t("IP 来源管理")} onClick={open_source_manager}/>
                              <ActionButton icon={"add"} title={t("添加")} onClick={create}/>
                          </div>}>
                    <InputRow label={t("同步间隔")} label_width={"5rem"} row>
                        <InputText value={String(interval)} type={"number"} width={"6rem"}
                                   handleInputChange={(v) => set_interval_value(Number(v))}/>
                        <span>{t("秒")}</span>
                        <ActionButton icon={"save"} title={t("保存")} onClick={() => save_interval(interval)}/>
                    </InputRow>
                    <Table headers={[
                        t("编号"),
                        t("平台"),
                        t("开启"),
                        t("账号状态"),
                        t("上次同步"),
                        t("备注"),
                        t("操作"),
                    ]} rows={list.map((item, index) => {
                        return [
                            <p>{index}</p>,
                            <TextTip context={provider_label(item.provider)}/>,
                            <StatusCircle success={!!item.isOpen} text={item.isOpen ? t("开启") : t("关闭")}/>,
                            <TextTip tip_context={item.account_message}><StatusView status={item.account_status}/></TextTip>,
                            <TextTip tip_context={`${format_time(item.time)} ${item.message ?? ""}`}>
                                {short_time(item.time)}
                            </TextTip>,
                            <TextTip context={item.note}></TextTip>,
                            <div className={"div-row"}>
                                <ActionButton icon={"check"} title={t("验证")} onClick={() => verify(item.id)}/>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit_item(item)}/>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item.id)}/>
                            </div>
                        ];
                    })}/>
                </CardFull>
            </Dashboard>
        </Column>
        <Column widthPer={50}>
            {edit &&
                <Dashboard>
                    <Card
                        self_title={<span className={" div-row "}>
                            <h2>{t(`${edit.is_new ? "添加" : "编辑"}`)}</h2>
                        </span>}
                        rightTopCom={<ActionButton icon={"info"} title={t("信息")} onClick={show_info}/>}
                        rightBottomCom={<div>
                            <ActionButton icon={"cancel"} title={t("取消")} onClick={close_edit}/>
                            <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
                        </div>}>
                        <InputRow label={t("开启")} label_width={"5rem"}>
                            <InputCheckbox selected={!!edit.isOpen} onchange={() => set_field("isOpen", !edit.isOpen)}/>
                        </InputRow>
                        <InputRow label={t("备注")} label_width={"5rem"}>
                            <InputText value={edit.note} handleInputChange={(value) => set_field("note", value)}/>
                        </InputRow>
                        <InputRow label={t("平台")} label_width={"5rem"} required>
                            <Select options={provider_options} value={edit.provider}
                                    onChange={(value) => {
                                        // 换平台时清空凭证与验证状态（字段数量不同）
                                        set_edit({...edit, provider: value, account: "", account_status: DdnsStatus.unverified, account_message: ""} as any);
                                    }}/>
                        </InputRow>
                        {edit_meta?.fields.map((field, index) => (
                            <InputRow key={index} label={field.label} label_width={"5rem"} required>
                                <InputText value={cred_values[index] ?? ""} type={field.password ? "password" : "text"}
                                           placeholder={field.placeholder}
                                           handleInputChange={(value) => set_cred_field(index, value, edit_meta.fields.length)}/>
                            </InputRow>
                        ))}
                        {edit.account_status === DdnsStatus.fail &&
                            <p className={"text-red"}>{edit.account_message}</p>}

                        <div className={"div-row"}>
                            <label>{t("域名绑定")}</label>
                            <ActionButton icon={"add"} title={t("添加")} onClick={add_ip}/>
                        </div>
                        {(edit.ips ?? []).map((ip_item, index) => {
                            const key = `${ip_item.ifaceOrWww}#${ip_item.scopeid ?? ""}#${ip_item.isIPv4 ? "4" : "6"}`;
                            const selected = source_options.find((v) => v.value === key);
                            return <InstanceItem key={index} title={`${t("绑定")}${index + 1}`}
                                                 toolbar={<ActionButton icon={"delete"} title={t("删除")}
                                                                        onClick={() => del_ip(index)}/>}>
                                <InputRow label={t("IP 来源")} label_width={"5rem"} required>
                                    <InputText value={selected?.label ?? ""} options={source_options}
                                               handleInputChange={(value) => select_source(index, value)}/>
                                </InputRow>
                                <InputRow label={t("域名")} label_width={"5rem"} required>
                                    <InputText value={ip_item.ddnsHost}
                                               placeholder={t("多个域名用空格分隔")}
                                               handleInputChange={(value) => set_ip_field(index, "ddnsHost", value)}/>
                                </InputRow>
                                {ip_item.time &&
                                    <InputRow label={t("上次同步")} label_width={"5rem"} row>
                                        <StatusView status={ip_item.status}/>
                                        <span>{format_time(ip_item.time)}</span>
                                    </InputRow>
                                }
                            </InstanceItem>
                        })}
                    </Card>
                </Dashboard>
            }
        </Column>
    </Row>)
}

/** 「IP 来源管理」弹窗内容组件（用真实 React 状态管理输入框） */
function HttpSourceManager(props: { sources: DdnsIPPojo[], on_refresh: () => Promise<void> }) {
    const {t} = useTranslation();
    const [url, set_url] = useState("");
    const [is_ipv4, set_is_ipv4] = useState(true);

    const add = async () => {
        if (!url.trim()) {
            NotyFail(t("请输入地址"));
            return;
        }
        const r = await ddnsHttp.post("http/add", {
            ifaceOrWww: url.trim(),
            isIPv4: is_ipv4,
            ip: "",
            source_type: ip_source_type.http_get,
        });
        if (r.code === RCode.Success) {
            NotySuccess(t("成功"));
            set_url("");
            await props.on_refresh();
        } else {
            NotyFail(r.message ?? t("操作失败"));
        }
    };

    const del = async (item: DdnsIPPojo) => {
        const r = await ddnsHttp.post("http/del", item);
        if (r.code === RCode.Success) {
            NotySuccess(t("成功"));
            await props.on_refresh();
        }
    };

    return <div>
        <p>{t("http_source_tip")}</p>
        <div className={"div-row"}>
            <Select options={[{label: "IPv4", value: "ipv4"}, {label: "IPv6", value: "ipv6"}]}
                    value={is_ipv4 ? "ipv4" : "ipv6"}
                    width={"6rem"}
                    onChange={(v) => set_is_ipv4(v === "ipv4")}/>
            <InputText value={url} placeholder={"https://4.ipw.cn"} handleInputChange={(v) => set_url(v)}/>
            <ActionButton icon={"add"} title={t("添加")} onClick={add}/>
        </div>
        <div>
            {props.sources.length === 0 && <p>{t("暂无数据")}</p>}
            {props.sources.map((item, index) => (
                <div key={index} className={"div-row"}>
                    <span>{item.ifaceOrWww}（{item.isIPv4 ? "IPv4" : "IPv6"}）</span>
                    <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                </div>
            ))}
        </div>
    </div>;
}
