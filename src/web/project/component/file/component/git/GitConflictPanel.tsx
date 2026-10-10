import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

interface Props {
    dir_path: string;
    on_resolved: () => void;
}

/**
 * 冲突解决面板：列出冲突文件，支持采用我方/对方版本、标记已解决、放弃流程。
 * 仅在存在冲突时由父组件渲染。
 */
export default function GitConflictPanel({dir_path, on_resolved}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [files, setFiles] = useState<string[]>([]);
    const [state, setState] = useState('');

    useEffect(() => {
        load_conflicts();
    }, [dir_path]);

    const load_conflicts = async () => {
        try {
            const rsq = await gitHttp.post('conflicts', {path: dir_path});
            if (rsq.code === 0) {
                setFiles(rsq.data?.files || []);
                setState(rsq.data?.state || '');
            }
        } catch (e) {
        }
    };

    const resolve = async (file: string, side: string) => {
        try {
            const rsq = await gitHttp.post('resolve', {path: dir_path, file, side});
            if (rsq.code === 0) {
                NotySuccess(t('已解决冲突'));
                await load_conflicts();
                on_resolved();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const abort = () => {
        const action = state === 'rebase' ? 'rebase_abort'
            : state === 'cherry-pick' ? 'cherry_pick_abort'
                : state === 'revert' ? 'revert_abort'
                    : 'merge_abort';
        confirm_del({
            title: t('放弃合并'),
            sub_title: t('确认放弃当前合并并恢复到操作前状态'),
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('conflict_action', {path: dir_path, action});
                    if (rsq.code === 0) { NotySuccess(t('已放弃合并')); on_resolved(); }
                    else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    const finish_merge = async () => {
        try {
            const rsq = await gitHttp.post('conflict_action', {path: dir_path, action: 'merge_continue'});
            if (rsq.code === 0) { NotySuccess(t('合并已完成')); on_resolved(); }
            else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    if (files.length === 0) return null;

    return (
        <div className="git-card git-conflict">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title">
                    {t('冲突')} ({files.length})
                    {state && <span className="git-conflict__state">{state}</span>}
                </span>
                <ActionButton icon={"done_all"} title={t('标记全部已解决')} onClick={finish_merge}/>
                <ActionButton icon={"undo"} title={t('放弃合并')} onClick={abort}/>
            </div>
            {files.map(file => (
                <div className="git-sub-item" key={file}>
                    <span className="git-sub-item__name" title={file}>{file}</span>
                    <span className="git-sub-item__ops">
                        <ActionButton icon={"person"} title={t('采用我方版本')}
                                      onClick={() => resolve(file, 'ours')}/>
                        <ActionButton icon={"group"} title={t('采用对方版本')}
                                      onClick={() => resolve(file, 'theirs')}/>
                        <ActionButton icon={"check"} title={t('标记已解决')}
                                      onClick={() => resolve(file, 'resolved')}/>
                    </span>
                </div>
            ))}
        </div>
    );
}
