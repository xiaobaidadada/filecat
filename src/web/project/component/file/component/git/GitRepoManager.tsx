import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {useNavigate} from "react-router-dom";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {routerConfig} from "../../../../../../common/RouterConfig";

export interface RepoItem {
    name: string;
    path: string;
    branch: string;
}

interface Props {
    dir_path: string;
    /** 初始化/克隆成功后通知父组件切换回仓库视图 */
    on_changed: () => void;
}

/**
 * 仓库管理：扫描当前目录下的 git 仓库，支持初始化与克隆。
 * 从文件管理器进入 git 页面时，若当前目录不是仓库，可在此选择或创建。
 */
export default function GitRepoManager({dir_path, on_changed}: Props) {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [repos, setRepos] = useState<RepoItem[]>([]);
    const [dirs, setDirs] = useState<string[]>([]);
    const [mode, setMode] = useState<'none' | 'init' | 'clone'>('none');
    const [target, setTarget] = useState('');
    const [clone_url, setCloneUrl] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        load_repos();
        load_dirs();
    }, [dir_path]);

    const load_repos = async () => {
        try {
            const rsq = await gitHttp.post('repos', {path: dir_path});
            if (rsq.code === 0) setRepos(rsq.data || []);
        } catch (e) {
        }
    };

    const load_dirs = async () => {
        try {
            const rsq = await gitHttp.post('dirs', {path: dir_path});
            if (rsq.code === 0) setDirs(rsq.data?.dirs || []);
        } catch (e) {
        }
    };

    const enter_repo = (repo: RepoItem) => {
        // repo.path 是绝对路径，当前页面的 dir_path 已是相对用户根目录的路径，
        // 因此只需拼接目录名，避免重复带上根目录前缀
        navigate(`${routerConfig.git_page}/${dir_path}/${repo.name}/`.replace(/\/+/g, '/'));
    };

    const do_init = async () => {
        const name = target.trim();
        if (!name) { NotyFail(t('请输入目录名')); return; }
        setLoading(true);
        try {
            const rsq = await gitHttp.post('init', {path: `${dir_path}/${name}`.replace(/\/+/g, '/')});
            if (rsq.code === 0) {
                NotySuccess(t('仓库初始化成功'));
                setMode('none');
                setTarget('');
                await load_repos();
                await load_dirs();
                on_changed();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const do_clone = async () => {
        const name = target.trim();
        if (!name) { NotyFail(t('请输入目录名')); return; }
        if (!clone_url.trim()) { NotyFail(t('请输入仓库地址')); return; }
        setLoading(true);
        try {
            const rsq = await gitHttp.post('clone', {
                target: `${dir_path}/${name}`.replace(/\/+/g, '/'),
                url: clone_url.trim()
            });
            if (rsq.code === 0) {
                NotySuccess(t('克隆成功'));
                setMode('none');
                setTarget('');
                setCloneUrl('');
                await load_repos();
                await load_dirs();
                on_changed();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="git-repo-manager">
            <div className="git-repo-manager__header">
                <span className="git-sub-panel__title">{t('仓库')} ({repos.length})</span>
                <ActionButton icon={"add"} title={t('初始化仓库')}
                              selected={mode === 'init'}
                              onClick={() => { setMode(mode === 'init' ? 'none' : 'init'); setTarget(''); }}/>
                <ActionButton icon={"cloud_download"} title={t('克隆仓库')}
                              selected={mode === 'clone'}
                              onClick={() => { setMode(mode === 'clone' ? 'none' : 'clone'); setTarget(''); }}/>
            </div>

            {mode !== 'none' && (
                <div className="git-sub-panel__form">
                    <input className="input input--block" autoFocus value={target}
                           placeholder={t('目录名')}
                           onChange={e => setTarget(e.target.value)}
                           onKeyDown={e => e.key === 'Enter' && (mode === 'init' ? do_init() : do_clone())}/>
                    {mode === 'clone' && (
                        <input className="input input--block" value={clone_url}
                               placeholder={t('仓库地址')}
                               onChange={e => setCloneUrl(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && do_clone()}/>
                    )}
                    <div className="git-sub-panel__form-actions">
                        <span className="git-sub-panel__hint">
                            {`${dir_path}/${target || '...'}`.replace(/\/+/g, '/')}
                        </span>
                        <ActionButton icon={"check"} title={t('保存')}
                                      onClick={mode === 'init' ? do_init : do_clone}/>
                        <ActionButton icon={"close"} title={t('取消')}
                                      onClick={() => { setMode('none'); setTarget(''); setCloneUrl(''); }}/>
                    </div>
                    {dirs.length > 0 && (
                        <div className="git-repo-manager__dirs">
                            {dirs.map(d => (
                                <span key={d} className="git-repo-manager__dir"
                                      onClick={() => setTarget(d)}>{d}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="git-sub-panel__list">
                {repos.length === 0 && (
                    <div className="git-change-empty">{t('当前目录下没有仓库')}</div>
                )}
                {repos.map(r => (
                    <div className="git-sub-item" key={r.path}>
                        <span className="git-sub-item__name" title={r.name}>{r.name}</span>
                        <span className="git-sub-item__meta">{r.branch}</span>
                        <span className="git-sub-item__ops">
                            <ActionButton icon={"login"} title={t('进入')}
                                          onClick={() => enter_repo(r)}/>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
