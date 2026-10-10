import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";
import GitDiffView from "./GitDiffView";

/** 提交中单个文件的改动统计 */
interface CommitFile {
    path: string;
    /** 新增行数，二进制文件为 null */
    additions: number | null;
    deletions: number | null;
}

interface CommitMeta {
    hash: string;
    short_hash: string;
    subject: string;
    author: string;
    email: string;
    date: string;
    files: CommitFile[];
}

interface Props {
    dir_path: string;
    hash: string;
    on_close: () => void;
    /** 提交被 revert / cherry-pick 后刷新仓库状态 */
    on_changed?: () => void;
}

/**
 * 提交详情：顶部元信息，下方文件改动列表，点文件看该文件在此提交中的 diff。
 */
export default function GitCommitDetail({dir_path, hash, on_close, on_changed}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [meta, setMeta] = useState<CommitMeta | null>(null);
    const [selected_file, setSelectedFile] = useState<string | null>(null);
    const [diff_text, setDiffText] = useState('');
    const [diff_mode, setDiffMode] = useState<'unified' | 'split'>('unified');
    const [loading, setLoading] = useState(false);
    /** 当前 diff 的来源标签，如「与工作区对比」 */
    const [diff_target_label, setDiffTargetLabel] = useState('');

    useEffect(() => {
        if (!hash) return;
        setSelectedFile(null);
        setDiffText('');
        setDiffTargetLabel('');
        load_detail();
    }, [hash, dir_path]);

    const load_detail = async () => {
        try {
            const rsq = await gitHttp.post('commit_detail', {path: dir_path, hash});
            if (rsq.code === 0) setMeta(rsq.data);
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    /** 查看某文件在此提交中的改动 */
    const view_file_diff = async (file_path: string) => {
        setSelectedFile(file_path);
        setDiffTargetLabel('');
        setLoading(true);
        try {
            const rsq = await gitHttp.post('commit_diff', {path: dir_path, hash, file: file_path});
            if (rsq.code === 0) setDiffText(rsq.data || '');
            else { NotyFail(rsq.message); setDiffText(''); }
        } catch (e: any) {
            NotyFail(e?.message);
            setDiffText('');
        } finally {
            setLoading(false);
        }
    };

    /** 查看整次提交的完整 diff */
    const view_all_diff = async () => {
        setSelectedFile(null);
        setDiffTargetLabel('');
        setLoading(true);
        try {
            const rsq = await gitHttp.post('commit_diff', {path: dir_path, hash});
            if (rsq.code === 0) setDiffText(rsq.data || '');
            else { NotyFail(rsq.message); setDiffText(''); }
        } catch (e: any) {
            NotyFail(e?.message);
            setDiffText('');
        } finally {
            setLoading(false);
        }
    };

    if (!meta) {
        return (
            <div className="git-card git-card--diff">
                <div className="git-change-empty">{t('加载中')}</div>
            </div>
        );
    }

    /** 撤销该提交（生成反向提交，不改写历史，安全） */
    const revert_commit = () => {
        confirm_del({
            title: t('撤销提交'),
            sub_title: `${t('将生成一个反向提交来撤销')} ${meta.short_hash} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('revert', {path: dir_path, hash});
                    if (rsq.code === 0) { NotySuccess(t('已撤销')); on_changed?.(); }
                    else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    /** 把该提交摘到当前分支 */
    const cherry_pick = () => {
        confirm_del({
            title: t('摘取提交'),
            sub_title: `${t('将该提交应用到当前分支')} ${meta.short_hash} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('cherry_pick', {path: dir_path, hash});
                    if (rsq.code === 0) { NotySuccess(t('摘取成功')); on_changed?.(); }
                    else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    /** 当前选中的文件在该提交中的版本 与 工作区内容 对比 */
    const diff_with_worktree = async () => {
        if (!selected_file) { NotyFail(t('请先选择文件')); return; }
        setLoading(true);
        try {
            const rsq = await gitHttp.post('diff_with_worktree', {
                path: dir_path, hash, file: selected_file
            });
            if (rsq.code === 0) {
                setDiffText(rsq.data || '');
                setDiffTargetLabel(t('与工作区对比'));
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="git-card git-card--diff">
            {/* 提交元信息 */}
            <div className="git-commit-meta">
                <div className="git-commit-meta__row">
                    <span className="git-commit-meta__hash">{meta.short_hash}</span>
                    <span className="git-commit-meta__subject" title={meta.subject}>{meta.subject}</span>
                    {selected_file && (
                        <ActionButton icon={"compare_arrows"} title={t('与工作区对比')}
                                      onClick={diff_with_worktree}/>
                    )}
                    <ActionButton icon={"undo"} title={t('撤销提交')} onClick={revert_commit}/>
                    <ActionButton icon={"content_cut"} title={t('摘取提交')} onClick={cherry_pick}/>
                    <ActionButton icon={"close"} title={t('关闭')} onClick={on_close}/>
                </div>
                <div className="git-commit-meta__sub">
                    {meta.author} &lt;{meta.email}&gt; · {meta.date}
                </div>
            </div>

            <div className="git-commit-body">
                {/* 改动文件列表 */}
                <div className="git-commit-files">
                    <div
                        className={`git-commit-file${selected_file === null ? " git-commit-file--active" : ""}`}
                        onClick={view_all_diff}
                    >
                        <span className="git-commit-file__name">{t('全部文件')} ({meta.files.length})</span>
                    </div>
                    {meta.files.map(f => (
                        <div
                            key={f.path}
                            className={`git-commit-file${selected_file === f.path ? " git-commit-file--active" : ""}`}
                            onClick={() => view_file_diff(f.path)}
                            title={f.path}
                        >
                            <span className="git-commit-file__name">{f.path}</span>
                            {f.additions !== null && (
                                <span className="git-commit-file__stat">
                                    <span className="git-stat--add">+{f.additions}</span>
                                    <span className="git-stat--del">-{f.deletions}</span>
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* diff 区 */}
                <div className="git-commit-diff">
                    <div className="git-diff-header">
                        <span className="git-diff-header__badge">
                            {diff_target_label || `${t('提交')} ${meta.short_hash}`}
                        </span>
                        <span className="git-diff-header__path" title={selected_file ?? ''}>
                            {selected_file ?? `${t('全部文件')} (${meta.files.length})`}
                        </span>
                        <div className="git-diff-header__modes">
                            <ActionButton icon={"view_agenda"} title={t('单栏')}
                                          selected={diff_mode === 'unified'}
                                          onClick={() => setDiffMode('unified')}/>
                            <ActionButton icon={"view_column"} title={t('并排')}
                                          selected={diff_mode === 'split'}
                                          onClick={() => setDiffMode('split')}/>
                        </div>
                    </div>
                    {loading
                        ? <div className="git-change-empty">{t('加载中')}</div>
                        : <GitDiffView diff_text={diff_text} mode={diff_mode}/>}
                </div>
            </div>
        </div>
    );
}
