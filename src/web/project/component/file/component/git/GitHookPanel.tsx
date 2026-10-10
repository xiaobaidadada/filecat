import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import HookEditor, {HookItem} from "../../../../../meta/component/HookEditor";
import {using_confirm} from "../../../prompts/prompt.util";

interface Props {
    dir_path: string;
}

/**
 * Git Hook 面板：数据加载 + 交互封装，渲染交给通用 HookEditor。
 * 保存时后端自动赋 0755 权限（git 只执行可执行文件）。
 */
export default function GitHookPanel({dir_path}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [hooks, setHooks] = useState<HookItem[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (open) load_hooks();
    }, [dir_path, open]);

    const load_hooks = async () => {
        try {
            const rsq = await gitHttp.post('hooks', {path: dir_path});
            if (rsq.code === 0) setHooks(rsq.data || []);
        } catch (e) {
        }
    };

    const read_hook = async (name: string): Promise<string> => {
        try {
            const rsq = await gitHttp.post('hook_read', {path: dir_path, name});
            if (rsq.code === 0) return rsq.data?.content || '';
            NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
        return '';
    };

    const save_hook = async (name: string, content: string): Promise<void> => {
        try {
            const rsq = await gitHttp.post('hook_save', {path: dir_path, name, content});
            if (rsq.code === 0) {
                NotySuccess(t('已保存并启用'));
                await load_hooks();
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const delete_hook = async (name: string): Promise<void> => {
        confirm_del({
            title: t('停用钩子'),
            sub_title: `${t('确认删除并停用')} ${name} ?`,
            confirm_fun: async () => {
                try {
                    const rsq = await gitHttp.post('hook_delete', {path: dir_path, name});
                    if (rsq.code === 0) {
                        NotySuccess(t('已停用'));
                        await load_hooks();
                    } else NotyFail(rsq.message);
                } catch (e: any) {
                    NotyFail(e?.message);
                }
            },
        });
    };

    return (
        <div className="git-hook">
            <div className="git-sub-panel__header">
                <span className="git-sub-panel__title"
                      onClick={() => setOpen(!open)}>
                    {t('钩子')} {open ? '▾' : '▸'}
                </span>
            </div>
            {open && (
                <HookEditor items={hooks}
                            on_read={read_hook}
                            on_save={save_hook}
                            on_delete={delete_hook}/>
            )}
        </div>
    );
}
