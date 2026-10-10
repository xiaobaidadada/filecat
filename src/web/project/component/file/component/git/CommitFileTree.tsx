import React, {useState} from 'react';
import {Icon} from "../../../../../meta/component/Button";
import {getFileFormat} from "../../../../../../common/FileMenuType";
import {FileTypeEnum} from "../../../../../../common/file.pojo";
import {PathTreeNode} from "./GitChangeList";

interface Props<T> {
    nodes: PathTreeNode<T>[];
    /** 当前选中的文件路径 */
    selected: string | null;
    on_select: (path: string) => void;
}

/** 树节点上能取到增删统计的数据形状 */
interface WithStat {
    additions: number | null;
    deletions: number | null;
}

/**
 * 文件改动的树形列表：目录可折叠，叶子为文件行（带文件类型图标与 +/- 统计）。
 * 供提交详情、分支比较等需要「按目录结构展示改动文件」的场景复用。
 */
export default function CommitFileTree<T extends WithStat>({nodes, selected, on_select}: Props<T>) {
    // 记录被折叠的目录（默认全部展开）
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (full_path: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(full_path)) next.delete(full_path);
            else next.add(full_path);
            return next;
        });
    };

    const render_nodes = (list: PathTreeNode<T>[]): React.ReactNode => list.map(node => {
        if (node.type === "folder") {
            const is_open = !collapsed.has(node.full_path);
            return (
                <div key={node.full_path}>
                    <div className="git-commit-tree__dir" onClick={() => toggle(node.full_path)}>
                        <i className="material-icons git-tree__arrow">
                            {is_open ? 'arrow_drop_down' : 'arrow_right'}
                        </i>
                        <span className="file-icons">
                            <span data-type={FileTypeEnum.folder} data-dir={true} aria-label={node.name}>
                                <Icon icon={''} aria_label={node.name}/>
                            </span>
                        </span>
                        <span className="git-commit-tree__dir-name">{node.name}</span>
                    </div>
                    {is_open && <div className="git-commit-tree__children">{render_nodes(node.children)}</div>}
                </div>
            );
        }
        const stat = node.data;
        return (
            <div
                key={node.full_path}
                className={`git-commit-file git-commit-file--leaf${selected === node.full_path ? " git-commit-file--active" : ""}`}
                onClick={() => on_select(node.full_path)}
                title={node.full_path}
            >
                <span className="file-icons">
                    <span data-type={getFileFormat(node.name)} aria-label={node.name}>
                        <Icon icon={''} aria_label={node.name}/>
                    </span>
                </span>
                <span className="git-commit-file__name">{node.name}</span>
                {stat && stat.additions !== null && (
                    <span className="git-commit-file__stat">
                        <span className="git-stat--add">+{stat.additions}</span>
                        <span className="git-stat--del">-{stat.deletions}</span>
                    </span>
                )}
            </div>
        );
    });

    return <>{render_nodes(nodes)}</>;
}
