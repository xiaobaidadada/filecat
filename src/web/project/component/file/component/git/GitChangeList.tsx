import React, {useMemo, useState} from 'react';
import {useTranslation} from "react-i18next";
import {ActionButton} from "../../../../../meta/component/Button";
import {Icon} from "../../../../../meta/component/Button";
import {getFileFormat} from "../../../../../../common/FileMenuType";
import {FileTree, FileTypeEnum} from "../../../../../../common/file.pojo";

/** 单个文件的 git 状态（与后端 GitStatusFile 对应） */
export interface GitStatusFile {
    path: string;
    /** 暂存区状态 X：M/A/D/R/C/?/U/空格 */
    index: string;
    /** 工作区状态 Y */
    worktree: string;
    /** 是否有已暂存的改动 */
    staged: boolean;
    untracked: boolean;
    conflicted: boolean;
    oldPath?: string;
}

/** 状态字符 → 展示字母与颜色 class 后缀 */
const STATUS_META: Record<string, { label: string, cls: string }> = {
    M: {label: "M", cls: "mod"},
    A: {label: "A", cls: "add"},
    D: {label: "D", cls: "del"},
    R: {label: "R", cls: "ren"},
    C: {label: "C", cls: "ren"},
    U: {label: "U", cls: "conf"},
    "?": {label: "?", cls: "untracked"},
};

interface Props {
    /** 全部变更文件 */
    files: GitStatusFile[];
    /** 未暂存区选中的文件 path */
    selected: Set<string>;
    /** 切换单个文件选中态 */
    on_toggle: (path: string) => void;
    /** 批量切换选中态（全选/全不选） */
    on_toggle_all: (paths: string[], checked: boolean) => void;
    /** 当前正在查看 diff 的文件 path（高亮用） */
    active_path: string | null;
    /** 点击文件查看 diff，带此文件所属区域标识 */
    on_view_diff: (file: GitStatusFile, staged: boolean) => void;
    /** 批量暂存（未暂存区）/ 取消暂存（已暂存区） */
    on_stage_section: (files: GitStatusFile[], staged: boolean) => void;
    /** 暂存（或取消暂存）单个文件 */
    on_stage_one: (file: GitStatusFile, staged: boolean) => void;
    /** 查看文件的逐行归属 */
    on_view_blame: (file: GitStatusFile) => void;
}

/** 取文件用于显示的短名（去掉目录前缀） */
export function base_name(p: string): string {
    const idx = p.lastIndexOf("/");
    return idx === -1 ? p : p.substring(idx + 1);
}

/**
 * 把路径列表构造成目录树，供变更列表与提交详情等场景复用树形展示。
 * entries 的 key 为文件相对路径，value 为需要挂在叶子节点上的原始数据。
 */
export function build_path_tree<T>(entries: { path: string, data: T }[]): PathTreeNode<T>[] {
    const root: PathTreeNode<T> = {type: "folder", name: "", full_path: "", children: []};
    for (const e of entries) {
        const parts = e.path.split("/").filter(Boolean);
        let node = root;
        for (let i = 0; i < parts.length; i++) {
            const name = parts[i];
            const is_file = i === parts.length - 1;
            let child = node.children.find(c => c.name === name);
            if (!child) {
                child = {
                    type: is_file ? "file" : "folder",
                    name,
                    full_path: node.full_path ? `${node.full_path}/${name}` : name,
                    children: [],
                };
                node.children.push(child);
            }
            if (is_file) child.data = e.data;
            node = child;
        }
    }
    // 目录在前、文件在后，同级按名称排序
    const sort = (nodes: PathTreeNode<T>[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const n of nodes) if (n.children.length) sort(n.children);
    };
    sort(root.children);
    return root.children;
}

/** 目录树节点（泛型挂在叶子的 data 上） */
export interface PathTreeNode<T> {
    type: "file" | "folder";
    name: string;
    /** 相对仓库根的全路径，目录也带 */
    full_path: string;
    children: PathTreeNode<T>[];
    /** 仅文件节点有 */
    data?: T;
}

/** 将文件路径列表构造成目录树，用于树形展示 */
function build_tree(files: GitStatusFile[]): FileTree[] {
    const nodes = build_path_tree(files.map(f => ({path: f.path, data: f})));
    const to_file_tree = (n: PathTreeNode<GitStatusFile>): FileTree => ({
        type: n.type,
        name: n.name,
        size: 0,
        children: n.children.length ? n.children.map(to_file_tree) : undefined,
    });
    return nodes.map(to_file_tree);
}

/** 单一文件行（平铺与树形共用） */
function FileRow(props: {
    file: GitStatusFile;
    staged: boolean;
    status: string;
    selected: Set<string>;
    active: boolean;
    leaf: boolean;
    on_toggle: (path: string) => void;
    on_view_diff: (file: GitStatusFile, staged: boolean) => void;
    on_stage_one: (file: GitStatusFile, staged: boolean) => void;
    on_view_blame: (file: GitStatusFile) => void;
    key?: React.Key;
}) {
    const {t} = useTranslation();
    const {file, staged, status, selected, active, leaf} = props;
    const meta = STATUS_META[status] ?? {label: status, cls: "mod"};
    const dir = leaf ? file.path.substring(0, file.path.lastIndexOf("/")) : "";

    return (
        <div className={`git-file${active ? " git-file--active" : ""}`}>
            <input
                type="checkbox"
                checked={selected.has(file.path)}
                onChange={() => props.on_toggle(file.path)}
                onClick={(e) => e.stopPropagation()}
            />
            <span className="file-icons">
                <span data-type={getFileFormat(file.path)} data-dir={false} aria-label={file.path}>
                    <Icon icon={''} aria_label={file.path}/>
                </span>
            </span>
            <span
                className="git-file__name"
                title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                onClick={() => props.on_view_diff(file, staged)}
            >
                {leaf ? base_name(file.path) : file.path}
            </span>
            <span className={`git-file__badge git-file__badge--${meta.cls}`}>{meta.label}</span>
            {dir && <span className="git-file__dir" title={dir}>{dir}</span>}
            <span className="git-file__ops">
                <ActionButton icon={"format_list_numbered"} title={t('逐行归属')}
                              onClick={() => props.on_view_blame(file)}/>
                <ActionButton icon={staged ? "remove" : "add"}
                              title={staged ? t('取消暂存') : t('暂存')}
                              onClick={() => props.on_stage_one(file, staged)}/>
            </span>
        </div>
    );
}

/** 树形节点：目录可折叠，文件渲染为 FileRow */
function TreeFolder(props: {
    node: FileTree;
    staged: boolean;
    file_map: Map<string, GitStatusFile>;
    prefix: string;
    selected: Set<string>;
    active_path: string | null;
    on_toggle: (path: string) => void;
    on_view_diff: (file: GitStatusFile, staged: boolean) => void;
    on_stage_one: (file: GitStatusFile, staged: boolean) => void;
    on_view_blame: (file: GitStatusFile) => void;
    key?: React.Key;
}) {
    const {node, staged, file_map, prefix} = props;
    const [expanded, setExpanded] = useState(true);
    const full_path = prefix ? `${prefix}/${node.name}` : node.name;

    if (node.type === "file") {
        const f = file_map.get(full_path);
        if (!f) return null;
        const status = staged ? (f.conflicted ? "U" : f.index) : (f.untracked ? "?" : (f.conflicted ? "U" : f.worktree));
        return (
            <FileRow file={f} staged={staged} status={status} selected={props.selected}
                     active={props.active_path === f.path} leaf={true}
                     on_toggle={props.on_toggle} on_view_diff={props.on_view_diff}
                     on_stage_one={props.on_stage_one} on_view_blame={props.on_view_blame}/>
        );
    }

    return (
        <div className="git-tree__folder">
            <div className="git-tree__dir" onClick={() => setExpanded(!expanded)}>
                <i className="material-icons git-tree__arrow" data-icon={expanded ? 'arrow_drop_down' : 'arrow_right'}>
                    {expanded ? 'arrow_drop_down' : 'arrow_right'}
                </i>
                <span className="file-icons">
                    <span data-type={FileTypeEnum.folder} data-dir={true} aria-label={node.name}>
                        <Icon icon={''} aria_label={node.name}/>
                    </span>
                </span>
                <span className="git-tree__dir-name">{node.name}</span>
            </div>
            {expanded && (
                <div className="git-tree__children">
                    {node.children?.map((c, i) => (
                        <TreeFolder key={i} node={c} staged={staged} file_map={file_map} prefix={full_path}
                                    selected={props.selected} active_path={props.active_path}
                                    on_toggle={props.on_toggle} on_view_diff={props.on_view_diff}
                                    on_stage_one={props.on_stage_one} on_view_blame={props.on_view_blame}/>
                    ))}
                </div>
            )}
        </div>
    );
}

/** 变更分组：已暂存区 / 未暂存区 */
function ChangeSection(props: {
    title: string;
    files: GitStatusFile[];
    /** true 表示这是已暂存区 */
    staged: boolean;
    /** 该分组内每行显示的状态字符 */
    status_of: (f: GitStatusFile) => string;
    selected: Set<string>;
    on_toggle: (path: string) => void;
    on_toggle_all: (paths: string[], checked: boolean) => void;
    active_path: string | null;
    tree_mode: boolean;
    on_view_diff: (file: GitStatusFile, staged: boolean) => void;
    on_stage_section: (files: GitStatusFile[], staged: boolean) => void;
    on_stage_one: (file: GitStatusFile, staged: boolean) => void;
    on_view_blame: (file: GitStatusFile) => void;
}) {
    const {t} = useTranslation();
    const {title, files, staged, selected} = props;

    const all_paths = useMemo(() => files.map(f => f.path), [files]);
    const checked_count = all_paths.filter(p => selected.has(p)).length;
    const all_checked = files.length > 0 && checked_count === files.length;
    const some_checked = checked_count > 0 && !all_checked;

    // 树形模式的文件映射（key 为相对仓库根的路径）
    const file_map = useMemo(() => {
        const m = new Map<string, GitStatusFile>();
        for (const f of files) m.set(f.path, f);
        return m;
    }, [files]);
    const tree = useMemo(() => (props.tree_mode ? build_tree(files) : []), [files, props.tree_mode]);

    if (files.length === 0) return null;

    return (
        <div className="git-section">
            <div className="git-section__header">
                <input
                    type="checkbox"
                    checked={all_checked}
                    ref={el => { if (el) el.indeterminate = some_checked; }}
                    onChange={() => props.on_toggle_all(all_paths, !all_checked)}
                />
                <span className="git-section__title">{title} ({files.length})</span>
                <span
                    className="git-section__action"
                    onClick={() => props.on_stage_section(files, staged)}
                >{staged ? t('全部取消暂存') : t('全部暂存')}</span>
            </div>
            {props.tree_mode ? (
                <div className="git-tree">
                    {tree.map((node, i) => (
                        <TreeFolder key={i} node={node} staged={staged} file_map={file_map} prefix=""
                                    selected={props.selected} active_path={props.active_path}
                                    on_toggle={props.on_toggle} on_view_diff={props.on_view_diff}
                                    on_stage_one={props.on_stage_one} on_view_blame={props.on_view_blame}/>
                    ))}
                </div>
            ) : (
                files.map(f => (
                    <FileRow key={f.path + (staged ? "_s" : "_w")}
                             file={f} staged={staged} status={props.status_of(f)}
                             selected={props.selected} active={props.active_path === f.path} leaf={true}
                             on_toggle={props.on_toggle} on_view_diff={props.on_view_diff}
                             on_stage_one={props.on_stage_one} on_view_blame={props.on_view_blame}/>
                ))
            )}
        </div>
    );
}

/**
 * Git 变更列表：按「已暂存的改动 / 未暂存的改动」两个区域分组展示。
 * 支持平铺/树形两种视图，分组头可全选。
 */
export default function GitChangeList(props: Props) {
    const {t} = useTranslation();
    const {files} = props;
    const [tree_mode, setTreeMode] = useState(false);

    // 已暂存：暂存区有状态位（X 非空格、非未跟踪）
    const staged_files = files.filter(f => f.staged);
    // 未暂存：工作区有改动（Y 非空格），含未跟踪文件
    const unstaged_files = files.filter(f => f.untracked || f.worktree !== " ");

    const common = {
        selected: props.selected,
        on_toggle: props.on_toggle,
        on_toggle_all: props.on_toggle_all,
        active_path: props.active_path,
        tree_mode,
        on_view_diff: props.on_view_diff,
        on_stage_section: props.on_stage_section,
        on_stage_one: props.on_stage_one,
        on_view_blame: props.on_view_blame,
    };

    return (
        <div className="git-change-list">
            <div className="git-change-toolbar">
                <ActionButton icon={"account_tree"} title={t('树形展示')}
                              selected={tree_mode}
                              onClick={() => setTreeMode(!tree_mode)}/>
            </div>
            <ChangeSection title={t('已暂存的更改')} files={staged_files} staged={true}
                           status_of={f => f.conflicted ? "U" : f.index} {...common}/>
            <ChangeSection title={t('更改')} files={unstaged_files} staged={false}
                           status_of={f => f.untracked ? "?" : (f.conflicted ? "U" : f.worktree)} {...common}/>
            {files.length === 0 && (
                <div className="git-change-empty">{t('没有已更改的文件')}</div>
            )}
        </div>
    );
}
