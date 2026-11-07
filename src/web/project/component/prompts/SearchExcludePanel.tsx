import React, {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {FileItemData, FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {fileHttp, userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {RCode} from "../../../../common/Result.pojo";
import {InputText, InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";

/**
 * 搜索排除规则选择面板。
 *
 * 列出当前搜索范围下的顶层文件/目录供勾选，勾选结果直接作为本次搜索的 exclude_paths；
 * 另外可以持久化一批「忽略名字」（如 node_modules、*.log），对任意层级同名项生效。
 * 名字规则保存到当前用户的 user_data，跨会话保留。
 */
export function SearchExcludePanel(props: {
    base_path: string,
    // 已选中的具体路径（web 路径）
    exclude_paths: string[],
    // 持久化的忽略名字
    ignore_names: string[],
    on_change_paths: (paths: string[]) => void,
    on_change_names: (names: string[]) => void,
    // 打开忽略名字设置页（由父组件接管整个弹窗）
    on_open_setting: () => void,
}) {
    const {t} = useTranslation();
    const [items, setItems] = useState<FileItemData[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [filter, set_filter] = useState("");
    const [new_name, set_new_name] = useState("");

    // 首次展开时才拉列表，避免弹窗一打开就发请求
    const load = async () => {
        if (loaded) return;
        setLoaded(true);
        const rsp = await fileHttp.post("file_get_page", {
            param_path: props.base_path,
            page_num: 1,
            page_size: 10000,
        });
        if (rsp?.code !== RCode.Success) return;
        const data: GetFilePojo = rsp.data;
        // 后端把文件和目录都放在 files 里，用 type 区分；目录排在前面方便定位
        const all = data.files ?? [];
        const dirs = all.filter(it => it.type === FileTypeEnum.folder).sort((a, b) => a.name.localeCompare(b.name));
        const files = all.filter(it => it.type !== FileTypeEnum.folder).sort((a, b) => a.name.localeCompare(b.name));
        setItems([...dirs, ...files]);
    };

    // 目录项的 path 是父目录，需要自己拼成该项的完整 web 路径才能作为排除目标
    const item_path = (it: FileItemData) => {
        const base = props.base_path.endsWith("/") ? props.base_path : props.base_path + "/";
        const p = it.type === FileTypeEnum.folder
            ? base + it.name
            : (it.path ?? base + it.name);
        return p.startsWith("/") ? p : "/" + p;
    };

    // 面板一展开就拉列表，用户不用先 hover 才看到内容
    useEffect(() => {
        load();
    }, []);

    const show_items = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return items;
        return items.filter(it => it.name.toLowerCase().includes(f));
    }, [items, filter]);

    const toggle = (it: FileItemData) => {
        const p = item_path(it);
        const has = props.exclude_paths.includes(p);
        props.on_change_paths(has
            ? props.exclude_paths.filter(x => x !== p)
            : [...props.exclude_paths, p]);
    };

    const add_name = () => {
        const v = new_name.trim();
        if (!v || props.ignore_names.includes(v)) return;
        props.on_change_names([...props.ignore_names, v]);
        set_new_name("");
    };

    const remove_name = (n: string) => {
        props.on_change_names(props.ignore_names.filter(x => x !== n));
    };

    const save_names = async () => {
        await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_search_exclude: true,
            search_exclude_names: props.ignore_names,
        });
    };

    return <div className="search-exclude">
        <div className="search-exclude__section">
            <div className="search-exclude__title">{t("排除当前目录下的项")}</div>
            <InputTextIcon icon={"search"} value={filter}
                           placeholder={t("过滤列表")}
                           handleInputChange={v => set_filter(v)}
                           handleEnterPress={() => {
                           }}/>
            <div className="search-exclude__list">
                {show_items.length === 0 && <div className="search-exclude__empty">
                    {loaded ? t("无匹配") : t("加载中")}
                </div>}
                {show_items.map(it => {
                    const p = item_path(it);
                    const checked = props.exclude_paths.includes(p);
                    const is_dir = it.type === FileTypeEnum.folder;
                    return <label className="search-exclude__item" key={p}>
                        <input type="checkbox" checked={checked}
                               onChange={() => toggle(it)}/>
                        <span className={"material-symbols-outlined" + (is_dir ? " search-exclude__icon--dir" : "")}>
                            {is_dir ? "folder" : "draft"}
                        </span>
                        <span className="search-exclude__item-name" title={it.name}>{it.name}</span>
                    </label>;
                })}
            </div>
            {props.exclude_paths.length > 0 && <div className="search-exclude__chosen">
                {props.exclude_paths.map(p => <span className="search-exclude__tag" key={p}>
                    {p.split("/").filter(Boolean).pop()}
                    <span className="material-symbols-outlined"
                          onClick={() => props.on_change_paths(props.exclude_paths.filter(x => x !== p))}>close</span>
                </span>)}
            </div>}
        </div>

        <div className="search-exclude__section search-exclude__section--ignore">
            <div className="search-exclude__title">{t("忽略名字")}</div>
            <div className="search-exclude__hint">{t("按名字忽略")}</div>
            <div className="search-exclude__chosen">
                {props.ignore_names.length === 0 && <span className="search-exclude__hint">{t("暂无")}</span>}
                {props.ignore_names.map(n => <span className="search-exclude__tag" key={n}>
                    {n}
                    <span className="material-symbols-outlined" onClick={() => remove_name(n)}>close</span>
                </span>)}
            </div>
            <div className="search-exclude__add">
                <InputText value={new_name}
                           placeholder={t("如 node_modules")}
                           handleInputChange={v => set_new_name(v)}
                           handlerEnter={add_name}
                           width={"12em"}/>
                <ActionButton icon={"add"} title={t("添加")} onClick={add_name}/>
            </div>
            <div className="div-row">
                <ActionButton icon={"save"} title={t("保存忽略名字")} onClick={save_names}/>
                <ActionButton icon={"settings"} title={t("忽略名字设置")} onClick={props.on_open_setting}/>
            </div>
        </div>
    </div>;
}
