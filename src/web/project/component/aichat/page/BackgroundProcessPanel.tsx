/**
 * BackgroundProcessPanel — AI 后台进程管理面板
 *
 * PC 端：通过顶部 Header 按钮切换显示/隐藏，隐藏时完全消失
 * 移动端：默认隐藏，弹出时从右侧滑入，与会话列表互斥（二选一）
 */
import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { $stroe } from "../../../util/store";
import { ActionButton } from "../../../../meta/component/Button";
import { ws } from "../../../util/ws";
import { CmdType, WsData } from "../../../../../common/frame/WsData";
import { NotySuccess, NotyFail } from "../../../util/noty";

interface BgProcessInfo {
    pid: number;
    session_id: string;
    cmd: string;
    cwd: string;
    start_time: number;
    output_file: string;
    running: boolean;
    exit_code: number | null;
}

interface BgProcessOutput {
    success: boolean;
    pid: number;
    running: boolean;
    output_file: string;
    output: string;
    message?: string;
}

// 暴露给外部的 refresh 方法引用
const bgPanelRef: { refresh?: () => void; fetchCount?: () => Promise<number> } = {};

const BackgroundProcessPanel: React.FC<{}> = function BackgroundProcessPanel() {
    const { t } = useTranslation();
    const [processes, setProcesses] = useState<BgProcessInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [outputData, setOutputData] = useState<BgProcessOutput | null>(null);
    const [outputLoading, setOutputLoading] = useState(false);

    const [ai_bg_expanded, set_ai_bg_expanded] = useAtom($stroe.ai_bg_expanded);
    const [, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);

    const collapse = () => {
        set_ai_bg_expanded(false);
    };

    const fetchProcessList = useCallback(async () => {
        setLoading(true);
        try {
            const wsd = new WsData(CmdType.ai_bg_process_list_req);
            wsd.context = {};
            const result = await ws.send(wsd);
            if (result?.context?.processes) {
                setProcesses(result.context.processes);
            }
        } catch (e) {
            console.error("获取后台进程列表失败", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // 把 refresh 挂到外部可访问的引用上
    bgPanelRef.refresh = fetchProcessList;

    // 拉取全局后台进程总数（不依赖组件状态，纯返回）
    const fetchGlobalCount = useCallback(async (): Promise<number> => {
        try {
            const wsd = new WsData(CmdType.ai_bg_process_list_req);
            wsd.context = {}; // 空 context → 全局所有会话
            const result = await ws.send(wsd);
            return result?.context?.processes?.length ?? 0;
        } catch {
            return 0;
        }
    }, []);
    bgPanelRef.fetchCount = fetchGlobalCount;

    const fetchOutput = useCallback(async (pid: number) => {
        setOutputLoading(true);
        setSelectedPid(pid);
        try {
            const wsd = new WsData(CmdType.ai_bg_process_output_req);
            wsd.context = { pid };
            const result = await ws.send(wsd);
            setOutputData(result.context);
        } catch (e) {
            console.error("获取进程输出失败", e);
            NotyFail("获取进程输出失败");
        } finally {
            setOutputLoading(false);
        }
    }, []);

    const killProcess = useCallback(async (pid: number) => {
        try {
            const wsd = new WsData(CmdType.ai_bg_process_kill_req);
            wsd.context = { pid };
            const result = await ws.send(wsd);
            if (result?.context?.success) {
                NotySuccess("进程已终止");
                fetchProcessList();
                if (selectedPid === pid) {
                    setSelectedPid(null);
                    setOutputData(null);
                }
            } else {
                NotyFail(result?.context?.message || "终止失败");
            }
        } catch (e) {
            console.error("终止进程失败", e);
            NotyFail("终止进程失败");
        }
    }, [fetchProcessList, selectedPid]);

    useEffect(() => {
        fetchProcessList();
        const timer = setInterval(fetchProcessList, 5000);
        return () => clearInterval(timer);
    }, [fetchProcessList]);

    const runningProcesses = processes.filter((p) => p.running);
    const finishedProcesses = processes.filter((p) => !p.running);

    return (
        <>
            {/* 移动端 overlay */}
            {ai_bg_expanded && (
                <div className="chat-session-overlay" onClick={collapse} />
            )}

            <aside className={`chat-bg-process-panel ${ai_bg_expanded ? "expanded" : ""}`}>
                <div className="chat-bg-process-header">
                    <span className="chat-bg-process-title">{t("后台进程")}</span>
                    <ActionButton icon="close" title={t("关闭")} onClick={collapse} />
                </div>

                <div className="chat-bg-process-toolbar">
                    <ActionButton icon="refresh" title={t("刷新")} onClick={fetchProcessList} />
                    <span className="chat-bg-process-count">
                        {runningProcesses.length} {t("个运行中")}
                        {finishedProcesses.length > 0 && ` / ${finishedProcesses.length} ${t("个已退出")}`}
                    </span>
                </div>

                <div className="chat-bg-process-list">
                    {loading && processes.length === 0 && (
                        <div className="chat-bg-process-empty">{t("加载中...")}</div>
                    )}
                    {!loading && processes.length === 0 && (
                        <div className="chat-bg-process-empty">{t("暂无后台进程")}</div>
                    )}

                    {runningProcesses.map((proc) => (
                        <div
                            key={proc.pid}
                            className={`chat-bg-process-item ${selectedPid === proc.pid ? "active" : ""} running`}
                        >
                            <div className="chat-bg-process-item-main" onClick={() => fetchOutput(proc.pid)}>
                                <span className="chat-bg-process-pid">PID: {proc.pid}</span>
                                <span className="chat-bg-process-cmd" title={proc.cmd}>
                                    {proc.cmd.length > 40 ? proc.cmd.slice(0, 40) + "..." : proc.cmd}
                                </span>
                                <span className="chat-bg-process-time">
                                    {new Date(proc.start_time).toLocaleTimeString()}
                                </span>
                                <span className="chat-bg-process-status running-dot" title={t("运行中")}>●</span>
                            </div>
                            <div className="chat-bg-process-item-actions">
                                <ActionButton icon="terminal" title={t("查看输出")} onClick={() => fetchOutput(proc.pid)} />
                                <ActionButton icon="stop" title={t("终止进程")} onClick={() => killProcess(proc.pid)} />
                            </div>
                        </div>
                    ))}

                    {finishedProcesses.map((proc) => (
                        <div
                            key={proc.pid}
                            className={`chat-bg-process-item ${selectedPid === proc.pid ? "active" : ""} finished`}
                        >
                            <div className="chat-bg-process-item-main" onClick={() => fetchOutput(proc.pid)}>
                                <span className="chat-bg-process-pid">PID: {proc.pid}</span>
                                <span className="chat-bg-process-cmd" title={proc.cmd}>
                                    {proc.cmd.length > 30 ? proc.cmd.slice(0, 30) + "..." : proc.cmd}
                                </span>
                                <span className="chat-bg-process-time">
                                    {new Date(proc.start_time).toLocaleTimeString()}
                                </span>
                                <span className="chat-bg-process-exit-code">exit: {proc.exit_code}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {selectedPid !== null && (
                    <div className="chat-bg-process-output">
                        <div className="chat-bg-process-output-header">
                            <span>PID: {selectedPid} {t("输出")}</span>
                            <ActionButton icon="close" title={t("关闭")} onClick={() => { setSelectedPid(null); setOutputData(null); }} />
                        </div>
                        <div className="chat-bg-process-output-content">
                            {outputLoading ? (
                                <div className="chat-bg-process-empty">{t("加载中...")}</div>
                            ) : outputData ? (
                                <pre className="chat-bg-process-output-pre">
                                    {outputData.output || t("(无输出)")}
                                </pre>
                            ) : null}
                        </div>
                    </div>
                )}
            </aside>
        </>
    );
};

export { bgPanelRef };
export default BackgroundProcessPanel;
