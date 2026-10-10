import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

export interface GitStash {
    ref: string;
    message: string;
    date: string;
}

interface Props {
    dir_path: string;
    on_changed: () => void;
}

/**
 * Stash 列表：应用 / 弹出 / 删除指定 stash。
 */
export default function GitStashPanel({dir_path, on_changed}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [stashes, setStashes] = useState<GitStash[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (open) load_stashes();
    }, [dir_path, open]);

    const load_stashes = async () => {
        try {
            const rsq = await gitHttp.post('stash_list', {path: dir_path});
            if (rsq.code === 0) setStashes(rsq.data || []);
        } catch (e) {
        }
    };

    const apply = async (ref: string, pop: boolean) => {
        try {
            const rsq = await gitHttp.post('stash_apply', {path: dir_path, ref, pop});
            if (rsq.code === 0) {
                NotySuccess(pop ? t('已恢复并删除记录') : t('已应用'));
                await load_stashes();
                on_changed();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const drop = (ref: string) => {
        confirm_del({
            title: t('删除记录'),
            sub_title: `${t('确认删除')} ${ref} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('stash_drop', {path: dir_path, ref});
                    if (rsq.code === 0) { NotySuccess(t('已删除')); await load_stashes(); }
                    else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    return (
        <div className="git-stash">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title"
                      onClick={() => setOpen(!open)}
                      style={{cursor: 'pointer'}}>
                    {t('暂存工作区记录')} {open ? '▾' : '▸'}
                </span>
            </div>
            {open && (
                <div className="git-sub-panel__list">
                    {stashes.length === 0 && <div className="git-change-empty">{t('暂无记录')}</div>}
                    {stashes.map(s => (
                        <div className="git-sub-item" key={s.ref}>
                            <span className="git-sub-item__name" title={s.message}>{s.message}</span>
                            <span className="git-sub-item__meta">{s.date}</span>
                            <span className="git-sub-item__ops">
                                <ActionButton icon={"play_arrow"} title={t('应用')}
                                              onClick={() => apply(s.ref, false)}/>
                                <ActionButton icon={"unarchive"} title={t('恢复并删除')}
                                              onClick={() => apply(s.ref, true)}/>
                                <ActionButton icon={"delete"} title={t('删除')}
                                              onClick={() => drop(s.ref)}/>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
