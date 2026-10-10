import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {InputText} from "../../../../../meta/component/Input";
import {using_confirm} from "../../../prompts/prompt.util";

export interface RemoteBranch {
    name: string;
    hash: string;
    date: string;
}

interface Props {
    dir_path: string;
    /** 当前所在分支名，用于「与当前分支比较 / 合并到当前分支」文案与操作 */
    current_branch: string;
    /** 签出、合并、重命名、删除后需要刷新整个仓库状态 */
    on_checkout: () => void;
    /** 与当前分支比较 diff（由 GitStudio 统一渲染 diff 视图） */
    on_compare: (remote_branch: string) => void;
}

/**
 * 远程分支面板，操作对标 WebStorm：
 * 签出、与当前分支比较、合并到当前分支、重命名、删除（二次确认）。
 */
export default function GitRemotePanel({dir_path, current_branch, on_checkout, on_compare}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [branches, setBranches] = useState<RemoteBranch[]>([]);
    const [remotes, setRemotes] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    // 正在行内重命名的分支名
    const [renaming, setRenaming] = useState<string | null>(null);
    const [new_name, setNewName] = useState('');

    useEffect(() => {
        if (open) load_remote();
    }, [dir_path, open]);

    const load_remote = async () => {
        try {
            const rsq = await gitHttp.post('remote_branches', {path: dir_path});
            if (rsq.code === 0) {
                setBranches(rsq.data?.branches || []);
                setRemotes(rsq.data?.remotes || []);
            }
        } catch (e) {
        }
    };

    const fetch_remote = async (prune: boolean) => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('fetch', {path: dir_path, prune});
            if (rsq.code === 0) {
                NotySuccess(t('拉取完成'));
                await load_remote();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const checkout = async (branch: string) => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('checkout_remote', {path: dir_path, branch});
            if (rsq.code === 0) {
                NotySuccess(t('切换分支成功'));
                on_checkout();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const merge_into_current = async (branch: string) => {
        confirm_del({
            title: t('合并到当前分支'),
            sub_title: `${t('将')} ${branch} ${t('合并到')} ${current_branch} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('merge', {path: dir_path, branch});
                    if (rsq.code === 0) {
                        NotySuccess(t('合并成功'));
                        on_checkout();
                    } else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    /** 重命名：弹出输入框，确认后推新名到远程并删除旧名 */
    const start_rename = (branch: string) => {
        const slash = branch.indexOf("/");
        const old_name = slash >= 0 ? branch.substring(slash + 1) : branch;
        setNewName(old_name);
        setRenaming(branch);
    };

    const submit_rename = async () => {
        const branch = renaming;
        if (!branch || !new_name.trim()) return;
        setLoading(true);
        try {
            const rsq = await gitHttp.post('remote_branch_rename', {path: dir_path, branch, new_name: new_name.trim()});
            if (rsq.code === 0) {
                NotySuccess(t('重命名成功'));
                setRenaming(null);
                await load_remote();
                on_checkout();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const delete_branch = (branch: string) => {
        confirm_del({
            title: t('删除远程分支'),
            sub_title: `${t('确认删除远程分支')} ${branch} ? ${t('该分支会从远程仓库删除')}`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('remote_branch_delete', {path: dir_path, branch});
                    if (rsq.code === 0) {
                        NotySuccess(t('删除成功'));
                        await load_remote();
                    } else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    return (
        <div className="git-remote">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title"
                      onClick={() => setOpen(!open)}>
                    {t('远程分支')} ({branches.length}) {open ? '▾' : '▸'}
                </span>
                <ActionButton icon={"cloud_download"} title={t('拉取远程信息')}
                              onClick={() => fetch_remote(false)}/>
                <ActionButton icon={"cleaning_services"} title={t('拉取并清理已删除分支')}
                              onClick={() => fetch_remote(true)}/>
            </div>
            {open && (
                <div className="git-sub-panel__list">
                    {remotes.length === 0 && <div className="git-change-empty">{t('未配置远程仓库')}</div>}
                    {branches.map(b => (
                        <React.Fragment key={b.name}>
                            <div className="git-sub-item">
                                <span className="git-sub-item__name" title={b.name}>{b.name}</span>
                                <span className="git-sub-item__meta">{b.date}</span>
                                <span className="git-sub-item__ops">
                                    <ActionButton icon={"call_split"} title={t('签出到本地')}
                                                  onClick={() => checkout(b.name)}/>
                                    <ActionButton icon={"compare_arrows"} title={t('与当前分支比较')}
                                                  onClick={() => on_compare(b.name)}/>
                                    <ActionButton icon={"merge"} title={t('合并到当前分支')}
                                                  onClick={() => merge_into_current(b.name)}/>
                                    <ActionButton icon={"drive_file_rename_outline"} title={t('重命名')}
                                                  onClick={() => start_rename(b.name)}/>
                                    <ActionButton icon={"delete"} title={t('删除')}
                                                  onClick={() => delete_branch(b.name)}/>
                                </span>
                            </div>
                            {renaming === b.name && (
                                <div className="git-remote__rename">
                                    <InputText value={new_name}
                                               width={"12rem"}
                                               handleInputChange={v => setNewName(v)}/>
                                    <ActionButton icon={"check"} title={t('确定')} onClick={submit_rename}/>
                                    <ActionButton icon={"close"} title={t('取消')}
                                                  onClick={() => setRenaming(null)}/>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
