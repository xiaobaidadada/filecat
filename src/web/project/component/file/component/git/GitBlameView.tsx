import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";

export interface BlameLine {
    hash: string;
    author: string;
    date: string;
    text: string;
    line_num: number;
}

interface Props {
    dir_path: string;
    file: string;
    on_close: () => void;
}

/** 按作者给同一区块上色，便于肉眼区分归属 */
function author_color(author: string): string {
    let sum = 0;
    for (let i = 0; i < author.length; i++) sum += author.charCodeAt(i);
    // 色相按作者名散列，饱和度/亮度固定，保证深浅主题下都可读
    return `hsl(${sum % 360}, 55%, 45%)`;
}

/**
 * 逐行归属视图（git blame）。
 * 左侧窄栏显示作者与提交时间，右侧显示代码内容。
 */
export default function GitBlameView({dir_path, file, on_close}: Props) {
    const {t} = useTranslation();
    const [lines, setLines] = useState<BlameLine[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!file) return;
        load_blame();
    }, [file, dir_path]);

    const load_blame = async () => {
        setLoading(true);
        try {
            const rsq = await gitHttp.post('blame', {path: dir_path, file});
            if (rsq.code === 0) setLines(rsq.data || []);
            else { NotyFail(rsq.message); setLines([]); }
        } catch (e: any) {
            NotyFail(e?.message);
            setLines([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="git-card git-card--diff">
            <div className="git-diff-header">
                <span className="git-diff-header__badge">{t('逐行归属')}</span>
                <span className="git-diff-header__path" title={file}>{file}</span>
                <div className="git-diff-header__modes">
                    <ActionButton icon={"close"} title={t('关闭')} onClick={on_close}/>
                </div>
            </div>
            {loading && <div className="git-change-empty">{t('加载中')}</div>}
            {!loading && lines.length === 0 && (
                <div className="git-change-empty">{t('无法读取该文件的归属信息')}</div>
            )}
            {!loading && lines.length > 0 && (
                <div className="git-blame">
                    {lines.map((line, i) => (
                        <div className="git-blame__row" key={i}>
                            <span className="git-blame__hash" title={line.hash}>{line.hash}</span>
                            <span className="git-blame__author" style={{color: author_color(line.author)}}
                                  title={`${line.author} · ${line.date}`}>{line.author}</span>
                            <span className="git-blame__date">{line.date}</span>
                            <span className="git-blame__num">{line.line_num}</span>
                            <span className="git-blame__code">{line.text || " "}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
