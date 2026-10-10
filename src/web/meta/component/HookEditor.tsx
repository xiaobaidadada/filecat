import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {ActionButton} from "./Button";

export interface HookItem {
    name: string;
    /** 是否已启用（对应文件存在且有可执行权限） */
    enabled: boolean;
    /** 是否存在 .sample 模板 */
    has_sample: boolean;
}

interface Props {
    /** 钩子列表 */
    items: HookItem[];
    /** 读取指定钩子内容，返回 {content} */
    on_read: (name: string) => Promise<string>;
    /** 保存并启用钩子 */
    on_save: (name: string, content: string) => Promise<void>;
    /** 停用（删除）钩子 */
    on_delete: (name: string) => Promise<void>;
}

/**
 * 通用勾子编辑器：列表 + 行内展开编辑。
 * 点击某行「编辑」时，编辑框直接展开在该行下方，而不是统一堆在列表底部。
 */
export default function HookEditor({items, on_read, on_save, on_delete}: Props) {
    const {t} = useTranslation();
    // 当前展开编辑的行名，null 表示无
    const [editing, setEditing] = useState<string | null>(null);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    // 列表刷新后若正在编辑的钩子已消失，收起编辑框
    useEffect(() => {
        if (editing && !items.some(i => i.name === editing)) setEditing(null);
    }, [items, editing]);

    const open_editor = async (name: string) => {
        if (editing === name) { setEditing(null); return; }
        setLoading(true);
        try {
            setContent(await on_read(name));
            setEditing(name);
        } finally {
            setLoading(false);
        }
    };

    const save = async () => {
        if (!editing) return;
        setLoading(true);
        try {
            await on_save(editing, content);
        } finally {
            setLoading(false);
        }
    };

    const remove = async (name: string) => {
        setLoading(true);
        try {
            await on_delete(name);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="hook-editor">
            <div className="hook-editor__list">
                {items.map(item => (
                    <React.Fragment key={item.name}>
                        <div className={`hook-item${editing === item.name ? " hook-item--editing" : ""}`}>
                            <span className={`hook-item__dot${item.enabled ? " hook-item__dot--on" : ""}`}/>
                            <span className="hook-item__name">{item.name}</span>
                            <span className="hook-item__ops">
                                <ActionButton icon={editing === item.name ? "expand_less" : "edit"}
                                              title={t('编辑')}
                                              onClick={() => open_editor(item.name)}/>
                                {item.enabled && (
                                    <ActionButton icon={"block"} title={t('停用钩子')}
                                                  onClick={() => remove(item.name)}/>
                                )}
                            </span>
                        </div>
                        {/* 编辑框展开在当前行下方 */}
                        {editing === item.name && (
                            <div className="hook-item__editor">
                                <div className="hook-item__editor-bar">
                                    <span className="hook-item__editor-name">{item.name}</span>
                                    <ActionButton icon={"check"} title={t('保存并启用')} onClick={save}/>
                                    <ActionButton icon={"close"} title={t('取消')} onClick={() => setEditing(null)}/>
                                </div>
                                <textarea className="hook-item__text" value={content}
                                          spellCheck={false}
                                          disabled={loading}
                                          onChange={e => setContent(e.target.value)}/>
                            </div>
                        )}
                    </React.Fragment>
                ))}
                {items.length === 0 && (
                    <div className="git-change-empty">{t('暂无记录')}</div>
                )}
            </div>
        </div>
    );
}
