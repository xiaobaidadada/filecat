import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

export interface GitTag {
    name: string;
    hash: string;
    message: string;
    date: string;
}

interface Props {
    dir_path: string;
    /** 创建标签时可选指定提交 */
    target_hash?: string;
    on_changed: () => void;
}

/**
 * 标签管理：列表 + 创建 + 删除 + 推送。
 */
export default function GitTagPanel({dir_path, target_hash, on_changed}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [tags, setTags] = useState<GitTag[]>([]);
    const [creating, setCreating] = useState(false);
    const [new_name, setNewName] = useState('');
    const [new_msg, setNewMsg] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        load_tags();
    }, [dir_path]);

    const load_tags = async () => {
        try {
            const rsq = await gitHttp.post('tags', {path: dir_path});
            if (rsq.code === 0) setTags(rsq.data || []);
        } catch (e) {
        }
    };

    const create_tag = async () => {
        const name = new_name.trim();
        if (!name) { NotyFail(t('请输入标签名')); return; }
        setLoading(true);
        try {
            const rsq = await gitHttp.post('tag_create', {
                path: dir_path, name, message: new_msg.trim(), hash: target_hash
            });
            if (rsq.code === 0) {
                NotySuccess(t('标签创建成功'));
                setNewName('');
                setNewMsg('');
                setCreating(false);
                await load_tags();
                on_changed();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        } finally {
            setLoading(false);
        }
    };

    const delete_tag = (name: string) => {
        confirm_del({
            title: t('删除标签'),
            sub_title: `${t('确认删除标签')} ${name} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('tag_delete', {path: dir_path, name});
                    if (rsq.code === 0) { NotySuccess(t('标签删除成功')); await load_tags(); }
                    else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    const push_tag = async (name: string) => {
        try {
            const rsq = await gitHttp.post('tag_push', {path: dir_path, name});
            if (rsq.code === 0) NotySuccess(t('标签推送成功'));
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    return (
        <div className="git-sub-panel">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title">{t('标签')} ({tags.length})</span>
                <ActionButton icon={"add"} title={t('新建标签')} onClick={() => setCreating(!creating)}/>
            </div>

            {creating && (
                <div className="git-sub-panel__form">
                    <input className="input input--block" autoFocus value={new_name}
                           placeholder={t('标签名')}
                           onChange={e => setNewName(e.target.value)}/>
                    <input className="input input--block" value={new_msg}
                           placeholder={t('备注')}
                           onChange={e => setNewMsg(e.target.value)}/>
                    <div className="git-sub-panel__form-actions">
                        <span className="git-sub-panel__hint">
                            {target_hash ? `${t('基于提交')} ${target_hash}` : t('基于当前提交')}
                        </span>
                        <ActionButton icon={"check"} title={t('保存')} onClick={create_tag}/>
                        <ActionButton icon={"close"} title={t('取消')}
                                      onClick={() => { setCreating(false); setNewName(''); setNewMsg(''); }}/>
                    </div>
                </div>
            )}

            <div className="git-sub-panel__list">
                {tags.length === 0 && <div className="git-change-empty">{t('暂无标签')}</div>}
                {tags.map(tag => (
                    <div className="git-sub-item" key={tag.name}>
                        <span className="git-sub-item__name" title={tag.name}>{tag.name}</span>
                        <span className="git-sub-item__desc" title={tag.message}>{tag.message}</span>
                        <span className="git-sub-item__meta">{tag.date}</span>
                        <span className="git-sub-item__ops">
                            <ActionButton icon={"upload"} title={t('推送到远程')}
                                          onClick={() => push_tag(tag.name)}/>
                            <ActionButton icon={"delete"} title={t('删除标签')}
                                          onClick={() => delete_tag(tag.name)}/>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
