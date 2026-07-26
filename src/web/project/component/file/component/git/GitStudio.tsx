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

interface GitUserConfig {
    name: string;
    email: string;
}

interface GitProxyConfig {
    global: { http: string; https: string };
    local: { http: string; https: string };
}

// 状态颜色映射
const STATUS_COLORS: Record<string, string> = {
    modified: '#f9ab00',
    added: 'var(--secondary, #34a853)',
    deleted: 'var(--accent, #ea4335)',
    untracked: 'var(--textSecondary, #5f6368)',
    renamed: 'var(--primary, #1a73e8)',
    conflict: 'var(--accent, #ea4335)',
};

const STATUS_LABELS: Record<string, string> = {
    modified: 'M', added: 'A', deleted: 'D',
    untracked: '?', renamed: 'R', conflict: '!',
};

export default function GitStudio() {
    const {t} = useTranslation();
    const navigate = useNavigate();

    let dirPath = decodeURIComponent(getRouterAfter(routerConfig.git_page, getRouterPath()));
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

    // Git 用户配置
    const [userConfig, setUserConfig] = useState<GitUserConfig>({name: '', email: ''});
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [configEditing, setConfigEditing] = useState(false);

    // Git 代理配置
    const [proxyConfig, setProxyConfig] = useState<GitProxyConfig | null>(null);
    const [proxyEditing, setProxyEditing] = useState(false);
    const [editProxyGlobalHttp, setEditProxyGlobalHttp] = useState('');
    const [editProxyGlobalHttps, setEditProxyGlobalHttps] = useState('');
    const [editProxyLocalHttp, setEditProxyLocalHttp] = useState('');
    const [editProxyLocalHttps, setEditProxyLocalHttps] = useState('');

    useEffect(() => {
        if (!dirPath) return;
        loadStatus();
        loadLog();
        loadBranches();
        loadUserConfig();
        loadProxy();
    }, [dirPath]);

    // ===== 数据加载 =====
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

    const loadUserConfig = async () => {
        try {
            const rsq = await gitHttp.post('get_user_config', {path: dirPath});
            if (rsq.code === 0) {
                setUserConfig(rsq.data);
                setEditName(rsq.data.name || '');
                setEditEmail(rsq.data.email || '');
            }
        } catch (e) {
        }
    };

    const loadProxy = async () => {
        try {
            const rsq = await gitHttp.post('get_proxy', {path: dirPath});
            if (rsq.code === 0) {
                setProxyConfig(rsq.data);
                setEditProxyGlobalHttp(rsq.data.global?.http || '');
                setEditProxyGlobalHttps(rsq.data.global?.https || '');
                setEditProxyLocalHttp(rsq.data.local?.http || '');
                setEditProxyLocalHttps(rsq.data.local?.https || '');
            }
        } catch (e) {
        }
    };

    // ===== 文件选择 =====
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

    // ===== Git 操作 =====
    const handleAdd = async () => {
        if (selectedFiles.size === 0) { NotyFail(t('请先选择文件')); return; }
        try {
            const rsq = await gitHttp.post('add', {path: dirPath, files: [...selectedFiles]});
            if (rsq.code === 0) { NotySuccess(t('已暂存')); setSelectedFiles(new Set()); loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleAddAll = async () => {
        try {
            const rsq = await gitHttp.post('add_all', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('已暂存全部')); loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleReset = async () => {
        if (selectedFiles.size === 0) { NotyFail(t('请先选择文件')); return; }
        try {
            const rsq = await gitHttp.post('reset', {path: dirPath, files: [...selectedFiles]});
            if (rsq.code === 0) { NotySuccess(t('已取消暂存')); setSelectedFiles(new Set()); loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) { NotyFail(t('请输入提交信息')); return; }
        try {
            setLoading(true);
            const rsq = await gitHttp.post('commit', {path: dirPath, message: commitMessage.trim(), allChanged: true});
            if (rsq.code === 0) { NotySuccess(t('提交成功')); setCommitMessage(''); loadStatus(); loadLog(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handlePush = async (force = false) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('push', {path: dirPath, force});
            if (rsq.code === 0) NotySuccess(t('推送成功'));
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handlePull = async () => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('pull', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('拉取成功')); loadStatus(); loadLog(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleCheckout = async (branch: string) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('checkout', {path: dirPath, branch});
            if (rsq.code === 0) { NotySuccess(t('切换分支成功')); loadStatus(); loadLog(); loadBranches(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleStash = async () => {
        try {
            const rsq = await gitHttp.post('stash', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('暂存工作区成功')); loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleStashPop = async () => {
        try {
            const rsq = await gitHttp.post('stash_pop', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('恢复工作区成功')); loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    // ===== 配置操作 =====
    const handleSaveUserConfig = async () => {
        try {
            const rsq = await gitHttp.post('set_user_config', {path: dirPath, name: editName, email: editEmail});
            if (rsq.code === 0) { NotySuccess(t('用户配置已保存')); setConfigEditing(false); loadUserConfig(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleSaveProxy = async () => {
        try {
            // 逐项保存，4 个可能的配置项
            const items = [
                {scope: 'global', type: 'http', value: editProxyGlobalHttp},
                {scope: 'global', type: 'https', value: editProxyGlobalHttps},
                {scope: 'local', type: 'http', value: editProxyLocalHttp},
                {scope: 'local', type: 'https', value: editProxyLocalHttps},
            ];
            for (const item of items) {
                await gitHttp.post('set_proxy', {path: dirPath, ...item});
            }
            NotySuccess(t('代理配置已保存'));
            setProxyEditing(false);
            loadProxy();
        } catch (e: any) { NotyFail(e?.message); }
    };

    const cancel = () => navigate(-1);

    // ===== 拖拽 =====
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
                    loadStatus(); loadLog(); loadBranches(); loadUserConfig(); loadProxy();
                }}/>
            </Header>
            <div className={"studio-body"} ref={studioNavRef}>
                {/* 左侧面板 */}
                <div className={"studio-nav"} style={{width: `${navWidth - 1}em`}}>
                    {/* Tab 切换 */}
                    <div className="git-studio-tab-bar">
                        <button className={`git-studio-tab ${activeTab === 'status' ? 'git-studio-tab--active' : ''}`}
                                onClick={() => setActiveTab('status')}>
                            📝 {t('变更')} ({statusFiles.length})
                        </button>
                        <button className={`git-studio-tab ${activeTab === 'log' ? 'git-studio-tab--active' : ''}`}
                                onClick={() => setActiveTab('log')}>
                            📜 {t('提交记录')} ({logEntries.length})
                        </button>
                    </div>

                    {/* 状态列表 */}
                    {activeTab === 'status' && (
                        <div style={{flex: 1, overflow: 'auto'}}>
                            {statusFiles.length > 0 && (
                                <div className="git-studio-select-all" onClick={toggleAll}>
                                    <input type="checkbox"
                                           checked={selectedFiles.size === statusFiles.length && statusFiles.length > 0}
                                           onChange={toggleAll}/>
                                    <span>{t('全选')} ({selectedFiles.size}/{statusFiles.length})</span>
                                </div>
                            )}
                            {statusFiles.map(f => (
                                <div key={f.path}
                                     className={`git-studio-file-item ${selectedFiles.has(f.path) ? 'git-studio-file-item--selected' : ''}`}
                                     onClick={() => toggleFile(f.path)}>
                                    <input type="checkbox" checked={selectedFiles.has(f.path)} onChange={() => {}}/>
                                    <span className="git-studio-status-badge"
                                          style={{background: STATUS_COLORS[f.status] || STATUS_COLORS.untracked}}>
                                        {STATUS_LABELS[f.status] || f.status}
                                    </span>
                                    <span className="git-studio-filename">
                                        {f.path}
                                        {f.oldPath && <span style={{color: 'var(--textSecondary)', fontSize: 11}}> (← {f.oldPath})</span>}
                                    </span>
                                </div>
                            ))}
                            {statusFiles.length === 0 && (
                                <p style={{color: 'var(--textSecondary)', textAlign: 'center', padding: 20, fontSize: 12}}>
                                    {t('没有变更')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* 日志列表 */}
                    {activeTab === 'log' && (
                        <div style={{flex: 1, overflow: 'auto'}}>
                            {logEntries.map((entry, i) => (
                                <div key={i} className="git-studio-log-entry">
                                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                        <span className="git-studio-log-hash">{entry.hash}</span>
                                        <span style={{fontSize: 13, color: 'var(--textPrimary)', flex: 1}}>
                                            {entry.message}
                                        </span>
                                    </div>
                                    <div style={{fontSize: 11, color: 'var(--textSecondary)', paddingLeft: 4}}>
                                        {entry.author} · {entry.date}
                                    </div>
                                </div>
                            ))}
                            {logEntries.length === 0 && (
                                <p style={{color: 'var(--textSecondary)', textAlign: 'center', padding: 20, fontSize: 12}}>
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
                    <div style={{display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: 12, overflow: 'auto'}}>

                        {/* 分支信息 */}
                        <div className="git-studio-card">
                            <div className="git-studio-card-title">
                                🌿 {t('分支')}: <span style={{color: 'var(--secondary, #34a853)'}}>{branchInfo.current}</span>
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                                {branchInfo.branches.map(b => (
                                    <button key={b}
                                            className={`git-studio-branch-chip ${b === branchInfo.current ? 'git-studio-branch-chip--current' : ''}`}
                                            onClick={() => handleCheckout(b)}
                                            disabled={b === branchInfo.current || b.startsWith('*')}>
                                        {b.replace('remotes/origin/', '')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 提交区域 */}
                        <div className="git-studio-card">
                            <textarea className="git-studio-textarea"
                                placeholder={t('输入提交信息...')}
                                value={commitMessage}
                                onChange={e => setCommitMessage(e.target.value)}
                                rows={2}/>
                            <div className="git-studio-btn-row">
                                <button className="git-studio-btn" onClick={handleCommit}
                                        disabled={loading || !commitMessage.trim()}
                                        style={{borderColor: 'var(--secondary, #34a853)', color: 'var(--secondary, #34a853)'}}>
                                    ✅ {t('提交')}
                                </button>
                                <button className="git-studio-btn" onClick={handleAddAll}>➕ {t('暂存全部')}</button>
                                <button className="git-studio-btn" onClick={handleAdd}>📥 {t('暂存选中')}</button>
                                <button className="git-studio-btn" onClick={handleReset}
                                        style={{borderColor: '#f9ab00', color: '#f9ab00'}}>
                                    ↩ {t('取消暂存')}
                                </button>
                            </div>
                        </div>

                        {/* 远程操作 */}
                        <div className="git-studio-card">
                            <div className="git-studio-card-title">☁️ {t('远程操作')}</div>
                            <div className="git-studio-btn-row">
                                <button className="git-studio-btn" onClick={handlePull} disabled={loading}>⬇ {t('拉取')}</button>
                                <button className="git-studio-btn" onClick={() => handlePush(false)} disabled={loading}>⬆ {t('推送')}</button>
                                <button className="git-studio-btn" onClick={() => handlePush(true)} disabled={loading}
                                        style={{borderColor: 'var(--accent, #ea4335)', color: 'var(--accent, #ea4335)'}}>
                                    ⚠ {t('强制推送')}
                                </button>
                            </div>
                            <div className="git-studio-btn-row">
                                <button className="git-studio-btn" onClick={handleStash}
                                        style={{borderColor: 'var(--textSecondary)', color: 'var(--textSecondary)'}}>
                                    📦 {t('暂存工作区')}
                                </button>
                                <button className="git-studio-btn" onClick={handleStashPop}
                                        style={{borderColor: 'var(--textSecondary)', color: 'var(--textSecondary)'}}>
                                    📤 {t('恢复工作区')}
                                </button>
                            </div>
                        </div>

                        {/* Git 用户配置 */}
                        <div className="git-studio-card">
                            <div className="git-studio-card-title">👤 {t('用户配置')}</div>
                            {!configEditing ? (
                                <>
                                    <div className="git-studio-config-row">
                                        <span className="git-studio-config-label">{t('用户名')}:</span>
                                        <span style={{fontSize: 13, color: 'var(--textPrimary)'}}>{userConfig.name || '-'}</span>
                                    </div>
                                    <div className="git-studio-config-row">
                                        <span className="git-studio-config-label">{t('邮箱')}:</span>
                                        <span style={{fontSize: 13, color: 'var(--textPrimary)'}}>{userConfig.email || '-'}</span>
                                    </div>
                                    <div className="git-studio-btn-row">
                                        <button className="git-studio-btn" onClick={() => setConfigEditing(true)}>✏ {t('修改')}</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="git-studio-config-row">
                                        <span className="git-studio-config-label">{t('用户名')}:</span>
                                        <input className="git-studio-input" value={editName}
                                               onChange={e => setEditName(e.target.value)} placeholder="user.name"/>
                                    </div>
                                    <div className="git-studio-config-row">
                                        <span className="git-studio-config-label">{t('邮箱')}:</span>
                                        <input className="git-studio-input" value={editEmail}
                                               onChange={e => setEditEmail(e.target.value)} placeholder="user.email"/>
                                    </div>
                                    <div className="git-studio-btn-row">
                                        <button className="git-studio-btn" onClick={handleSaveUserConfig}>💾 {t('保存')}</button>
                                        <button className="git-studio-btn" onClick={() => { setConfigEditing(false); setEditName(userConfig.name); setEditEmail(userConfig.email); }}>✖ {t('取消')}</button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Git 代理配置 */}
                        <div className="git-studio-card">
                            <div className="git-studio-card-title">🌐 {t('代理设置')}</div>
                            {!proxyEditing ? (
                                <>
                                    <div style={{fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)'}}>{t('全局代理')}</div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">http.proxy:</span>
                                        <span style={{color: 'var(--textPrimary)'}}>{proxyConfig?.global?.http || '-'}</span>
                                    </div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">https.proxy:</span>
                                        <span style={{color: 'var(--textPrimary)'}}>{proxyConfig?.global?.https || '-'}</span>
                                    </div>
                                    <div style={{fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)'}}>{t('仓库代理')}</div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">http.proxy:</span>
                                        <span style={{color: 'var(--textPrimary)'}}>{proxyConfig?.local?.http || '-'}</span>
                                    </div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">https.proxy:</span>
                                        <span style={{color: 'var(--textPrimary)'}}>{proxyConfig?.local?.https || '-'}</span>
                                    </div>
                                    <div className="git-studio-btn-row">
                                        <button className="git-studio-btn" onClick={() => setProxyEditing(true)}>✏ {t('修改')}</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)'}}>{t('全局代理')}</div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">http.proxy:</span>
                                        <input className="git-studio-input" value={editProxyGlobalHttp}
                                               onChange={e => setEditProxyGlobalHttp(e.target.value)} placeholder="http://127.0.0.1:7890"/>
                                    </div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">https.proxy:</span>
                                        <input className="git-studio-input" value={editProxyGlobalHttps}
                                               onChange={e => setEditProxyGlobalHttps(e.target.value)} placeholder="http://127.0.0.1:7890"/>
                                    </div>
                                    <div style={{fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)'}}>{t('仓库代理')}</div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">http.proxy:</span>
                                        <input className="git-studio-input" value={editProxyLocalHttp}
                                               onChange={e => setEditProxyLocalHttp(e.target.value)} placeholder="http://127.0.0.1:7890"/>
                                    </div>
                                    <div className="git-studio-proxy-item">
                                        <span className="git-studio-proxy-label">https.proxy:</span>
                                        <input className="git-studio-input" value={editProxyLocalHttps}
                                               onChange={e => setEditProxyLocalHttps(e.target.value)} placeholder="http://127.0.0.1:7890"/>
                                    </div>
                                    <div style={{fontSize: 11, color: 'var(--textSecondary)'}}>{t('留空清除该代理设置')}</div>
                                    <div className="git-studio-btn-row">
                                        <button className="git-studio-btn" onClick={handleSaveProxy}>💾 {t('保存')}</button>
                                        <button className="git-studio-btn" onClick={() => { setProxyEditing(false); loadProxy(); }}>✖ {t('取消')}</button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 说明 */}
                        <div style={{
                            padding: '12px', borderRadius: 8, border: '1px solid var(--divider, rgba(0,0,0,0.08))',
                            background: 'var(--surfaceSecondary, #f1f3f4)', fontSize: 11,
                            color: 'var(--textSecondary)', lineHeight: 1.6,
                        }}>
                            💡 {t('提示：')}
                            <ul style={{margin: '4px 0', paddingLeft: 16}}>
                                <li>{t('左侧勾选文件后，使用「暂存选中」将其加入暂存区')}</li>
                                <li>{t('输入提交信息后点击「提交」')}</li>
                                <li>{t('如有冲突，请自行在shell中解决冲突后再提交')}</li>
                                <li>{t('「强制推送」会覆盖远程分支，请谨慎使用')}</li>
                                <li>{t('用户配置和全局代理修改后对所有仓库生效')}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}