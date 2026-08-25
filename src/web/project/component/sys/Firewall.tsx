import React, {useEffect, useState} from 'react'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {InputRow, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Blank} from "../../../meta/component/Blank";
import {Table} from "../../../meta/component/Table";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {firewallHttp, sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySuccess} from "../../util/noty";
import {useAtom} from "jotai/index";
import {$stroe} from "../../util/store";

// 端口规则协议
type Proto = "tcp" | "udp";
// 规则动作
type Action = "allow" | "deny" | "limit" | "reject";
// 规则方向
type Direction = "in" | "out";
// 规则视图模式：名单 / 文本
type ViewMode = "list" | "text";

// ufw 状态
interface FWStatus {
    installed: boolean;
    active: boolean;
    note: string;
}

// 一条规则（结构化解析自 ufw status numbered）
interface UFWRule {
    number: number;
    to: string;          // 目标（如 22/tcp）
    action: string;      // 动作（如 ALLOW IN）
    from?: string;       // 来源（如 Anywhere、192.168.1.0/24）
    description?: string;// 备注（ufw comment）
}

// 规则列表接口返回
interface RulesData {
    active: boolean;
    raw: string;
    rules: UFWRule[];
}

export function Firewall() {
    const {t} = useTranslation();

    const ACTION_OPTIONS = [
        {title: t("放行"), value: "allow"},
        {title: t("拒绝"), value: "deny"},
        {title: t("限速"), value: "limit"},
        {title: t("拒绝响应"), value: "reject"},
    ];
    const DIRECTION_OPTIONS = [
        {title: t("入站"), value: "in"},
        {title: t("出站"), value: "out"},
    ];
    const PROTO_OPTIONS = [
        {title: "tcp", value: "tcp"},
        {title: "udp", value: "udp"},
    ];

    // ufw 状态：是否安装、是否启用
    const [status, setStatus] = useState<FWStatus | null>(null);
    // 端口规则表单
    const [action, setAction] = useState<Action>("allow");
    const [direction, setDirection] = useState<Direction>("in");
    const [proto, setProto] = useState<Proto>("tcp");
    const [port, setPort] = useState("");
    const [from, setFrom] = useState("");
    // 规则列表
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [ufwRules, setUfwRules] = useState<UFWRule[]>([]);
    const [rules, setRules] = useState("");          // 原始文本
    const [loadRules, setLoadRules] = useState(false);
    const [show_confirm, set_show_confirm] = useAtom($stroe.confirm);

    // 拉取 ufw 状态
    const loadStatus = async () => {
        try {
            const rsq = await firewallHttp.get("status");
            if (rsq.code === RCode.Success) {
                setStatus(rsq.data);
            }
        } catch (e) { /* Http 已弹错 */ }
    };

    // 拉取规则列表（名单 + 文本）
    const getRules = async () => {
        setLoadRules(true);
        try {
            const rsq = await firewallHttp.get("rules");
            if (rsq.code === RCode.Success) {
                const data: RulesData = rsq.data;
                setUfwRules(data?.rules ?? []);
                setRules(data?.raw ?? "");
            }
        } catch (e) {
            setUfwRules([]);
            setRules("");
        } finally {
            setLoadRules(false);
        }
    };

    useEffect(() => {
        loadStatus();
        getRules();
    }, []);

    // 启用 / 停用 ufw
    const setEnabled = async (enabled: boolean) => {
        try {
            const rsq = await firewallHttp.post("enable", {enabled});
            if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
            NotySuccess(rsq.data || (enabled ? t("已启用") : t("已停用")));
            loadStatus();
            getRules();
        } catch (e) { /* Http 已弹错 */ }
    };

    // 添加一条规则（放行/拒绝/限速/拒绝响应）
    const addRule = async () => {
        if (!port.trim()) { NotyFail(t("请填写端口号")); return; }
        try {
            const rsq = await firewallHttp.post("rule/add", {
                action, direction, proto,
                port: port.trim(),
                from: direction === "in" ? (from.trim() || undefined) : undefined,
            });
            if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
            NotySuccess(rsq.data || t("已添加"));
            getRules();
        } catch (e) { /* Http 已弹错 */ }
    };

    // 按编号删除一条规则
    const delUfwRule = async (number: number,to:string,from:string) => {
        set_show_confirm({
            open: true,
            title: t("确定删除吗"),
            sub_title: t(`${to} ${from}`),
            handle: async () => {
                try {
                    const rsq = await firewallHttp.post("ufw/rule/del", {number});
                    if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
                    NotySuccess(rsq.data || t("规则已删除"));
                    getRules();
                } catch (e) { /* Http 已弹错 */ }
            },
        });

    };

    const installed = status?.installed === true;
    const active = status?.active === true;

    return <div>
        <Header>
            <div>{t("已安装")}: {installed ? <span style={{color: 'green'}}>✓</span> : <span style={{color: 'red'}}>✗</span>}</div>
            <div>{t("已启用")}: {active ? <span style={{color: 'green'}}>✓</span> : <span style={{color: 'gray'}}>✗</span>}</div>

            {/* 启停 + 刷新规则 */}
            {installed && <ActionButton icon={"power_settings_new"} title={active ? t("停用") : t("启用")}
                                        onClick={() => setEnabled(!active)}/>}
            <ActionButton icon={"refresh"} title={t("刷新规则")} onClick={getRules}/>
        </Header>

        <Dashboard>
            <Row>

                {/* 添加规则 */}
                <Column widthPer={35}>
                    <CardFull title={t("防火墙规则")} titleCom={
                        <ActionButton icon={"add"} title={t("添加")} onClick={addRule}/>
                    }>
                        <InputRow label={t("动作")} label_width={"4rem"} input_max_width={"8rem"}>
                            <Select options={ACTION_OPTIONS} value={action} onChange={(v) => setAction(v as Action)}
                                    defaultValue={"allow"}/>
                        </InputRow>
                        <InputRow label={t("方向")} label_width={"4rem"} input_max_width={"8rem"}>
                            <Select options={DIRECTION_OPTIONS} value={direction} onChange={(v) => setDirection(v as Direction)}
                                    defaultValue={"in"}/>
                        </InputRow>
                        <InputRow label={t("协议")} label_width={"4rem"} input_max_width={"8rem"}>
                            <Select options={PROTO_OPTIONS} value={proto} onChange={(v) => setProto(v as Proto)}
                                    defaultValue={"tcp"}/>
                        </InputRow>
                        <InputRow label={t("端口")} label_width={"4rem"} required>
                            <InputText maxWidth={"20rem"} placeholder={t("可填范围如 1000:2000")} value={port}
                                       handleInputChange={(v) => setPort(v)}/>
                        </InputRow>
                        {direction === "in" && <InputRow label={t("来源")} label_width={"4rem"}>
                            <InputText maxWidth={"20rem"} placeholder={t("IP/网段,可选")} value={from}
                                       handleInputChange={(v) => setFrom(v)}/>
                        </InputRow>}
                    </CardFull>
                </Column>
            </Row>

            <Row>
                <Column widthPer={80}>
                    <CardFull title={t("规则列表")} titleCom={
                        <div style={{display: 'flex', gap: '0.4rem'}}>
                            <ButtonText text={t("名单视图")} clickFun={() => setViewMode("list")}/>
                            <ButtonText text={t("文本视图")} clickFun={() => setViewMode("text")}/>
                        </div>
                    }>
                        {loadRules && <Blank context={t("加载中...")}/>}

                        {/* 名单视图：结构化表格 + 行内删除 */}
                        {!loadRules && viewMode === "list" && (
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
                                                      onClick={() => delUfwRule(r.number,r.to,r.from)}/>,
                                    ])}
                                    width={"8rem"}/>
                        )}

                        {/* 文本视图：原始 ufw status numbered 输出 */}
                        {!loadRules && viewMode === "text" && (
                            rules
                                ? <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem', margin: 0}}>{rules}</pre>
                                : <Blank context={t("暂无规则")}/>
                        )}
                    </CardFull>
                </Column>
            </Row>
        </Dashboard>
    </div>
}
