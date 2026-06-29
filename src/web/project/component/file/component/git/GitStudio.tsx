import React, {useEffect, useState, useCallback, useRef} from 'react';
import {useAtom} from 'jotai';
import {$stroe} from "../../../../util/store";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {useNavigate} from "react-router-dom";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import {routerConfig} from "../../../../../../common/RouterConfig";
import * as lodash from "lodash";
import {getPathLastname} from "../../../../../../common/ListUtil";

// 复用 shared 中的颜色变量
const V = {
    surface: 'var(--surfacePrimary, #ffffff)',
    surface2: 'var(--surfaceSecondary, #f1f3f4)',
    border: 'var(--divider, rgba(0,0,0,0.08))',
    text: 'var(--textPrimary, #202124)',
    text2: 'var(--textSecondary, #5f6368)',
    primary: 'var(--primary, #1a73e8)',
    primaryLight: 'var(--primary-light, #d2e3fc)',
    green: 'var(--secondary, #34a853)',
    red: 'var(--accent, #ea4335)',
    yellow: '#f9ab00',
};

interface GitStatusFile {
    path: string;
    status: string;
    oldPath?: string;
}

interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    date: string;
}

interface GitBranchInfo {
    current: string;
    branches: string[];
}

export default function GitStudio() {
    const {t} = useTranslation();
    const navigate = useNavigate();

    let dirPath = decodeURIComponent(getRouterAfter(routerConfig.git_page, getRouterPath()));
    // 去掉末尾多余的 /
    dirPath = dirPath.replace(/\/+$/, '');

    const [statusFiles, setStatusFiles] = useState<GitStatusFile[]>([]);
    const [logEntries, setLogEntries] = useState<GitLogEntry[]>([]);
    const [branchInfo, setBranchInfo] = useState<GitBranchInfo>({current: '', branches: []});
    const [commitMessage, setCommitMessage] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'status' | 'log'>('status');
    const [loading, setLoading] = useState(false);
    const [navWidth, setNavWidth] = useState(16);
    const [drag, setDrag] = useState(false);
    const studioDividerRef = useRef(null);
    const studioNavRef = useRef(null);

    useEffect(() => {
        if (!dirPath) return;
        loadStatus();
        loadLog();
        loadBranches();
    }, [dirPath]);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('status', {path: dirPath});
            if (rsq.code === 0) setStatusFiles(rsq.data || []);
        } catch (e) {
        } finally {
            setLoading(false);
        }
    };

    const loadLog = async () => {
        try {
            const rsq = await gitHttp.post('log', {path: dirPath, maxCount: 50});
            if (rsq.code === 0) setLogEntries(rsq.data || []);
        } catch (e) {
        }
    };

    const loadBranches = async () => {
        try {
            const rsq = await gitHttp.post('branches', {path: dirPath});
            if (rsq.code === 0) setBranchInfo(rsq.data || {current: '', branches: []});
        } catch (e) {
        }
    };

    const toggleFile = (filePath: string) => {
        const next = new Set(selectedFiles);
        if (next.has(filePath)) next.delete(filePath);
        else next.add(filePath);
        setSelectedFiles(next);
    };

    const toggleAll = () => {
        if (selectedFiles.size === statusFiles.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(statusFiles.map(f => f.path)));
        }
    };

    const handleAdd = async () => {
        if (selectedFiles.size === 0) {
            NotyFail(t('请先选择文件'));
            return;
        }
        try {
            const rsq = await gitHttp.post('add', {path: dirPath, files: [...selectedFiles]});
            if (rsq.code === 0) {
                NotySuccess(t('已暂存'));
                setSelectedFiles(new Set());
                loadStatus();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const handleAddAll = async () => {
        try {
            const rsq = await gitHttp.post('add_all', {path: dirPath});
            if (rsq.code === 0) {
                NotySuccess(t('已暂存全部'));
                loadStatus();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const handleReset = async () => {
        if (selectedFiles.size === 0) {
            NotyFail(t('请先选择文件'));
            return;
        }
        try {
            const rsq = await gitHttp.post('reset', {path: dirPath, files: [...selectedFiles]});
            if (rsq.code === 0) {
                NotySuccess(t('已取消暂存'));
                setSelectedFiles(new Set());
                loadStatus();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) {
            NotyFail(t('请输入提交信息'));
            return;
        }
        try {
            setLoading(true);
            // allChanged=true 对应 `git commit -am`：
            // 已跟踪文件的修改无需先 git add 即可直接提交。
            // 如果用户想提交"新增的未跟踪文件"，仍需先点击「暂存全部/暂存选中」。
            const rsq = await gitHttp.post('commit', {path: dirPath, message: commitMessage.trim(), allChanged: true});
            if (rsq.code === 0) {
                NotySuccess(t('提交成功'));
                setCommitMessage('');
                loadStatus();
                loadLog();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePush = async (force = false) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('push', {path: dirPath, force});
            if (rsq.code === 0) {
                NotySuccess(t('推送成功'));
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePull = async () => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('pull', {path: dirPath});
            if (rsq.code === 0) {
                NotySuccess(t('拉取成功'));
                loadStatus();
                loadLog();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCheckout = async (branch: string) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('checkout', {path: dirPath, branch});
            if (rsq.code === 0) {
                NotySuccess(t('切换分支成功'));
                loadStatus();
                loadLog();
                loadBranches();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const handleStash = async () => {
        try {
            const rsq = await gitHttp.post('stash', {path: dirPath});
            if (rsq.code === 0) {
                NotySuccess(t('暂存工作区成功'));
                loadStatus();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const handleStashPop = async () => {
        try {
            const rsq = await gitHttp.post('stash_pop', {path: dirPath});
            if (rsq.code === 0) {
                NotySuccess(t('恢复工作区成功'));
                loadStatus();
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const cancel = () => {
        navigate(-1);
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'modified':
                return V.yellow;
            case 'added':
                return V.green;
            case 'deleted':
                return V.red;
            case 'untracked':
                return V.text2;
            case 'renamed':
                return V.primary;
            case 'conflict':
                return V.red;
            default:
                return V.text2;
        }
    };

    const statusLabel = (status: string) => {
        switch (status) {
            case 'modified':
                return 'M';
            case 'added':
                return 'A';
            case 'deleted':
                return 'D';
            case 'untracked':
                return '?';
            case 'renamed':
                return 'R';
            case 'conflict':
                return '!';
            default:
                return status;
        }
    };

    // 拖拽
    const handleDrag = useCallback(lodash.throttle((event) => {
        const size = parseFloat(getComputedStyle(studioNavRef.current).fontSize);
        const left = window.innerWidth / size - 4;
        const userPos = event.clientX / size;
        const right = 2.25 + studioDividerRef.current.offsetWidth / size;
        if (userPos <= left && userPos >= right) {
            setNavWidth(parseFloat(userPos.toFixed(2)));
        }
    }, 32), []);

    const handlePointerDown = () => {
        setDrag(true);
        studioNavRef.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup = () => {
        setDrag(false);
        studioNavRef.current.removeEventListener("pointermove", handleDrag);
    };

    const dirName = dirPath.split('/').filter(Boolean).pop() || dirPath;

    return (
        <div className={"studio"}>
            <Header ignore_tags={true}
                    left_children={[
                        <ActionButton key={1} title={t("取消")} icon={"close"} onClick={cancel}/>,
                        <span>{decodeURIComponent(dirName)}</span>,
                    ]}>
                <ActionButton icon={"refresh"} title={t("刷新")} onClick={() => {
                    loadStatus();
                    loadLog();
                    loadBranches();
                }}/>
            </Header>
            <div className={"studio-body"} ref={studioNavRef}>
                {/* 左侧面板 */}
                <div className={"studio-nav"} style={{width: `${navWidth - 1}em`}}>
                    {/* Tab 切换 */}
                    <div style={{display: 'flex', borderBottom: `1px solid ${V.border}`}}>
                        <button
                            onClick={() => setActiveTab('status')}
                            style={{
                                flex: 1, padding: '10px 8px', border: 'none',
                                background: activeTab === 'status' ? V.primaryLight : 'transparent',
                                color: activeTab === 'status' ? V.primary : V.text2,
                                cursor: 'pointer', fontSize: 13, fontWeight: activeTab === 'status' ? 600 : 400,
                                borderBottom: activeTab === 'status' ? `2px solid ${V.primary}` : '2px solid transparent',
                            }}
                        >
                            📝 {t('变更')} ({statusFiles.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('log')}
                            style={{
                                flex: 1, padding: '10px 8px', border: 'none',
                                background: activeTab === 'log' ? V.primaryLight : 'transparent',
                                color: activeTab === 'log' ? V.primary : V.text2,
                                cursor: 'pointer', fontSize: 13, fontWeight: activeTab === 'log' ? 600 : 400,
                                borderBottom: activeTab === 'log' ? `2px solid ${V.primary}` : '2px solid transparent',
                            }}
                        >
                            📜 {t('提交记录')} ({logEntries.length})
                        </button>
                    </div>

                    {/* 状态列表 */}
                    {activeTab === 'status' && (
                        <div style={{flex: 1, overflow: 'auto'}}>
                            {/* 全选 */}
                            {statusFiles.length > 0 && (
                                <div style={{
                                    padding: '6px 12px', borderBottom: `1px solid ${V.border}`,
                                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                                    color: V.text2, cursor: 'pointer',
                                }} onClick={toggleAll}>
                                    <input type="checkbox" checked={selectedFiles.size === statusFiles.length && statusFiles.length > 0}
                                           onChange={toggleAll} style={{cursor: 'pointer'}}/>
                                    <span>{t('全选')} ({selectedFiles.size}/{statusFiles.length})</span>
                                </div>
                            )}
                            {statusFiles.map(f => (
                                <div key={f.path}
                                     onClick={() => toggleFile(f.path)}
                                     style={{
                                         padding: '8px 12px', cursor: 'pointer',
                                         borderBottom: `1px solid ${V.border}`,
                                         display: 'flex', alignItems: 'center', gap: 8,
                                         background: selectedFiles.has(f.path) ? V.primaryLight : 'transparent',
                                         transition: 'background 0.2s',
                                     }}
                                >
                                    <input type="checkbox" checked={selectedFiles.has(f.path)} onChange={() => {
                                    }} style={{cursor: 'pointer'}}/>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, width: 20, height: 20,
                                        borderRadius: 4, display: 'inline-flex', alignItems: 'center',
                                        justifyContent: 'center', color: '#fff',
                                        background: statusColor(f.status),
                                        flexShrink: 0,
                                    }}>
                                        {statusLabel(f.status)}
                                    </span>
                                    <span style={{fontSize: 13, color: V.text, wordBreak: 'break-all'}}>
                                        {f.path}
                                        {f.oldPath && <span style={{color: V.text2, fontSize: 11}}> (← {f.oldPath})</span>}
                                    </span>
                                </div>
                            ))}
                            {statusFiles.length === 0 && (
                                <p style={{color: V.text2, textAlign: 'center', padding: 20, fontSize: 12}}>
                                    {t('没有变更')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* 日志列表 */}
                    {activeTab === 'log' && (
                        <div style={{flex: 1, overflow: 'auto'}}>
                            {logEntries.map((entry, i) => (
                                <div key={i}
                                     style={{
                                         padding: '10px 12px', borderBottom: `1px solid ${V.border}`,
                                         display: 'flex', flexDirection: 'column', gap: 4,
                                     }}
                                >
                                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                        <span style={{
                                            fontSize: 11, fontFamily: 'monospace',
                                            color: V.primary, background: V.primaryLight,
                                            padding: '2px 6px', borderRadius: 4,
                                        }}>
                                            {entry.hash}
                                        </span>
                                        <span style={{fontSize: 13, color: V.text, flex: 1}}>
                                            {entry.message}
                                        </span>
                                    </div>
                                    <div style={{fontSize: 11, color: V.text2, paddingLeft: 4}}>
                                        {entry.author} · {entry.date}
                                    </div>
                                </div>
                            ))}
                            {logEntries.length === 0 && (
                                <p style={{color: V.text2, textAlign: 'center', padding: 20, fontSize: 12}}>
                                    {t('暂无提交记录')}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                     onPointerUp={handlePointerup}/>
                {drag && <div className="shell__overlay" onPointerUp={handlePointerup}/>}

                {/* 右侧操作区域 */}
                <div className={"studio-editor"}>
                    <div style={{
                        display: 'flex', flexDirection: 'column', height: '100%',
                        padding: '16px', gap: 12, overflow: 'auto',
                    }}>
                        {/* 分支信息 */}
                        <div style={{
                            padding: '12px', borderRadius: 8, border: `1px solid ${V.border}`,
                            background: V.surface,
                        }}>
                            <div style={{fontSize: 13, fontWeight: 600, color: V.text, marginBottom: 8}}>
                                🌿 {t('分支')}: <span style={{color: V.green}}>{branchInfo.current}</span>
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                                {branchInfo.branches.map(b => (
                                    <button key={b}
                                            onClick={() => handleCheckout(b)}
                                            disabled={b === branchInfo.current || b.startsWith('*')}
                                            style={{
                                                padding: '4px 10px', borderRadius: 12, fontSize: 11,
                                                border: b === branchInfo.current ? `1px solid ${V.green}` : `1px solid ${V.border}`,
                                                background: b === branchInfo.current ? V.primaryLight : 'transparent',
                                                color: b === branchInfo.current ? V.green : V.text2,
                                                cursor: b === branchInfo.current ? 'default' : 'pointer',
                                                opacity: b === branchInfo.current ? 1 : 0.8,
                                            }}
                                    >
                                        {b.replace('remotes/origin/', '')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 提交区域 */}
                        <div style={{
                            padding: '12px', borderRadius: 8, border: `1px solid ${V.border}`,
                            background: V.surface, display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            <textarea
                                placeholder={t('输入提交信息...')}
                                value={commitMessage}
                                onChange={e => setCommitMessage(e.target.value)}
                                rows={2}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 8,
                                    border: `1px solid ${V.border}`, background: V.surface,
                                    color: V.text, fontSize: 13, boxSizing: 'border-box',
                                    resize: 'vertical',
                                }}
                            />
                            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                <button onClick={handleCommit} disabled={loading || !commitMessage.trim()}
                                        style={actionBtn(V.green)}>
                                    ✅ {t('提交')}
                                </button>
                                <button onClick={handleAddAll} style={actionBtn(V.primary)}>
                                    ➕ {t('暂存全部')}
                                </button>
                                <button onClick={handleAdd} style={actionBtn(V.primary)}>
                                    📥 {t('暂存选中')}
                                </button>
                                <button onClick={handleReset} style={actionBtn(V.yellow)}>
                                    ↩ {t('取消暂存')}
                                </button>
                            </div>
                        </div>

                        {/* 远程操作 */}
                        <div style={{
                            padding: '12px', borderRadius: 8, border: `1px solid ${V.border}`,
                            background: V.surface, display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            <div style={{fontSize: 13, fontWeight: 600, color: V.text}}>
                                ☁️ {t('远程操作')}
                            </div>
                            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                <button onClick={handlePull} disabled={loading} style={actionBtn(V.primary)}>
                                    ⬇ {t('拉取')}
                                </button>
                                <button onClick={() => handlePush(false)} disabled={loading} style={actionBtn(V.primary)}>
                                    ⬆ {t('推送')}
                                </button>
                                <button onClick={() => handlePush(true)} disabled={loading} style={actionBtn(V.red)}>
                                    ⚠ {t('强制推送')}
                                </button>
                            </div>
                            <div style={{display: 'flex', gap: 6}}>
                                <button onClick={handleStash} style={actionBtn(V.text2)}>
                                    📦 {t('暂存工作区')}
                                </button>
                                <button onClick={handleStashPop} style={actionBtn(V.text2)}>
                                    📤 {t('恢复工作区')}
                                </button>
                            </div>
                        </div>

                        {/* 说明 */}
                        <div style={{
                            padding: '12px', borderRadius: 8, border: `1px solid ${V.border}`,
                            background: V.surface2, fontSize: 11, color: V.text2, lineHeight: 1.6,
                        }}>
                            💡 {t('提示：')}
                            <ul style={{margin: '4px 0', paddingLeft: 16}}>
                                <li>{t('左侧勾选文件后，使用「暂存选中」将其加入暂存区')}</li>
                                <li>{t('输入提交信息后点击「提交」')}</li>
                                <li>{t('如有冲突，请自行在shell中解决冲突后再提交')}</li>
                                <li>{t('「强制推送」会覆盖远程分支，请谨慎使用')}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function actionBtn(color: string): React.CSSProperties {
    return {
        padding: '6px 12px', borderRadius: 6,
        border: `1px solid ${color}`, background: 'transparent',
        color, cursor: 'pointer', fontSize: 12,
    };
}