import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";

export interface RepoInfo {
    branch: string;
    head_hash: string;
    remote_url: string;
    ahead: number;
    behind: number;
    path: string;
}

export interface SubmoduleItem {
    path: string;
    hash: string;
    desc: string;
    status: 'uninitialized' | 'modified' | 'ok';
}

interface Props {
    dir_path: string;
    on_info_loaded: (info: RepoInfo) => void;
    /** 子模块更新后刷新仓库状态 */
    on_changed: () => void;
}

/**
 * 仓库概览 + 子模块管理。
 * 概览展示远程地址与领先/落后提交数；子模块支持一键初始化更新。
 */
export default function GitRepoPanel({dir_path, on_info_loaded, on_changed}: Props) {
    const {t} = useTranslation();
    const [info, setInfo] = useState<RepoInfo | null>(null);
    const [submodules, setSubmodules] = useState<SubmoduleItem[]>([]);
    const [sub_open, setSubOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        load_info();
        load_submodules();
    }, [dir_path]);

    const load_info = async () => {
        try {
            const rsq = await gitHttp.post('repo_info', {path: dir_path});
            if (rsq.code === 0) {
                setInfo(rsq.data);
                on_info_loaded(rsq.data);
            }
        } catch (e) {
        }
    };

    const load_submodules = async () => {
        try {
            const rsq = await gitHttp.post('submodules', {path: dir_path});
            if (rsq.code === 0) setSubmodules(rsq.data || []);
        } catch (e) {
        }
    };

    const update_submodules = async () => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('submodule_update', {path: dir_path});
            if (rsq.code === 0) {
                NotySuccess(t('子模块更新完成'));
                await load_submodules();
                on_changed();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const status_label = (s: SubmoduleItem['status']) => {
        if (s === 'uninitialized') return t('未初始化');
        if (s === 'modified') return t('与记录不一致');
        return t('正常');
    };

    return (
        <div className="git-repo-panel">
            <div className="git-config-row">
                <span className="git-config__label">{t('远程地址')}</span>
                <span className="git-config__value" title={info?.remote_url}>
                    {info?.remote_url || t('未配置')}
                </span>
            </div>
            <div className="git-config-row">
                <span className="git-config__label">{t('当前提交')}</span>
                <span className="git-config__value">
                    {info?.head_hash || ''}
                    {info && (info.ahead > 0 || info.behind > 0) && (
                        <span className="git-repo-panel__counts">
                            {info.ahead > 0 && <span className="git-ahead">↑{info.ahead}</span>}
                            {info.behind > 0 && <span className="git-behind">↓{info.behind}</span>}
                        </span>
                    )}
                </span>
            </div>
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title"
                      onClick={() => setSubOpen(!sub_open)}
                      style={{cursor: 'pointer'}}>
                    {t('子模块')} ({submodules.length}) {sub_open ? '▾' : '▸'}
                </span>
                {submodules.length > 0 && (
                    <ActionButton icon={"sync"} title={t('初始化并更新子模块')} onClick={update_submodules}/>
                )}
            </div>
            {sub_open && (
                <div className="git-sub-panel__list">
                    {submodules.length === 0 && <div className="git-change-empty">{t('无子模块')}</div>}
                    {submodules.map(s => (
                        <div className="git-sub-item" key={s.path}>
                            <span className="git-sub-item__name" title={s.path}>{s.path}</span>
                            <span className="git-sub-item__desc" title={s.desc}>{s.desc}</span>
                            <span className={`git-sub-item__meta git-sub-status--${s.status}`}>
                                {status_label(s.status)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
