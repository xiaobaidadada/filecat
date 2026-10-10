import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {build_path_tree, PathTreeNode} from "./GitChangeList";
import GitDiffView from "./GitDiffView";
import CommitFileTree from "./CommitFileTree";

interface Props {
    dir_path: string;
    /** 远程分支名，如 origin/main */
    branch: string;
    /** 当前所在分支名 */
    current_branch: string;
    on_close: () => void;
}

/** 分支间改动的文件条目 */
export interface DiffFileItem {
    path: string;
    additions: number | null;
    deletions: number | null;
}

/**
 * 远程分支与当前分支的差异（对标 WebStorm 的 Compare with Current）。
 * 左侧列出两分支间改动的文件（目录树），选中后在右侧看该文件的两版对比。
 */
export default function GitRemoteDiff({dir_path, branch, current_branch, on_close}: Props) {
    const {t} = useTranslation();
    const [files, setFiles] = useState<DiffFileItem[]>([]);
    const [selected_file, setSelectedFile] = useState<string | null>(null);
    const [diff_mode, setDiffMode] = useState<'unified' | 'split'>('unified');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setSelectedFile(null);
        load_files();
    }, [dir_path, branch, current_branch]);

    const load_files = async () => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('diff_files', {path: dir_path, from: current_branch, to: branch});
            if (rsq.code === 0) setFiles(rsq.data || []);
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const tree = useMemo(() => build_path_tree(files.map(f => ({path: f.path, data: f}))), [files]);

    return (
        <div className="git-card git-card--diff">
            <div className="git-diff-header">
                <span className="git-diff-header__badge">{t('分支比较')}</span>
                <span className="git-diff-header__path" title={`${current_branch} ↔ ${branch}`}>
                    {current_branch} ↔ {branch}
                </span>
                {selected_file && (
                    <div className="git-diff-header__modes">
                        <ActionButton icon={"view_agenda"} title={t('单栏')}
                                      selected={diff_mode === 'unified'}
                                      onClick={() => setDiffMode('unified')}/>
                        <ActionButton icon={"view_column"} title={t('并排')}
                                      selected={diff_mode === 'split'}
                                      onClick={() => setDiffMode('split')}/>
                    </div>
                )}
                <ActionButton icon={"close"} title={t('关闭')} onClick={on_close}/>
            </div>
            <div className="git-commit-body">
                <div className="git-commit-files">
                    <div className="git-commit-file__count">{t('全部文件')} ({files.length})</div>
                    <CommitFileTree<DiffFileItem> nodes={tree} selected={selected_file}
                                                  on_select={setSelectedFile}/>
                </div>
                <div className="git-commit-diff">
                    {loading
                        ? <div className="git-diff-empty"><span>{t('加载中')}</span></div>
                        : !selected_file
                            ? <div className="git-diff-empty"><span>{t('请选择文件查看改动')}</span></div>
                            : <GitDiffView dir_path={dir_path} file={selected_file}
                                           left_ref={current_branch} right_ref={branch} mode={diff_mode}/>}
                </div>
            </div>
        </div>
    );
}
