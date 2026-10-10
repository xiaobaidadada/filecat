import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import GitDiffView from "./GitDiffView";

interface Props {
    dir_path: string;
    /** 远程分支名，如 origin/main */
    branch: string;
    /** 当前所在分支名 */
    current_branch: string;
    on_close: () => void;
}

/**
 * 远程分支与当前分支的差异（WebStorm 的 Compare with Current）。
 * 用 diff_commits 拉 当前分支 → 远程分支 的两点 diff，交给 GitDiffView 渲染。
 */
export default function GitRemoteDiff({dir_path, branch, current_branch, on_close}: Props) {
    const {t} = useTranslation();
    const [diff_text, setDiffText] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, [dir_path, branch, current_branch]);

    const load = async () => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('diff_commits', {
                path: dir_path,
                from: current_branch,
                to: branch,
            });
            if (rsq.code === 0) setDiffText(rsq.data || '');
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="git-card git-card--diff">
            <div className="git-diff-header">
                <span className="git-diff-header__badge">{t('分支比较')}</span>
                <span className="git-diff-header__path" title={`${current_branch} ↔ ${branch}`}>
                    {current_branch} ↔ {branch}
                </span>
                <ActionButton icon={"close"} title={t('关闭')} onClick={on_close}/>
            </div>
            {loading ? (
                <div className="git-card--placeholder">{t('加载中')}</div>
            ) : diff_text ? (
                <GitDiffView diff_text={diff_text}/>
            ) : (
                <div className="git-card--placeholder">{t('两个分支没有差异')}</div>
            )}
        </div>
    );
}
