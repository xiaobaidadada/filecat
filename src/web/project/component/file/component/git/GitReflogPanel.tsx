import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

export interface ReflogEntry {
    hash: string;
    selector: string;
    message: string;
    date: string;
}

interface Props {
    dir_path: string;
    on_changed: () => void;
}

/**
 * reflog 面板：HEAD 移动的完整历史，用于误操作（误 reset / 误 rebase）后的恢复。
 * 提供三种回退模式，hard 模式有强提示。
 */
export default function GitReflogPanel({dir_path, on_changed}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [entries, setEntries] = useState<ReflogEntry[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (open) load_reflog();
    }, [dir_path, open]);

    const load_reflog = async () => {
        try {
            const rsq = await gitHttp.post('reflog', {path: dir_path, maxCount: 100});
            if (rsq.code === 0) setEntries(rsq.data || []);
        } catch (e) {
        }
    };

    /** mode: soft 保留改动在暂存区 / mixed 保留在工作区 / hard 丢弃改动 */
    const reset_to = (entry: ReflogEntry) => {
        confirm_del({
            title: t('回退到此处'),
            sub_title: `${entry.selector} · ${entry.message}`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('reset_commit', {
                        path: dir_path, hash: entry.selector, mode: 'mixed'
                    });
                    if (rsq.code === 0) {
                        NotySuccess(t('已回退'));
                        await load_reflog();
                        on_changed();
                    } else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    const reset_hard = (entry: ReflogEntry) => {
        confirm_del({
            title: t('强制回退（丢弃改动）'),
            sub_title: `${t('此操作将永久丢弃未提交的改动')}：${entry.selector} · ${entry.message}`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('reset_commit', {
                        path: dir_path, hash: entry.selector, mode: 'hard'
                    });
                    if (rsq.code === 0) {
                        NotySuccess(t('已强制回退'));
                        await load_reflog();
                        on_changed();
                    } else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    return (
        <div className="git-reflog">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title"
                      onClick={() => setOpen(!open)}
                      style={{cursor: 'pointer'}}>
                    {t('操作历史')} ({entries.length}) {open ? '▾' : '▸'}
                </span>
            </div>
            {open && (
                <div className="git-sub-panel__list">
                    {entries.length === 0 && <div className="git-change-empty">{t('暂无记录')}</div>}
                    {entries.map(e => (
                        <div className="git-sub-item" key={e.selector}>
                            <span className="git-sub-item__name" title={e.message}>{e.selector}</span>
                            <span className="git-sub-item__desc" title={e.message}>{e.message}</span>
                            <span className="git-sub-item__meta">{e.date}</span>
                            <span className="git-sub-item__ops">
                                <ActionButton icon={"undo"} title={t('回退到此处')}
                                              onClick={() => reset_to(e)}/>
                                <ActionButton icon={"delete_forever"} title={t('强制回退（丢弃改动）')}
                                              onClick={() => reset_hard(e)}/>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
