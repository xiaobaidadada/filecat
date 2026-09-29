import React, {useState, useRef, useEffect} from 'react'
import {InputText} from "../../../meta/component/Input";
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
            NotyFail(t('hostreq'));
            return;
        }
        const sp = parseInt(startPort);
        const ep = parseInt(endPort);
        if (isNaN(sp) || isNaN(ep) || sp < 1 || ep < 1 || sp > 65535 || ep > 65535) {
            NotyFail(t('端口范围无效'));
            return;
        }
        if (sp > ep) {
            NotyFail(t('portrng'));
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
                              <span>
                                  {progress && (
                                      <span>{t('已发现')}: {progress.openCount}</span>
                                  )}
                                  {endInfo && (
                                      <span>{t('总计扫描')}: {endInfo.totalScanned} | {t('开放')}: {endInfo.totalOpen}</span>
                                  )}
                              </span>
                          }
                          rightBottomCom={!scanning ? (
                              <ButtonText  text={t("扫描")} clickFun={() => doScan()}/>
                          ) : (
                              <ButtonText text={t("取消")} clickFun={() => doCancel()}/>
                          )}
                    >
                        {/* 参数输入区 */}
                        <InputText placeholder={t("目标主机")} value={host}
                                   handleInputChange={(v) => setHost(v)}/>
                        <InputText placeholder={t("起始端口")} value={startPort}
                                   handleInputChange={(v) => setStartPort(v)}/>
                        <InputText placeholder={t("结束端口")} value={endPort}
                                   handleInputChange={(v) => setEndPort(v)}/>
                        <InputText placeholder={t("并发数")} value={concurrency}
                                   handleInputChange={(v) => setConcurrency(v)}/>
                        <InputText placeholder={t("超时(ms)")} value={timeoutVal}
                                   handleInputChange={(v) => setTimeoutVal(v)}/>

                        {/* 进度条 */}
                        {scanning && progress && (
                            <div>
                                <p>
                                    {/*{t('当前端口')}: {progress.currentPort}　*/}
                                    {t('已扫描')}: {progress.scanned} / {progress.total}
                                </p>
                                <ProgressCard progress={progress.percent}/>
                            </div>
                        )}

                        {/* 开放端口表格 */}
                        {openPorts.length > 0 && (
                            <Table
                                headers={[t("端口"), t("状态")]}
                                rows={openPorts.map((p) => [
                                    p.port,
                                    <span>{t("开放")}</span>
                                ])}
                            />
                        )}

                        {/* 扫描中且没有开放端口 */}
                        {scanning && openPorts.length === 0 && (
                            <p>{t('正在扫描...')}</p>
                        )}

                        {/* 扫描结束，无开放端口 */}
                        {!scanning && endInfo && openPorts.length === 0 && (
                            <p>{t('未发现开放端口')}</p>
                        )}

                        {/* 初始状态 */}
                        {!scanning && !endInfo && openPorts.length === 0 && (
                            <p>{t('scan_in')}</p>
                        )}
                    </Card>
                </Column>
            </Row>
        </Dashboard>
    );
}
