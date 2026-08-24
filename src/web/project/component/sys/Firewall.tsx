import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {InputRow, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {useAtom} from "jotai";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {firewallHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySuccess} from "../../util/noty";

// 防火墙后端标识
type Backend = "ufw" | "nft";

// 后端状态
interface BackendStatus {
    id: Backend;
    installed: boolean;
    active: boolean;
    note: string;
}

// ufw 结构化规则（ufw status numbered 解析）
interface UfwRule {
    number: number;
    to: string;
    action: string;
    from: string;
    description: string;
}

// 规则列表视图模式
type ViewMode = "list" | "text";

export function Firewall() {
    const {t} = useTranslation();
    const [, set_confirm] = useAtom($stroe.confirm);
    const [, set_prompt_card] = useAtom($stroe.prompt_card);

    // 状态：ufw / nft 是否安装、是否启用
    const [backends, setBackends] = useState<BackendStatus[]>([]);
    // 当前管理后端（决定操作作用于谁）
    const [manage, setManage] = useState<Backend>("ufw");
    // 端口规则表单（支持 ufw 完整能力）
    const [action, setAction] = useState<"allow" | "deny" | "reject" | "limit">("allow");
    const [direction, setDirection] = useState<"in" | "out">("in");
    const [proto, setProto] = useState<"tcp" | "udp" | "both">("tcp");
    const [port, setPort] = useState("");
    const [from, setFrom] = useState("");
    // 规则列表：文本 + ufw 结构化两种形态
    const [rules, setRules] = useState("");
    const [ufwRules, setUfwRules] = useState<UfwRule[]>([]);
    // 视图模式：list 结构化列表（ufw）/ text 纯文本
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [loadRules, setLoadRules] = useState(false);

    const ACTION_OPTIONS = [
        {title: "allow", value: "allow"},
        {title: "deny", value: "deny"},
        {title: "reject", value: "reject"},
        {title: "limit", value: "limit"},
    ];
    const DIRECTION_OPTIONS = [
        {title: "in", value: "in"},
        {title: "out", value: "out"},
    ];
    const PROTO_OPTIONS = [
        {title: "tcp", value: "tcp"},
        {title: "udp", value: "udp"},
        {title: "both", value: "both"},
    ];

    // 拉取防火墙状态
    const loadStatus = async () => {
        const rsq = await firewallHttp.get("status");
        if (rsq.code === RCode.Success) {
            const list: BackendStatus[] = rsq.data ?? [];
            setBackends(list);
            // 默认管理模式：优先选已安装的后端
            const installed = list.find(b => b.installed);
            if (installed && list.find(b => b.id === manage)?.installed !== true) {
                setManage(installed.id);
            }
        }
    };

    // 拉取当前后端规则（文本 + ufw 结构化）
    const getRules = async () => {
        setLoadRules(true);
        try {
            if (manage === "ufw") {
                // ufw：同时拉取文本和结构化列表，供名单/文本两种视图使用
                const [textRsp, listRsp] = await Promise.all([
                    firewallHttp.get(`rules?backend=${manage}`),
                    firewallHttp.get("ufw/rules"),
                ]);
                if (textRsp.code === RCode.Success) setRules(textRsp.data ?? "");
                if (listRsp.code === RCode.Success) setUfwRules(listRsp.data ?? []);
            } else {
                const rsq = await firewallHttp.get(`rules?backend=${manage}`);
                if (rsq.code === RCode.Success) setRules(rsq.data ?? "");
            }
        } catch (e) {
            // Http 内部已弹失败提示（如后端未安装）；这里仅清空并兜底
            setRules("");
            setUfwRules([]);
        } finally {
            setLoadRules(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    // 切换管理模式时重新拉规则
    useEffect(() => {
        if (manage) getRules();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manage]);

    // 启用 / 停用当前后端防火墙
    const setEnabled = async (enabled: boolean) => {
        try {
            const rsq = await firewallHttp.post("enable", {backend: manage, enabled});
            if (rsq.code !== RCode.Success) {
                NotyFail(rsq.message || t("操作失败"));
                return;
            }
            NotySuccess(rsq.data || (enabled ? t("已启用") : t("已停用")));
            loadStatus();
            getRules();
        } catch (e) { /* Http 已弹错 */
        }
    };

    // 添加一条端口/范围规则（动作 + 方向 + 协议 + 端口范围 + 来源）
    const addRule = async () => {
        if (!port.trim()) {
            NotyFail(t("请填写端口号"));
            return;
        }
        try {
            const rsq = await firewallHttp.post("rule/add", {
                backend: manage, action, direction, proto, port: port.trim(), from: from.trim() || undefined,
            });
            if (rsq.code !== RCode.Success) {
                NotyFail(rsq.message || t("操作失败"));
                return;
            }
            NotySuccess(rsq.data || t("已放行"));
            getRules();
        } catch (e) { /* Http 已弹错 */
        }
    };

    // 按 ufw 编号删除一条规则（列表视图下，二次确认后调用）
    const delUfwRule = async (number: number) => {
        set_confirm({
            open: true,
            title: t("确定删除该规则吗？"),
            sub_title: `${t("规则编号")} ${number}`,
            handle: async () => {
                try {
                    const rsq = await firewallHttp.post("ufw/rule/del", {number});
                    set_confirm({open: false, handle: null});
                    if (rsq.code !== RCode.Success) {
                        NotyFail(rsq.message || t("操作失败"));
                        return;
                    }
                    NotySuccess(rsq.data || t("已删除"));
                    getRules();
                } catch (e) { /* Http 已弹错 */
                }
            },
        });
    };

    const manageInstalled = backends.find(b => b.id === manage)?.installed === true;
    const manageActive = backends.find(b => b.id === manage)?.active === true;

    return <div>
        <Header left_children={<span className="header-title">{t("防火墙")}</span>}>
            {/* 后端切换（仅可切换到已安装的后端） */}
            <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                <span style={{whiteSpace: 'nowrap'}}>{t("后端")}:</span>
                <button className={`button button--flat ${manage === "ufw" ? '' : 'button--grey'}`}
                        disabled={backends.find(b => b.id === "ufw")?.installed !== true}
                        onClick={() => setManage("ufw")}>ufw
                </button>
                <button className={`button button--flat ${manage === "nft" ? '' : 'button--grey'}`}
                        disabled={backends.find(b => b.id === "nft")?.installed !== true}
                        onClick={() => setManage("nft")}>nftables
                </button>
            </div>
            {/* 启停 + 刷新规则 */}
            {manageInstalled && <ActionButton icon={"power_settings_new"} title={manageActive ? t("停用") : t("启用")}
                                              onClick={() => setEnabled(!manageActive)}/>}
            <ActionButton icon={"refresh"} title={t("刷新规则")} onClick={getRules}/>
        </Header>

        <Dashboard>
            <Row>
                <Column widthPer={100}>
                    {/* 状态卡片 */}
                    <Card title={t("状态")}>
                        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                            {backends.map(b => (
                                <div key={b.id} style={{
                                    padding: '0.6rem 0.8rem',
                                    minWidth: '12rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.4rem'
                                }}>
                                    <div style={{fontWeight: 'bold'}}>{b.id === "ufw" ? "ufw" : "nftables"}</div>
                                    <div>{t("已安装")}: <TextTip
                                        context={b.installed ? <span style={{color: 'green'}}>✓</span> :
                                            <span style={{color: 'red'}}>✗</span>}/></div>
                                    <div>{t("已启用")}: <TextTip
                                        context={b.active ? <span style={{color: 'green'}}>✓</span> :
                                            <span style={{color: 'gray'}}>✗</span>}/></div>
                                    <div style={{color: 'gray', fontSize: '0.8rem'}}>{b.note}</div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </Column>
            </Row>

            <Row>
                <Column widthPer={100}>
                    <CardFull self_title={<span className={"div-row"}>
                        <h2>{t("添加规则")}</h2>
                         <ActionButton icon={"info"} title={t("信息")} onClick={() => {
                             set_prompt_card({
                                 open: true, title: t("信息"), context_div: (
                                     <div style={{whiteSpace: 'pre-wrap', lineHeight: '1.6'}}>
                                         {t("来源地址填写说明")}
                                     </div>
                                 )
                             });
                         }}/>
                    </span>}>
                            <InputRow label={t("动作")} width={"6rem"}>
                                <Select width={"10rem"} options={ACTION_OPTIONS} value={action}
                                        onChange={(v) => setAction(v as "allow" | "deny" | "reject" | "limit")}/>
                            </InputRow>
                            <InputRow label={t("方向")} width={"6rem"}>
                                <Select width={"10rem"} options={DIRECTION_OPTIONS} value={direction}
                                        onChange={(v) => setDirection(v as "in" | "out")}/>
                            </InputRow>
                            <InputRow label={t("协议")} width={"6rem"}>
                                <Select width={"10rem"} options={PROTO_OPTIONS} value={proto}
                                        onChange={(v) => setProto(v as "tcp" | "udp" | "both")}/>
                            </InputRow>
                            <InputRow label={t("端口")} width={"6rem"}>
                                <InputText width={"16rem"} placeholder={t("端口(支持范围 1000:2000)")} value={port}
                                           handleInputChange={(v) => setPort(v)}/>
                            </InputRow>
                            <InputRow label={t("来源地址")} width={"6rem"}>
                                <InputText width={"16rem"} placeholder={t("来源地址(可选)")} value={from}
                                           handleInputChange={(v) => setFrom(v)}/>
                            </InputRow>
                            <InputRow label={""} width={"6rem"}>
                                <ButtonText text={t("添加规则")} clickFun={addRule}/>
                            </InputRow>
                       
                    </CardFull>
                </Column>
            </Row>

            <Row>
                <Column widthPer={100}>
                    <CardFull title={`${t("规则列表")} (${manage})`} titleCom={
                        manage === "ufw" ? (
                            <div style={{display: 'flex', gap: '0.4rem'}}>
                                <ButtonText text={t("名单视图")} clickFun={() => setViewMode("list")}/>
                                <ButtonText text={t("文本视图")} clickFun={() => setViewMode("text")}/>
                            </div>
                        ) : undefined
                    }>
                        {loadRules && <Blank context={t("加载中...")}/>}

                        {/* ufw 名单视图：结构化列表 + 行内删除 */}
                        {!loadRules && manage === "ufw" && viewMode === "list" && (
                            ufwRules.length === 0
                                ? <Blank context={t("暂无规则")}/>
                                : <Table
                                    headers={[t("编号"), t("目标(To)"), t("动作"), t("来源(From)"), t("备注"), t("操作")]}
                                    rows={ufwRules.map(r => [
                                        r.number,
                                        <TextTip context={r.to} tip_context={r.to}/>,
                                        r.action,
                                        r.from ? <TextTip context={r.from} tip_context={r.from}/> : "",
                                        r.description || "",
                                        <ActionButton icon={"delete"} title={t("删除规则")}
                                                      onClick={() => delUfwRule(r.number)}/>,
                                    ])} width={"8rem"}/>
                        )}

                        {/* 文本视图（ufw 文本 / nft） */}
                        {!loadRules && (manage !== "ufw" || viewMode === "text") && (
                            rules
                                ? <pre style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    fontSize: '0.85rem',
                                    margin: 0
                                }}>{rules}</pre>
                                : <Blank context={t("暂无规则")}/>
                        )}
                    </CardFull>
                </Column>
            </Row>
        </Dashboard>
    </div>
}
