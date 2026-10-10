import React, {useState} from 'react';
import {useTranslation} from "react-i18next";
import {ActionButton} from "../../../../../meta/component/Button";
import {using_confirm} from "../../../prompts/prompt.util";

interface Props {
    current: string;
    branches: string[];
    on_checkout: (branch: string) => void;
    on_create: (name: string) => void;
    on_delete: (name: string, force: boolean) => void;
    on_merge: (branch: string) => void;
    /** 相对上游的领先提交数 */
    ahead?: number;
    /** 相对上游的落后提交数 */
    behind?: number;
}

/**
 * 分支操作栏：列出本地分支，支持切换 / 新建 / 删除 / 合并。
 * 列表用 chip 展示，非当前分支 hover 时出现合并与删除操作。
 */
export default function GitBranchBar({current, branches, on_checkout, on_create, on_delete, on_merge, ahead, behind}: Props) {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const [show_input, setShow_input] = useState(false);
    const [new_name, setNewName] = useState('');

    const handle_create = () => {
        const name = new_name.trim();
        if (!name) return;
        on_create(name);
        setNewName('');
        setShow_input(false);
    };

    const handle_delete = (branch: string) => {
        confirm_del({
            title: t('删除分支'),
            sub_title: `${t('确认删除分支')} ${branch} ?`,
            confirm_fun: () => on_delete(branch, false),
        });
    };

    return (
        <div className="git-branch-row">
            <span className="git-branch__name">{t('分支')}: {current}</span>
            {(ahead > 0 || behind > 0) && (
                <span className="git-branch__counts">
                    {ahead > 0 && <span className="git-ahead" title={t('领先上游')}>↑{ahead}</span>}
                    {behind > 0 && <span className="git-behind" title={t('落后上游')}>↓{behind}</span>}
                </span>
            )}
            <div className="git-branch__list">
                {branches.map(b => {
                    const is_current = b === current;
                    return (
                        <div key={b}
                             className={`git-branch-chip${is_current ? " git-branch-chip--current" : ""}`}
                             onClick={() => !is_current && on_checkout(b)}
                             title={is_current ? t('当前分支') : `${t('切换到')} ${b}`}>
                            {b}
                            {!is_current && (
                                <span className="git-branch-chip__ops">
                                    <span className="git-branch-chip__op" title={t('合并到此分支')}
                                          onClick={(e) => { e.stopPropagation(); on_merge(b); }}>⇥</span>
                                    <span className="git-branch-chip__op" title={t('删除分支')}
                                          onClick={(e) => { e.stopPropagation(); handle_delete(b); }}>×</span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            {show_input ? (
                <span className="git-branch-new">
                    <input className="input input--block" autoFocus value={new_name}
                           placeholder={t('新分支名')}
                           onChange={e => setNewName(e.target.value)}
                           onKeyDown={e => {
                               if (e.key === 'Enter') handle_create();
                               if (e.key === 'Escape') { setShow_input(false); setNewName(''); }
                           }}/>
                    <ActionButton icon={"check"} title={t('确定')} onClick={handle_create}/>
                    <ActionButton icon={"close"} title={t('取消')}
                                  onClick={() => { setShow_input(false); setNewName(''); }}/>
                </span>
            ) : (
                <ActionButton icon={"add"} title={t('新建分支')} onClick={() => setShow_input(true)}/>
            )}
        </div>
    );
}
