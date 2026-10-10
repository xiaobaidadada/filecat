import React, {useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";

export interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    date: string;
}

interface Props {
    dir_path: string;
    entries: GitLogEntry[];
    /** 当前选中的提交 hash */
    active_hash: string | null;
    on_select: (hash: string) => void;
    /** 搜索结果替换列表时回调 */
    on_search_result: (entries: GitLogEntry[]) => void;
}

/**
 * 提交历史列表。
 * 每行展示短 hash + 提交信息，副行展示作者与时间；顶部可按关键词/作者搜索。
 */
export default function GitLogList({dir_path, entries, active_hash, on_select, on_search_result}: Props) {
    const {t} = useTranslation();
    const [searching, setSearching] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [author, setAuthor] = useState('');
    const [loading, setLoading] = useState(false);

    const do_search = async () => {
        if (!keyword.trim() && !author.trim()) {
            NotyFail(t('请输入搜索条件'));
            return;
        }
        setLoading(true);
        try {
            const rsq = await gitHttp.post('search_commit', {
                path: dir_path, keyword: keyword.trim(), author: author.trim(), maxCount: 100
            });
            if (rsq.code === 0) on_search_result(rsq.data || []);
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const reset_search = () => {
        setKeyword('');
        setAuthor('');
        on_search_result(null as any);
        setSearching(false);
    };

    return (
        <div className="git-log-wrap">
            <div className="git-log-search">
                <ActionButton icon={"search"} title={t('搜索提交')} onClick={() => {
                    if (searching) reset_search();
                    else setSearching(true);
                }}/>
                {searching && (
                    <>
                        <input className="input input--block" autoFocus value={keyword}
                               placeholder={t('提交信息关键词')}
                               onChange={e => setKeyword(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && do_search()}/>
                        <input className="input input--block" value={author}
                               placeholder={t('作者')}
                               onChange={e => setAuthor(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && do_search()}/>
                        <ActionButton icon={"check"} title={t('搜索')} onClick={do_search}/>
                    </>
                )}
            </div>
            <div className="git-log">
                {loading && <div className="git-change-empty">{t('加载中')}</div>}
                {!loading && entries.length === 0 && (
                    <div className="git-change-empty">{t('暂无提交记录')}</div>
                )}
                {!loading && entries.map(entry => (
                    <div
                        key={entry.hash}
                        className={`git-log__entry${active_hash === entry.hash ? " git-log__entry--active" : ""}`}
                        onClick={() => on_select(entry.hash)}
                    >
                        <div className="git-log__row">
                            <span className="git-log__hash">{entry.hash}</span>
                            <span className="git-log__msg" title={entry.message}>{entry.message}</span>
                        </div>
                        <div className="git-log__meta">{entry.author} · {entry.date}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
