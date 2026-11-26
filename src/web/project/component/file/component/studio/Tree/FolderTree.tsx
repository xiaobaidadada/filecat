import {FileTree, FileTreeList, FileTypeEnum} from "../../../../../../../common/file.pojo";
import {Folder} from "./Folder";
import React, {useCallback, useMemo, useRef, useState} from "react";
import {SearchInput} from "../../../../../../meta/component/SearchInput";

/** 递归按名称过滤树。只过滤已加载的数据：未展开过的目录 children 为 undefined，无法匹配其内部内容。
 *  保留规则：节点自身名称匹配，或者其子孙中存在匹配项（目录需要保留以便看到匹配的子孙）。 */
function filter_tree(list: FileTree[], keyword: string): FileTree[] {
    const result: FileTree[] = [];
    for (const item of list) {
        if (item.name.toLowerCase().includes(keyword)) {
            // 自身命中：整个节点原样保留（含已加载的子孙）
            result.push(item);
            continue;
        }
        if (item.children && item.children.length > 0) {
            const children = filter_tree(item.children, keyword);
            if (children.length > 0) {
                result.push({...item, children});
            }
        }
    }
    return result;
}


export function FolderTree(props: {
    list: FileTreeList,
    pre_path: string,
    /** 当前打开文件的完整路径，用于高亮选中行 */
    active_path?: string,
    click?: (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => Promise<void>,
    /** 仅「选中」不负责展开 */
    onSelect?: (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => void,
    handleContextMenu?: (event, name,path, isDir,toggleExpansion) => void,
    fatherNowToggleExpansion?:()=>void,
    /** 重建后需要恢复展开的目录路径 */
    expand_paths?: string[],
}) {
    const [keyword, set_keyword] = useState("");
    /** 已加载过的子目录缓存：pre_path（以 / 结尾） → 子项。
     *  子项原本只存在 Folder 自己的 state 里，父组件拿不到，搜索就搜不到已展开的深层文件。 */
    const loaded_ref = useRef<Record<string, FileTree[]>>({});
    const [, force_update] = useState(0);

    const on_children_loaded = useCallback((pre_path: string, list: FileTree[]) => {
        loaded_ref.current[pre_path] = list;
        force_update(v => v + 1);
    }, []);

    /** 把根 list 与已加载的深层子项拼成完整的树，供搜索使用 */
    const full_tree = useMemo(() => {
        const attach = (items: FileTree[], prefix: string): FileTree[] => {
            return items.map((item) => {
                if (item.type !== FileTypeEnum.folder) return item;
                const p = `${prefix}${item.name}/`;
                const loaded = loaded_ref.current[p];
                const children = loaded ?? item.children;
                return children ? {...item, children: attach(children, p)} : item;
            });
        };
        return attach(props.list ?? [], props.pre_path);
    }, [props.list, props.pre_path, keyword]);

    /** 搜索时把命中的目录一并展开，否则匹配项藏在折叠的目录里看不到 */
    const search_expand_paths = useMemo(() => {
        if (!keyword) return props.expand_paths;
        const paths: string[] = [...(props.expand_paths ?? [])];
        const walk = (items: FileTree[], prefix: string) => {
            for (const item of items) {
                const p = `${prefix}${item.name}${item.type === FileTypeEnum.folder ? "/" : ""}`;
                if (item.type === FileTypeEnum.folder) {
                    paths.push(p);
                    if (item.children) walk(item.children, p);
                }
            }
        };
        walk(filter_tree(full_tree, keyword), props.pre_path);
        return paths;
    }, [keyword, full_tree, props.pre_path, props.expand_paths]);

    const show_list = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return props.list;
        return filter_tree(full_tree, kw);
    }, [keyword, full_tree, props.list]);

    return <>
        <div className={"studio-nav-search"}>
            <SearchInput
                placeholder={"搜索文件"}
                value={keyword}
                onChange={set_keyword}
            />
        </div>
        <div className={"studio-nav-tree"}>
            {keyword.trim() && show_list.length === 0
                ? <div className={"studio-nav-empty"}>没有匹配项</div>
                : show_list.map((value, index) => {
                    return <Folder pre_path={`${props.pre_path}${value.name}${value.type===FileTypeEnum.folder ? "/":""}`} key={index} name={value.name} type={value.type}
                                   handleContextMenu={props.handleContextMenu}
                                   fatherNowToggleExpansion={props.fatherNowToggleExpansion}
                                   active_path={props.active_path}
                                   expand_paths={search_expand_paths}
                                   on_children_loaded={on_children_loaded}
                                   children={value.children} click={props.click} onSelect={props.onSelect} size={value.size}/>
                })}
        </div>
    </>
}
