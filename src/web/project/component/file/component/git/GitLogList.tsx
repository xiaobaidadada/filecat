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
    /** 提交所指向的引用名（分支、tag、HEAD 等） */
    refs?: string[];
    /** 父提交短 hash，用于绘制树形血缘 */
    parents?: string[];
    /** 是否尚未推送到上游分支 */
    unpushed?: boolean;
}

interface Props {
    dir_path: string;
    entries: GitLogEntry[];
    /** 当前列表是否来自搜索结果（搜索结果血缘不连续，不绘制树形） */
    is_search?: boolean;
    /** 是否还有更多提交可加载 */
    has_more?: boolean;
    /** 是否正在加载更多 */
    loading_more?: boolean;
    /** 滚动到列表底部时回调（用于加载下一页） */
    on_scroll_bottom?: React.UIEventHandler<HTMLDivElement>;
    /** 当前选中的提交 hash */
    active_hash: string | null;
    on_select: (hash: string) => void;
    /** 搜索结果替换列表时回调 */
    on_search_result: (entries: GitLogEntry[]) => void;
}

/** 单个提交在图形列中的绘制信息 */
interface GraphRow {
    /** 本行圆点所在列 */
    column: number;
    /** 贯穿整行的列（从上边一路画到下边，多为其他分支的过路线） */
    pass_through: number[];
    /** 圆点向下连到行底的列：同列是竖线，跨列是曲线 */
    out_edges: number[];
    /** 从行顶斜连到圆点的汇回边起点列（分支在此并回本行圆点） */
    merge_in: number[];
}

/**
 * 计算提交历史的图形布局（对齐 WebStorm / gitk 的树形连线）。
 *
 * active[i] 表示第 i 列「正在等待」出现的提交 hash，null 为空列。
 * 每行记录：圆点列、从上穿行的列、圆点出发的边，渲染时用 SVG 画竖线与斜线。
 */
function build_graph(entries: GitLogEntry[]): { rows: GraphRow[], width: number } {
    const active: (string | null)[] = [];
    const rows: GraphRow[] = [];
    let width = 1;

    for (const entry of entries) {
        let column = active.indexOf(entry.hash);
        if (column < 0) {
            column = active.indexOf(null);
            if (column < 0) {
                column = active.length;
                active.push(null);
            }
        }

        const parents = entry.parents || [];
        // 先做并入清理：其他列若也在等待本提交的父提交，说明分支在此汇回，置空避免留下幽灵连线
        // 必须在计算 pass_through 之前执行，否则会多画出下一行并不存在的列
        const merged_out: number[] = [];
        for (const p of parents) {
            if (!p) continue;
            active.forEach((hash, i) => {
                if (i !== column && hash === p) {
                    merged_out.push(i);
                    active[i] = null;
                }
            });
        }
        // 被并入的列在本行是一条「从上方下来并汇回圆点」的线，由 merge_in 单独绘制，
        // 不能再加入穿行列，否则会多画一条贯穿到底的竖线
        // 上一行留下的活跃列（除本行圆点列与被并入列）才真正贯穿本行
        const pass_through: number[] = [];
        active.forEach((hash, i) => {
            if (hash !== null && i !== column && !merged_out.includes(i)) pass_through.push(i);
        });

        // 本列改由第一个父提交接手
        active[column] = parents[0] ?? null;
        const parent_columns: number[] = [column];
        // 其余父提交（merge 的第二、第三个父）分配列
        for (const p of parents.slice(1)) {
            let c = active.indexOf(p);
            if (c < 0) {
                c = active.indexOf(null);
                if (c < 0) {
                    c = active.length;
                    active.push(null);
                }
                active[c] = p;
            }
            parent_columns.push(c);
        }
        // 清理尾部空列
        while (active.length && active[active.length - 1] === null) active.pop();

        rows.push({column, pass_through, out_edges: parent_columns, merge_in: merged_out});
        width = Math.max(width, active.length, column + 1, ...parent_columns.map(c => c + 1));
    }
    return {rows, width};
}

/**
 * 提交历史列表。
 * 每行展示树形血缘 + 短 hash + 引用标签 + 提交信息，副行展示作者与时间；
 * 未推送到上游的提交以蓝色圆点与「未推送」标签标出。
 */
export default function GitLogList({dir_path, entries, is_search, has_more, loading_more, active_hash, on_select, on_scroll_bottom, on_search_result}: Props) {
    const {t} = useTranslation();
    const [searching, setSearching] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [author, setAuthor] = useState('');
    const [loading, setLoading] = useState(false);

    const {rows: graph_rows, width: graph_width} = build_graph(is_search ? [] : entries);

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

    /** 图形列：SVG 画竖线（穿行列）与曲线（圆点连向父提交） */
    const render_graph = (row: GraphRow, unpushed: boolean, is_first: boolean) => {
        const col_w = 16;   // 列宽 px
        const row_h = 39;   // 行高 px，需与 .git-log__entry 实际行高一致，行间无缝才能连成整条线
        const dot_y = 12;   // 圆点纵向位置：行内提交信息行的中心
        // 首行上方没有上一行的连线可接，圆点以上的线段不画，避免顶部多出一截
        const top = is_first ? dot_y : -2;
        // 每行上下各多画 1px 与相邻行重叠，消除两段线拼接处抗锯齿造成的视觉细缝
        const bottom = row_h + 2;
        const cx = (i: number) => i * col_w + col_w / 2;
        const dot_x = cx(row.column);
        const nodes: React.ReactNode[] = [];
        // 穿行的竖线：自行顶延伸到行底（无 padding，相邻行的线自然接续）
        for (const i of row.pass_through) {
            nodes.push(<line key={`p${i}`} x1={cx(i)} y1={top} x2={cx(i)} y2={bottom}
                             className="git-log__graph-edge"/>);
        }
        // 汇回边：分支列自本行顶部起，弯向本行圆点所在列（与分叉曲线上下对称，保证与上一行的竖线无缝相接）
        for (const [k, c] of row.merge_in.entries()) {
            const px = cx(c);
            if (is_first) continue;
            nodes.push(<path key={`m${k}`} fill="none"
                             d={`M ${px} -2 C ${px} ${row_h * 0.5} ${dot_x} ${row_h * 0.5} ${dot_x} ${dot_y}`}
                             className="git-log__graph-edge"/>);
        }
        // 圆点连向父提交：同列自行顶贯穿到行底（首行由 top 截掉上方多余线段），跨列画贝塞尔曲线
        for (const [k, c] of row.out_edges.entries()) {
            if (c === row.column) {
                nodes.push(<line key={`o${k}`} x1={dot_x} y1={top} x2={dot_x} y2={bottom}
                                 className="git-log__graph-edge"/>);
            } else {
                const px = cx(c);
                nodes.push(<path key={`o${k}`} fill="none"
                                 d={`M ${dot_x} ${dot_y} C ${dot_x} ${(dot_y + row_h) / 2} ${px} ${(dot_y + row_h) / 2} ${px} ${row_h}`}
                                 className="git-log__graph-edge"/>);
            }
        }
        return (
            <div className="git-log__graph">
                <svg width={graph_width * col_w} height={row_h} overflow="visible">
                    {nodes}
                    <circle cx={dot_x} cy={dot_y} r={3.5}
                            className={`git-log__graph-dot${unpushed ? " git-log__graph-dot--unpushed" : ""}`}/>
                </svg>
            </div>
        );
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
            <div className="git-log" onScroll={on_scroll_bottom}>
                {loading && <div className="git-change-empty">{t('加载中')}</div>}
                {!loading && entries.length === 0 && (
                    <div className="git-change-empty">{t('暂无提交记录')}</div>
                )}
                {!loading && entries.map((entry, i) => (
                    <div
                        key={entry.hash}
                        className={`git-log__entry${active_hash === entry.hash ? " git-log__entry--active" : ""}${entry.unpushed ? " git-log__entry--unpushed" : ""}`}
                        onClick={() => on_select(entry.hash)}
                    >
                        {!is_search && render_graph(graph_rows[i], !!entry.unpushed, i === 0)}
                        <div className="git-log__main">
                            <div className="git-log__row">
                                {entry.unpushed && <span className="git-log__unpushed" title={t('未推送')}/>}
                                <span className="git-log__hash">{entry.hash}</span>
                                {(entry.refs || []).map(ref => (
                                    <span key={ref}
                                          className={`git-log__ref${ref.includes('HEAD') ? ' git-log__ref--head' : ''}`}>
                                        {ref.replace('HEAD -> ', '')}
                                    </span>
                                ))}
                                <span className="git-log__msg" title={entry.message}>{entry.message}</span>
                            </div>
                            <div className="git-log__meta">{entry.author} · {entry.date}</div>
                        </div>
                    </div>
                ))}
                {!loading && !is_search && loading_more && (
                    <div className="git-log__more">{t('加载中')}</div>
                )}
                {!loading && !is_search && !loading_more && !has_more && entries.length > 0 && (
                    <div className="git-log__more">{t('已到底部')}</div>
                )}
            </div>
        </div>
    );
}
