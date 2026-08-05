import React, {useState, useRef, useEffect} from 'react'
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card, ProgressCard} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {useTranslation} from "react-i18next";
import {NotyFail, NotySuccess} from "../../util/noty";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";

interface OpenPort {
    port: number;
    open: boolean;
}

interface ScanProgress {
    scanned: number;
    total: number;
    percent: number;
    currentPort: number;
    openCount: number;
}

interface ScanEnd {
    host: string;
    startPort: number;
    endPort: number;
    totalScanned: number;
    totalOpen: number;
    cancelled: boolean;
}

export function PortScan() {
    const {t} = useTranslation();
    const [host, setHost] = useState('');
    const [startPort, setStartPort] = useState('1');
    const [endPort, setEndPort] = useState('65535');
    const [concurrency, setConcurrency] = useState('100');
    const [timeoutVal, setTimeoutVal] = useState('2000');
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState<ScanProgress | null>(null);
    const [openPorts, setOpenPorts] = useState<OpenPort[]>([]);
    const [endInfo, setEndInfo] = useState<ScanEnd | null>(null);

    // 使用 ref 存储最新的 openPorts，避免闭包问题
    const openPortsRef = useRef<OpenPort[]>([]);
    const wsRegistered = useRef(false);

    // 注册 WS 消息监听（仅一次）
    useEffect(() => {
        if (wsRegistered.current) return;
        wsRegistered.current = true;

        ws.addMsg(CmdType.port_scan_progress, (wsData: WsData<ScanProgress>) => {
            setProgress(wsData.context);
        });

        ws.addMsg(CmdType.port_scan_result, (wsData: WsData<OpenPort>) => {
            const newPort = wsData.context;
            const updated = [...openPortsRef.current, newPort];
            openPortsRef.current = updated;
            setOpenPorts(updated);
        });

        ws.addMsg(CmdType.port_scan_end, (wsData: WsData<ScanEnd>) => {
            setEndInfo(wsData.context);
            setScanning(false);
            if (wsData.context.cancelled) {
                NotyFail(t('扫描已取消'));
            } else {
                NotySuccess(t('扫描完成'));
            }
        });

        return () => {
            ws.sendData(CmdType.port_scan_cancel, {});
            ws.removeMsg(CmdType.port_scan_progress);
            ws.removeMsg(CmdType.port_scan_result);
            ws.removeMsg(CmdType.port_scan_end);
            wsRegistered.current = false;
        };
    }, []);

    const doScan = () => {
        if (!host) {
            NotyFail(t('主机地址不能为空'));
            return;
        }
        const sp = parseInt(startPort);
        const ep = parseInt(endPort);
        if (isNaN(sp) || isNaN(ep) || sp < 1 || ep < 1 || sp > 65535 || ep > 65535) {
            NotyFail(t('端口范围无效'));
            return;
        }
        if (sp > ep) {
            NotyFail(t('起始端口不能大于结束端口'));
            return;
        }

        setScanning(true);
        setProgress(null);
        setOpenPorts([]);
        openPortsRef.current = [];
        setEndInfo(null);

        // fire and forget，不等返回；进度通过 ws addMsg 接收
        ws.sendData(CmdType.port_scan_req, {
            host: host,
            startPort: sp,
            endPort: ep,
            concurrency: parseInt(concurrency) || 100,
            timeout: parseInt(timeoutVal) || 2000,
        }).catch(() => {});
    };

    const doCancel = () => {
        ws.sendData(CmdType.port_scan_cancel, {}).catch(() => {});
    };

    return (
        <Dashboard>
            <Row>
                <Column>
                    <Card title={t("TCP ")+t('端口扫描')}
                          titleCom={
                              <div style={{display: "flex", gap: "1rem", fontSize: "0.85em", color: "var(--textSecondary)"}}>
                                  {progress && (
                                      <span>{t('已发现')}: {progress.openCount}</span>
                                  )}
                                  {endInfo && (
                                      <span>{t('总计扫描')}: {endInfo.totalScanned} | {t('开放')}: {endInfo.totalOpen}</span>
                                  )}
                              </div>
                          }
                    >
                        {/* 参数输入区 */}
                        <div style={{display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem"}}>
                            <InputTextIcon placeholder={t("目标主机")} icon={"dns"} value={host}
                                           handleInputChange={(v) => setHost(v)}/>
                            <InputTextIcon placeholder={t("起始端口")} icon={"login"} value={startPort}
                                           handleInputChange={(v) => setStartPort(v)} type="number"/>
                            <InputTextIcon placeholder={t("结束端口")} icon={"logout"} value={endPort}
                                           handleInputChange={(v) => setEndPort(v)} type="number"/>
                            <InputTextIcon placeholder={t("并发数")} icon={"shuffle"} value={concurrency}
                                           handleInputChange={(v) => setConcurrency(v)} type="number"/>
                            <InputTextIcon placeholder={t("超时(ms)")} icon={"timer"} value={timeoutVal}
                                           handleInputChange={(v) => setTimeoutVal(v)} type="number"/>
                            {!scanning ? (
                                <ButtonText  text={t("扫描")} clickFun={() => doScan()}/>
                            ) : (
                                <ButtonText text={t("取消")} clickFun={() => doCancel()}/>
                            )}
                        </div>

                        {/* 进度条 */}
                        {scanning && progress && (
                            <div style={{marginBottom: "1rem"}}>
                                <div style={{display: "flex", justifyContent: "space-between", fontSize: "0.8em", color: "var(--textSecondary)", marginBottom: "0.3rem"}}>
                                    <span>{t('当前')}: {progress.currentPort}</span>
                                    <span>{progress.scanned} / {progress.total}</span>
                                </div>
                                <ProgressCard progress={progress.percent}/>
                            </div>
                        )}

                        {/* 开放端口表格 */}
                        {openPorts.length > 0 && (
                            <Table
                                headers={[t("端口"), t("状态")]}
                                rows={openPorts.map((p) => [
                                    p.port,
                                    <span style={{color: "var(--icon-green)"}}>{t("开放")}</span>
                                ])}
                            />
                        )}

                        {/* 扫描中且没有开放端口 */}
                        {scanning && openPorts.length === 0 && (
                            <div style={{padding: "1rem", textAlign: "center", color: "var(--textSecondary)"}}>
                                {t('正在扫描...')}
                            </div>
                        )}

                        {/* 扫描结束，无开放端口 */}
                        {!scanning && endInfo && openPorts.length === 0 && (
                            <div style={{padding: "1rem", textAlign: "center", color: "var(--textSecondary)"}}>
                                {t('未发现开放端口')}
                            </div>
                        )}

                        {/* 初始状态 */}
                        {!scanning && !endInfo && openPorts.length === 0 && (
                            <div style={{padding: "1rem", textAlign: "center", color: "var(--textSecondary)"}}>
                                {t('请输入参数后点击扫描')}
                            </div>
                        )}
                    </Card>
                </Column>
            </Row>
        </Dashboard>
    );
}
