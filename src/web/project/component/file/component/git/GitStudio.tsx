import React, {useEffect, useState, useCallback, useRef} from 'react';
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {useNavigate} from "react-router-dom";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import {routerConfig} from "../../../../../../common/RouterConfig";
import * as lodash from "lodash";
import GitChangeList, {GitStatusFile} from "./GitChangeList";
import GitDiffView from "./GitDiffView";
import GitLogList, {GitLogEntry} from "./GitLogList";
import GitCommitDetail from "./GitCommitDetail";
import GitBlameView from "./GitBlameView";
import GitBranchBar from "./GitBranchBar";
import GitConfigPanel, {GitUserConfig, GitProxyConfig} from "./GitConfigPanel";
import GitTagPanel from "./GitTagPanel";
import GitStashPanel from "./GitStashPanel";
import GitRemotePanel from "./GitRemotePanel";
import GitRemoteDiff from "./GitRemoteDiff";
import GitConflictPanel from "./GitConflictPanel";
import GitReflogPanel from "./GitReflogPanel";
import GitHookPanel from "./GitHookPanel";
import GitRepoPanel, {RepoInfo} from "./GitRepoPanel";
import GitRepoManager from "./GitRepoManager";
import {using_confirm} from "../../../prompts/prompt.util";

interface GitBranchInfo {
    current: string;
    branches: string[];
}

/** 当前查看的 diff 目标：工作区改动 / 提交记录 / 逐行归属 / 远程分支比较 */
type DiffTarget =
    | {kind: 'working', path: string, staged: boolean}
    | {kind: 'commit', hash: string}
    | {kind: 'blame', file: string}
    | {kind: 'remote', branch: string};

/** 左侧面板页签 */
type Tab = 'status' | 'log';

/** 提交记录分页大小，滚动到底部时按此数量继续加载 */
const LOG_PAGE_SIZE = 100;

export default function GitStudio() {
    const {t} = useTranslation();
    const confirm_commit_all = using_confirm();
    const navigate = useNavigate();

    let dirPath = decodeURIComponent(getRouterAfter(routerConfig.git_page, getRouterPath()));
    dirPath = dirPath.replace(/\/+$/, '');

    // ===== 仓库数据 =====
    const [statusFiles, setStatusFiles] = useState<GitStatusFile[]>([]);
    const [logEntries, setLogEntries] = useState<GitLogEntry[]>([]);
    const [logHasMore, setLogHasMore] = useState(false);
    const [log_loading_more, setLog_loading_more] = useState(false);
    // 分页互斥锁用 ref：scroll 事件可能在同一 tick 连续触发，state 更新来不及充当守卫
    const log_loading_ref = useRef(false);
    const [branchInfo, setBranchInfo] = useState<GitBranchInfo>({current: '', branches: []});
    const [commitMessage, setCommitMessage] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<Tab>('status');
    const [loading, setLoading] = useState(false);

    // ===== 布局 =====
    const [navWidth, setNavWidth] = useState(20);
    const [drag, setDrag] = useState(false);
    const studioDividerRef = useRef(null);
    const studioNavRef = useRef(null);

    // ===== diff 面板 =====
    const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
    const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');

    // ===== 配置 =====
    const [userConfig, setUserConfig] = useState<GitUserConfig>({name: '', email: ''});
    const [proxyConfig, setProxyConfig] = useState<GitProxyConfig | null>(null);

    // ===== 冲突 =====
    const [conflictCount, setConflictCount] = useState(0);
    // ===== 搜索态：非空时提交列表显示搜索结果 =====
    const [searchEntries, setSearchEntries] = useState<GitLogEntry[] | null>(null);
    // ===== 仓库概览（远程地址 / 领先落后），用于分支行展示 =====
    const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
    // ===== 当前目录不是 git 仓库时，显示仓库管理视图 =====
    const [notRepo, setNotRepo] = useState(false);

    useEffect(() => {
        if (!dirPath) return;
        // status 决定是否为仓库：非仓库只显示仓库管理视图，避免其余接口连报错误
        loadStatus().then(is_repo => {
            if (!is_repo) return;
            loadLog();
            loadBranches();
            loadUserConfig();
            loadProxy();
            load_conflicts();
        });
    }, [dirPath]);

    const load_conflicts = async () => {
        try {
            const rsq = await gitHttp.post('conflicts', {path: dirPath});
            if (rsq.code === 0) setConflictCount((rsq.data?.files || []).length);
        } catch (e) {
        }
    };

    // ===== 数据加载 =====
    /**
     * 拉取工作区状态。
     * @returns 当前目录是否为 git 仓库
     */
    const loadStatus = async (): Promise<boolean> => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('status', {path: dirPath});
            if (rsq.code === 0) {
                setStatusFiles(rsq.data || []);
                setNotRepo(false);
                return true;
            }
            return false;
        } catch (e: any) {
            // http.post 在 code!==0 时直接 throw message，非仓库目录走这里
            const msg = typeof e === "string" ? e : e?.message;
            if (msg && msg.includes("not a git repository")) setNotRepo(true);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const loadLog = async () => {
        try {
            const rsq = await gitHttp.post('log', {path: dirPath, maxCount: LOG_PAGE_SIZE, skip: 0});
            if (rsq.code === 0) {
                const list = rsq.data || [];
                setLogEntries(list);
                setLogHasMore(list.length >= LOG_PAGE_SIZE);
            }
        } catch (e) {
        }
    };

    /** 滚动到底时追加下一页提交记录 */
    const load_more_log = async () => {
        // 用 ref 做同步守卫：React 状态更新是异步的，连续 scroll 事件会在同一 tick 重复进入
        if (log_loading_ref.current || !logHasMore) return;
        log_loading_ref.current = true;
        setLog_loading_more(true);
        try {
            const rsq = await gitHttp.post('log', {path: dirPath, maxCount: LOG_PAGE_SIZE, skip: logEntries.length});
            if (rsq.code === 0) {
                const list = rsq.data || [];
                // 用函数式更新基于最新列表累积，避免闭包拿到旧值
                setLogEntries(prev => [...prev, ...list]);
                setLogHasMore(list.length >= LOG_PAGE_SIZE);
            }
        } catch (e) {
        } finally {
            log_loading_ref.current = false;
            setLog_loading_more(false);
        }
    };

    /** 提交记录滚动到底部附近时加载下一页 */
    const on_log_scroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (searchEntries !== null) return;   // 搜索结果不支持分页
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) load_more_log();
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
            if (rsq.code === 0) setUserConfig(rsq.data);
        } catch (e) {
        }
    };

    const loadProxy = async () => {
        try {
            const rsq = await gitHttp.post('get_proxy', {path: dirPath});
            if (rsq.code === 0) setProxyConfig(rsq.data);
        } catch (e) {
        }
    };

    // ===== diff 查看 =====
    /** 查看工作区某文件的改动 */
    const view_file_diff = async (file: GitStatusFile, staged: boolean) => {
        // 未跟踪文件没有可对比的历史版本（.git 里不存在），无需请求内容接口
        if (file.untracked) {
            NotyFail(t('未跟踪文件无差异'));
            return;
        }
        // 两版内容由 GitDiffView 自行按 ref 拉取，这里只确定对比目标
        setDiffTarget({kind: 'working', path: file.path, staged});
    };

    /** 点击提交记录 → 显示提交详情 */
    const view_commit = (hash: string) => {
        setDiffTarget({kind: 'commit', hash});
    };

    /** 从变更列表直接查看逐行归属 */
    const view_blame = (file: GitStatusFile) => {
        setDiffTarget({kind: 'blame', file: file.path});
    };

    // ===== 文件选择 =====
    const toggleFile = (filePath: string) => {
        const next = new Set(selectedFiles);
        if (next.has(filePath)) next.delete(filePath);
        else next.add(filePath);
        setSelectedFiles(next);
    };

    /** 批量切换选中态（分组头全选/全不选） */
    const toggle_all = (paths: string[], checked: boolean) => {
        const next = new Set(selectedFiles);
        for (const p of paths) {
            if (checked) next.add(p);
            else next.delete(p);
        }
        setSelectedFiles(next);
    };

    // ===== 暂存操作 =====
    /** 暂存/取消暂存单个文件 */
    const stage_one = async (file: GitStatusFile, staged: boolean) => {
        try {
            const rsq = staged
                ? await gitHttp.post('reset', {path: dirPath, files: [file.path]})
                : await gitHttp.post('add', {path: dirPath, files: [file.path]});
            if (rsq.code === 0) {
                await loadStatus();
                // 文件所属区域切换了，重新拉取对应 diff
                if (diffTarget?.kind === 'working' && diffTarget.path === file.path) {
                    view_file_diff(file, !staged);
                }
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    /** 批量暂存/取消暂存一个分组 */
    const stage_section = async (files: GitStatusFile[], staged: boolean) => {
        if (files.length === 0) return;
        const paths = files.map(f => f.path);
        try {
            const rsq = staged
                ? await gitHttp.post('reset', {path: dirPath, files: paths})
                : await gitHttp.post('add', {path: dirPath, files: paths});
            if (rsq.code === 0) {
                NotySuccess(staged ? t('已取消暂存') : t('已暂存'));
                await loadStatus();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    // ===== 提交与远程 =====
    const handleCommit = async () => {
        if (!commitMessage.trim()) { NotyFail(t('请输入提交信息')); return; }
        const staged = statusFiles.filter(f => f.staged);
        if (staged.length === 0) {
            // 仿 JetBrains：暂存区为空但工作区有改动时，询问是否一并提交，而不是直接拒绝
            const unstaged = statusFiles.filter(f => !f.staged);
            if (unstaged.length === 0) {
                NotyFail(t('没有可提交的更改'));
                return;
            }
            confirm_commit_all({
                title: t('提交'),
                sub_title: t('存在未暂存的改动，是否一并暂存并提交？'),
                confirm_fun: commit_all,
            });
            return;
        }
        await do_commit(false);
    };

    /** 暂存全部改动后提交（用户确认「一并提交未暂存的改动」时使用） */
    const commit_all = async () => {
        const unstaged = statusFiles.filter(f => !f.staged);
        try {
            setLoading(true);
            const rsq = await gitHttp.post('add', {path: dirPath, files: unstaged.map(f => f.path)});
            if (rsq.code !== 0) { NotyFail(rsq.message); return; }
        } catch (e: any) { NotyFail(e?.message); return; }
        finally { setLoading(false); }
        await do_commit(false);
    };

    const do_commit = async (allChanged: boolean) => {
        try {
            setLoading(true);
            // allChanged=false：只提交已暂存内容，未暂存的改动保持原样
            const rsq = await gitHttp.post('commit', {
                path: dirPath, message: commitMessage.trim(), allChanged
            });
            if (rsq.code === 0) {
                NotySuccess(t('提交成功'));
                setCommitMessage('');
                setDiffTarget(null);
                await loadStatus();
                loadLog();
            } else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    /** 修改最后一次提交（信息 + 已暂存内容） */
    const handleAmend = async () => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('commit_amend', {path: dirPath, message: commitMessage});
            if (rsq.code === 0) {
                NotySuccess(t('已修改最后一次提交'));
                setCommitMessage('');
                setDiffTarget(null);
                await loadStatus();
                loadLog();
            } else NotyFail(rsq.message);
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
            if (rsq.code === 0) { NotySuccess(t('拉取成功')); await loadStatus(); loadLog(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleStash = async () => {
        try {
            const rsq = await gitHttp.post('stash', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('暂存工作区成功')); setDiffTarget(null); await loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    const handleStashPop = async () => {
        try {
            const rsq = await gitHttp.post('stash_pop', {path: dirPath});
            if (rsq.code === 0) { NotySuccess(t('恢复工作区成功')); await loadStatus(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
    };

    /** 切换分支后刷新所有仓库状态 */
    const refresh_repo = async () => {
        setDiffTarget(null);
        await loadStatus();
        loadLog();
        loadBranches();
    };

    const handleCheckout = async (branch: string) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('checkout', {path: dirPath, branch});
            if (rsq.code === 0) { NotySuccess(t('切换分支成功')); await refresh_repo(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleBranchCreate = async (name: string) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('branch_create', {path: dirPath, name});
            if (rsq.code === 0) { NotySuccess(t('分支创建成功')); await refresh_repo(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleBranchDelete = async (name: string, force: boolean) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('branch_delete', {path: dirPath, name, force});
            if (rsq.code === 0) { NotySuccess(t('分支删除成功')); await refresh_repo(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const handleMerge = async (branch: string) => {
        try {
            setLoading(true);
            const rsq = await gitHttp.post('merge', {path: dirPath, branch});
            if (rsq.code === 0) { NotySuccess(t('合并成功')); await refresh_repo(); }
            else NotyFail(rsq.message);
        } catch (e: any) { NotyFail(e?.message); }
        finally { setLoading(false); }
    };

    const cancel = () => navigate(-1);

    // ===== 拖拽分隔条 =====
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
    const handlePointerUp = () => {
        setDrag(false);
        studioNavRef.current.removeEventListener("pointermove", handleDrag);
    };

    const dirName = dirPath.split('/').filter(Boolean).pop() || dirPath;

    /** 右侧 diff 区域：按目标类型渲染不同面板 */
    const render_diff_area = () => {
        if (!diffTarget) {
            return (
                <div className="git-card git-card--placeholder">
                    {t('点击左侧文件查看差异')}
                </div>
            );
        }
        if (diffTarget.kind === 'commit') {
            return (
                <GitCommitDetail dir_path={dirPath}
                                 hash={diffTarget.hash}
                                 on_close={() => setDiffTarget(null)}
                                 on_changed={refresh_repo}/>
            );
        }
        if (diffTarget.kind === 'blame') {
            return (
                <GitBlameView dir_path={dirPath}
                              file={diffTarget.file}
                              on_close={() => setDiffTarget(null)}/>
            );
        }
        if (diffTarget.kind === 'remote') {
            return (
                <GitRemoteDiff dir_path={dirPath}
                               branch={diffTarget.branch}
                               current_branch={branchInfo.current}
                               on_close={() => setDiffTarget(null)}/>
            );
        }
        return (
            <div className="git-card git-card--diff">
                <div className="git-diff-header">
                    <span className="git-diff-header__badge">
                        {diffTarget.staged ? t('已暂存') : t('未暂存')}
                    </span>
                    <span className="git-diff-header__path" title={diffTarget.path}>{diffTarget.path}</span>
                    <div className="git-diff-header__modes">
                        <ActionButton icon={"view_agenda"} title={t('单栏')}
                                      selected={diffMode === 'unified'}
                                      onClick={() => setDiffMode('unified')}/>
                        <ActionButton icon={"view_column"} title={t('并排')}
                                      selected={diffMode === 'split'}
                                      onClick={() => setDiffMode('split')}/>
                        <ActionButton icon={"close"} title={t('关闭')}
                                      onClick={() => setDiffTarget(null)}/>
                    </div>
                </div>
                {diffTarget.staged
                    ? <GitDiffView dir_path={dirPath} file={diffTarget.path} left_ref="HEAD" right_ref="staged" mode={diffMode}/>
                    : <GitDiffView dir_path={dirPath} file={diffTarget.path} left_ref="HEAD" right_ref="worktree" mode={diffMode}/>}
            </div>
        );
    };

    return (
        <div className={"studio"}>
            <Header ignore_tags={true}
                    left_children={[
                        <ActionButton key={"close"} title={t("取消")} icon={"close"} onClick={cancel}/>,
                        <span key={"title"}>{dirName}</span>,
                    ]}>
                <ActionButton icon={"refresh"} title={t("刷新")} onClick={() => {
                    loadStatus(); loadLog(); loadBranches(); loadUserConfig(); loadProxy();
                }}/>
            </Header>

            {/* 非 git 仓库目录：只显示仓库管理，可选择或创建仓库 */}
            {notRepo ? (
                <div className={"studio-body"}>
                    <div className={"studio-editor"}>
                        <div className="git-main">
                            <div className="git-card">
                                <GitRepoManager dir_path={dirPath} on_changed={() => {
                                    setNotRepo(false);
                                    loadStatus();
                                    loadLog();
                                    loadBranches();
                                }}/>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={"studio-body"} ref={studioNavRef}>
                    {/* 左侧面板：使用项目标准 .menu 二级菜单样式 */}
                    <div className={"studio-nav studio-nav--git"} style={{width: `${navWidth - 1}em`}}>
                        <div className="menu git-menu not-select-div">
                            <div className="wrapper">
                                <ul>
                                    <li className={activeTab === 'status' ? 'active' : ''}
                                        onClick={() => setActiveTab('status')}>
                                        {t('变更')} ({statusFiles.length})
                                    </li>
                                    <li className={activeTab === 'log' ? 'active' : ''}
                                        onClick={() => setActiveTab('log')}>
                                        {t('提交记录')} ({logEntries.length})
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {activeTab === 'status' && (
                            <div className="git-scroll">
                                <GitChangeList
                                    files={statusFiles}
                                    selected={selectedFiles}
                                    on_toggle={toggleFile}
                                    on_toggle_all={toggle_all}
                                    active_path={diffTarget?.kind === 'working' ? diffTarget.path : null}
                                    on_view_diff={view_file_diff}
                                    on_stage_section={stage_section}
                                    on_stage_one={stage_one}
                                    on_view_blame={view_blame}
                                />
                            </div>
                        )}

                        {activeTab === 'log' && (
                            <div className="git-scroll">
                                <GitLogList
                                    dir_path={dirPath}
                                    entries={searchEntries ?? logEntries}
                                    is_search={searchEntries !== null}
                                    has_more={logHasMore}
                                    loading_more={log_loading_more}
                                    active_hash={diffTarget?.kind === 'commit' ? diffTarget.hash : null}
                                    on_select={view_commit}
                                    on_scroll_bottom={on_log_scroll}
                                    on_search_result={(list) => {
                                        setSearchEntries(list);
                                        if (list === null) loadLog();
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                         onPointerUp={handlePointerUp}/>
                    {drag && <div className="shell__overlay" onPointerUp={handlePointerUp}/>}

                    {/* 右侧区域 */}
                    <div className={"studio-editor"}>
                        <div className="git-main">
                            {/* 冲突（有冲突时才渲染） */}
                            <GitConflictPanel dir_path={dirPath} on_resolved={refresh_repo}/>

                            {/* 提交区 */}
                            <div className="git-card">
                                <GitBranchBar current={branchInfo.current}
                                              branches={branchInfo.branches}
                                              on_checkout={handleCheckout}
                                              on_create={handleBranchCreate}
                                              on_delete={handleBranchDelete}
                                              on_merge={handleMerge}
                                              ahead={repoInfo?.ahead}
                                              behind={repoInfo?.behind}/>
                                <GitRemotePanel dir_path={dirPath}
                                                current_branch={branchInfo.current}
                                                on_checkout={refresh_repo}
                                                on_compare={(branch) => setDiffTarget({kind: 'remote', branch})}/>
                                <textarea className="git-commit-input"
                                          placeholder={t('git_msg')}
                                          value={commitMessage}
                                          onChange={e => setCommitMessage(e.target.value)}
                                          rows={3}/>
                                <div className="git-btn-row">
                                    <ActionButton icon={"check"} title={t('提交')} onClick={handleCommit}/>
                                    <ActionButton icon={"edit_note"} title={t('修改最后一次提交')}
                                                  onClick={handleAmend}/>
                                    <ActionButton icon={"download"} title={t('拉取')} onClick={handlePull}/>
                                    <ActionButton icon={"upload"} title={t('推送')} onClick={() => handlePush(false)}/>
                                    <ActionButton icon={"keyboard_double_arrow_up"} title={t('强制推送')}
                                                  onClick={() => handlePush(true)}/>
                                    <span className="git-btn-gap"/>
                                    <ActionButton icon={"inventory_2"} title={t('暂存工作区')} onClick={handleStash}/>
                                    <ActionButton icon={"unarchive"} title={t('恢复工作区')} onClick={handleStashPop}/>
                                </div>
                                <GitStashPanel dir_path={dirPath} on_changed={refresh_repo}/>
                                <GitTagPanel dir_path={dirPath}
                                             target_hash={diffTarget?.kind === 'commit' ? diffTarget.hash : undefined}
                                             on_changed={refresh_repo}/>
                                <GitReflogPanel dir_path={dirPath} on_changed={refresh_repo}/>
                            </div>

                            {/* diff / 提交详情 / blame */}
                            {render_diff_area()}

                            {/* 用户与代理配置 */}
                            <div className="git-card">
                                <GitConfigPanel dir_path={dirPath}
                                                user_config={userConfig}
                                                proxy_config={proxyConfig}
                                                on_user_config_saved={setUserConfig}
                                                on_proxy_saved={setProxyConfig}/>
                                <GitRepoPanel dir_path={dirPath}
                                              on_info_loaded={setRepoInfo}
                                              on_changed={refresh_repo}/>
                                <GitHookPanel dir_path={dirPath}/>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
