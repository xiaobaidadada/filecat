import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {sysHttp} from "../../util/config";
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

export function Firewall() {
    const {t} = useTranslation();

    // 状态：ufw / nft 是否安装、是否启用
    const [backends, setBackends] = useState<BackendStatus[]>([]);
    // 当前管理后端（决定操作作用于谁）
    const [manage, setManage] = useState<Backend>("ufw");
    // 端口规则表单
    const [proto, setProto] = useState<"tcp" | "udp">("tcp");
    const [port, setPort] = useState("");
    const [from, setFrom] = useState("");
    // 规则列表文本
    const [rules, setRules] = useState("");
    const [loadRules, setLoadRules] = useState(false);

    const PROTO_OPTIONS = [
        {title: "tcp", value: "tcp"},
        {title: "udp", value: "udp"},
    ];

    // 拉取防火墙状态
    const loadStatus = async () => {
        const rsq = await sysHttp.get("firewall/status");
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

    // 拉取当前后端规则
    const getRules = async () => {
        setLoadRules(true);
        try {
            const rsq = await sysHttp.get(`firewall/rules?backend=${manage}`);
            if (rsq.code === RCode.Success) {
                setRules(rsq.data ?? "");
            }
        } catch (e) {
            // Http 内部已弹失败提示（如后端未安装）；这里仅清空规则并兜底
            setRules("");
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
            const rsq = await sysHttp.post("firewall/enable", {backend: manage, enabled});
            if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
            NotySuccess(rsq.data || (enabled ? t("已启用") : t("已停用")));
            loadStatus();
            getRules();
        } catch (e) { /* Http 已弹错 */ }
    };

    // 放行一条端口规则
    const addRule = async () => {
        if (!port.trim()) { NotyFail(t("请填写端口号")); return; }
        try {
            const rsq = await sysHttp.post("firewall/rule/add", {backend: manage, proto, port: port.trim(), from: from.trim() || undefined});
            if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
            NotySuccess(rsq.data || t("已放行"));
            getRules();
        } catch (e) { /* Http 已弹错 */ }
    };

    // 删除当前选中的端口规则（按 handle / ufw 删除语法）
    const delRule = async () => {
        if (!port.trim()) { NotyFail(t("请填写端口号")); return; }
        try {
            const rsq = await sysHttp.post("firewall/rule/del", {backend: manage, proto, port: port.trim(), from: from.trim() || undefined});
            if (rsq.code !== RCode.Success) { NotyFail(rsq.message || t("操作失败")); return; }
            NotySuccess(rsq.data || t("已禁用放行"));
            getRules();
        } catch (e) { /* Http 已弹错 */ }
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
                        onClick={() => setManage("ufw")}>ufw</button>
                <button className={`button button--flat ${manage === "nft" ? '' : 'button--grey'}`}
                        disabled={backends.find(b => b.id === "nft")?.installed !== true}
                        onClick={() => setManage("nft")}>nftables</button>
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
                                <div key={b.id} style={{padding: '0.6rem 0.8rem', minWidth: '12rem', border: '1px solid var(--border-color)', borderRadius: '0.4rem'}}>
                                    <div style={{fontWeight: 'bold'}}>{b.id === "ufw" ? "ufw" : "nftables"}</div>
                                    <div>{t("已安装")}: <TextTip context={b.installed ? <span style={{color: 'green'}}>✓</span> : <span style={{color: 'red'}}>✗</span>}/></div>
                                    <div>{t("已启用")}: <TextTip context={b.active ? <span style={{color: 'green'}}>✓</span> : <span style={{color: 'gray'}}>✗</span>}/></div>
                                    <div style={{color: 'gray', fontSize: '0.8rem'}}>{b.note}</div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </Column>
            </Row>

            <Row>
                <Column widthPer={100}>
                    <CardFull title={t("端口放行 / 禁用")}>
                        <div style={{display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap'}}>
                            <Select options={PROTO_OPTIONS} value={proto} onChange={(v) => setProto(v as "tcp"|"udp")}
                                    defaultValue={"tcp"}/>
                            <InputText placeholder={t("端口号")} value={port}
                                       handleInputChange={(v) => setPort(v)} width={"10rem"}/>
                            <InputText placeholder={t("来源地址(可选)")} value={from}
                                       handleInputChange={(v) => setFrom(v)} width={"12rem"}/>
                            <ButtonText text={t("放行")} clickFun={addRule}/>
                            <ButtonText text={t("禁用")} clickFun={delRule}/>
                        </div>
                    </CardFull>
                </Column>
            </Row>

            <Row>
                <Column widthPer={100}>
                    <CardFull title={`${t("规则列表")} (${manage})`}>
                        {loadRules && <Blank context={t("加载中...")}/>}
                        {!loadRules && !rules && <Blank context={t("暂无规则")}/>}
                        {!loadRules && rules && <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem', margin: 0}}>{rules}</pre>}
                    </CardFull>
                </Column>
            </Row>
        </Dashboard>
    </div>
}
