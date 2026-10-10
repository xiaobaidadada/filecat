import React, {useCallback, useEffect, useRef, useState} from "react";
import {$stroe} from "../../../../util/store";
import { useAtom } from 'jotai'; 
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {FolderTree} from "./Tree/FolderTree";
import {fileHttp} from "../../../../util/config";
import {get_last_name, getRouterAfter, getRouterPrePath} from "../../../../util/WebPath";
import {RCode} from "../../../../../../common/Result.pojo";
import {FileTree, FileTypeEnum} from "../../../../../../common/file.pojo";
import {editor_data} from "../../../../util/store.util";
// import {getEditModelType} from "../../../../../../common/StringUtil";
import {NotyFail, NotySuccess, NotyWaring} from "../../../../util/noty";
import {saveTxtReq} from "../../../../../../common/req/file.req";
import * as lodash from "lodash";
import {ableExtBeautify, FileMenuData, getFileFormat} from "../../../../../../common/FileMenuType";
import {PromptEnum} from "../../../prompts/Prompt";
import {useTranslation} from "react-i18next";
import { MAX_SIZE_TXT } from "../../../../../../common/ValueUtil";
import {useLocation, useNavigate} from "react-router-dom";
// import Ace from "../Ace";


const Ace = React.lazy(() => import("../Ace"));
const MdEditor = React.lazy(() => import("../md_editor/MdEditor"));
const MdOutline = React.lazy(() => import("../md_editor/MdOutline"));
import type {MdEditorPaneApi, MdEditorPaneProps} from "../md_editor/MdEditor";
import type {OutlineItem} from "../md_editor/MdOutline";

/** 是否用 md 编辑器（所见即所得）打开：只认 .md 后缀，其余一律走 Ace 文本编辑 */
function is_markdown_file(name: string): boolean {
    return getFileFormat(name) === FileTypeEnum.md;
}

/** 左侧面板显示的内容 */
type NavContent = "folder" | "outline";


export default function Studio(props) {
    // const [studio, set_studio] = useAtom($stroe.studio);
    const [list, set_list] = useState([]);
    const [pre_path, set_pre_path] = useState("")
    const [editorValue, setEditorValue] = useState("");
    const [update, set_update] = useState<boolean>(false);
    // const [edit_model, set_edit_model] = useState("text");
    const [edit_filename, set_edit_filename] = useState({path: "", name: ""});
    const [edit_file_path, set_edit_file_path] = useState("");
    const [confirm, set_confirm] = useAtom($stroe.confirm);
    const [have_update, set_have_update] = useState(false);
    const [shellShow, setShellShow] = useAtom($stroe.fileShellShow);
    const [file_shell_hidden, set_file_shell_hidden] = useAtom($stroe.file_shell_hidden);
    const studioDividerRef = useRef(null);
    const studio_nav_ref = useRef(null);
    const [drag, setShellDrag] = useState(false);
    const [nav_width, set_nav_width] = useState(16);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const {t} = useTranslation();
    const navigate = useNavigate();

    // 当前文件是否用 md 编辑器打开
    const is_md = is_markdown_file(edit_filename.name);
    // md 编辑器交给外层的编辑能力（保存、模式切换、导出、大纲跳转）
    const md_api = useRef<MdEditorPaneApi | null>(null);
    // md 编辑器上报的大纲数据与当前高亮项
    const [outline_items, set_outline_items] = useState<OutlineItem[]>([]);
    const [outline_active, set_outline_active] = useState(-1);
    // 左侧面板内容：目录 / 大纲（大纲只对 md 文件可用）
    const [nav_content, set_nav_content] = useState<NavContent>("folder");
    // 左侧面板开关。切到非 md 文件时自动回到目录视图
    const [show_nav, set_show_nav] = useState(true);
    // md 编辑器的脏标记（由它上报，用于 Header 显示保存按钮）
    const [md_dirty, set_md_dirty] = useState(false);


    const location = useLocation();
    let folder_path = location.pathname.split("/").filter(Boolean).pop();
    folder_path = decodeURIComponent(folder_path);

    function shellClick() {
        if (file_shell_hidden === true || file_shell_hidden === false) {
            set_file_shell_hidden(!file_shell_hidden);
            return;
        }
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file', folder_path)
            })
            set_file_shell_hidden(false);
        } else {
            setShellShow({
                show: false,
                path: ''
            })
        }
    }

    const get_item = async () => {
        const p = getRouterAfter('file', folder_path);
        set_pre_path(p);
        set_edit_filename({path: p, name: get_last_name(p)});
        const rsp = await fileHttp.post('studio/get/item', {path: p});
        if (rsp.code === RCode.Success) {
            const folder_list = [];
            const file_list = [];
            for (const item of rsp.data.list) {
                if(item.type === "folder") {
                    folder_list.push(item);
                } else if (item.type === "file") {
                    file_list.push(item);
                }
            }
            set_list([...folder_list,...file_list]);
        }
    }
    useEffect(() => {
        setEditorValue("");
        // @ts-ignore
        // set_edit_filename({});
        set_have_update(false);
        // if (!studio.folder_path) {
        //     return;
        // }
        get_item();
    }, []);

    const cancel = () => {
        // set_studio({});
        setShellShow({
            show: false,
            path: ''
        })
        set_file_shell_hidden(undefined);
        navigate(-1);
    }
    const load_file = async (name, pre_path) => {
        // const model = getEditModelType(name) ?? "text";
        // set_edit_model(model);
        const rsq = await fileHttp.get(`${encodeURIComponent(pre_path)}`)
        setEditorValue(rsq.data);
        editor_data.set_value_temp(rsq.data);
        set_edit_filename({path: pre_path, name});
        set_edit_file_path(pre_path);
        // 换成别的文件时左侧面板回到目录视图：大纲是上一个 md 文件的，留着会对不上
        set_nav_content("folder");
        set_md_dirty(false);
    }
    const open_file = (pojo: FileTree,pre_path)=>{
        if(pojo.size > MAX_SIZE_TXT) {
            set_confirm({
                open: true, handle: () => {
                    load_file(pojo.name, pre_path);
                    set_confirm({open: false, handle: null});
                    set_have_update(false);
                }, title: "超过20MB了还要打开吗?"
            });
        } else {
             load_file(pojo.name, pre_path);
        }
    }
    const click = async (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => {
        if (pojo.type === "folder") {
            const rsp = await fileHttp.post('studio/get/item', {path: `${pre_path}`});
            if (rsp.code === RCode.Success) {
                const folder_list = [];
                const file_list = [];
                for (const item of rsp.data.list) {
                    if(item.type === "folder") {
                        folder_list.push(item);
                    } else if (item.type === "file") {
                        file_list.push(item);
                    }
                }
                set_children([...folder_list,...file_list]);
                // set_children(rsp.data.list);
            }
        } else {
            // 点击文件
            if (have_update) {
                set_confirm({
                    open: true, handle: () => {
                        set_confirm({open: false, handle: null});
                        set_have_update(false);
                        open_file(pojo,pre_path);
                    }, title: "确定不保存就切换吗?"
                });
                return;
            }
            open_file(pojo,pre_path);
        }
    }

    async function file_save() {
        if (!have_update) {
            return;
        }
        const data: saveTxtReq = {
            context: editor_data.get_editor_value()
        }
        const rsq = await fileHttp.post(`save/${encodeURIComponent(edit_file_path)}`, data)
        if (rsq.code === 0) {
            // NotySucess("保存成功");
            set_have_update(false);
        }
    }

    const handleKeyDown = (event) => {
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            if (have_update) {
                file_save();
            }
        }
    };
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [have_update]);
    let change = () => {
        // editor_data.set_value_temp(value);
        if (!have_update) {
            set_have_update(true);
        }
    }
    const handleDrag = useCallback(lodash.throttle((event) => {

        const size = parseFloat(getComputedStyle(studio_nav_ref.current).fontSize);
        const left = window.innerWidth / size - 4;
        const userPos = event.clientX / size;
        // @ts-ignore
        const right = 2.25 + studioDividerRef.current.offsetWidth / size;
        if (userPos <= left && userPos >= right) {
            set_nav_width(parseFloat(userPos.toFixed(2)))
        }
    }, 32), [])
    const handlePointerDown = () => {
        // 按下
        setShellDrag(true)
        studio_nav_ref.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup = () => {
        // 抬起
        setShellDrag(false)
        studio_nav_ref.current.removeEventListener("pointermove", handleDrag);

    };


    const items_folder = [{r: t("创建文件"), v: "创建文件"},{r: t("创建目录"), v: "创建目录"},{r: t("重命名"), v: "重命名"},{r: t("删除"), v: "删除"}];
    const items_file = [{r: t("重命名"), v: "重命名"}, {r: t("删除"), v: "删除"}];

    const handleContextMenu = (event, name, path, isDir, toggleExpansion) => {
        event.preventDefault();
        const pojo = new FileMenuData();
        pojo.path = path;
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.items = isDir ? items_folder : items_file;
        if (toggleExpansion === get_item) {
            pojo.items = pojo.items.slice(0,2);
        }
        pojo.type = isDir ? FileTypeEnum.studio_folder : FileTypeEnum.studio_file;
        const call = (v?:boolean) => {
            toggleExpansion(v);
        }
        pojo.textClick = (v) => {
            switch (v) {
                case "创建文件":
                    setShowPrompt({show: true, type: PromptEnum.FileNew, overlay: true, data: {dir: path, call}});
                    break;
                case "创建目录":
                    setShowPrompt({show: true,type:PromptEnum.DirNew,overlay: true,data:{dir: path, call}});
                    break;
                case "删除":
                    if (have_update && (edit_filename.path === path || edit_filename.path.includes(path)) ) {
                        const extra_call = ()=>{
                            call(isDir);
                            set_have_update(false);
                            set_edit_filename({});
                            setEditorValue("");
                            editor_data.set_value_temp("");
                        }
                        setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path, call:extra_call,filename:name}});
                        break;
                    }
                    setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path,filename:name, call:isDir?()=>{call(true)}:call}});
                    break;
                case "重命名":
                    setShowPrompt({show: true,type:PromptEnum.FileRename,overlay: true,data:{path:path,dir:getRouterPrePath(path),call:()=>{call(true)},filename:name}});
                    break;
                default:
                    break;
            }
        }
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };

    function formatCode (){
        editor_data.get_editor()?.['formatCode']()
    }

    /** 左侧面板是否显示大纲（仅 md 文件、且面板已展开、且切到大纲视图时） */
    const outline_on = is_md && show_nav && nav_content === "outline";

    return <div className={"studio studio--file"}>
        <Header ignore_tags={true}
                left_children={[
                    <ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
                    <div key={2}>{edit_filename.name}</div>
                ]}>
            <title>{edit_filename.name}</title>
            {/* 左侧面板开关：任何编辑器下都能收起/展开，md 文件时里面是大纲+目录 */}
            <ActionButton title={"侧边栏"} icon={"list"} onClick={() => set_show_nav(v => !v)}
                          selected={show_nav}/>
            {/* md 文件专属能力：与全屏 md 编辑器的 Header 保持一致 */}
            {is_md && [
                md_dirty ? <ActionButton key={"save"} title={t("保存")} icon={"save"}
                                         onClick={() => md_api.current?.save()}/> : null,
                <ActionButton key={"mode"} icon={md_api.current?.mode() === "source" ? "edit" : "code"}
                              title={md_api.current?.mode() === "source" ? t("实时编辑模式") : t("源码模式")}
                              onClick={() => md_api.current?.toggle_mode()}/>,
                <ActionButton key={"pdf"} title={t("导出PDF")} icon={"print"}
                              onClick={() => md_api.current?.export_pdf()}/>,
            ]}
            { !is_md && ableExtBeautify(edit_filename.name) && <ActionButton title={"格式化"} icon={"data_object"} onClick={formatCode}/> }
            <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
            {!is_md && have_update && <ActionButton title={"保存"} icon={"save"} onClick={file_save}/>}
        </Header>
        <div className={"studio-body"} ref={studio_nav_ref}>
            {show_nav && (
                <div className={"studio-nav"} style={{width: `${nav_width - 1}em`}}
                     onContextMenu={(event) => {
                         handleContextMenu(event, edit_filename.name, getRouterAfter('file', folder_path), true, get_item)
                     }}
                >
                    {outline_on
                        ? <MdOutline items={outline_items} active_pos={outline_active}
                                     on_click={(item) => md_api.current?.goto_heading(item)}/>
                        : <FolderTree pre_path={pre_path} list={list} click={click}
                                      handleContextMenu={handleContextMenu} fatherNowToggleExpansion={get_item}/>}
                    {/* 底部切换：md 文件可以在大纲与目录之间切，其他文件没有大纲，不显示 */}
                    {is_md && (
                        <div className={"studio-nav-switch"}>
                            <ActionButton
                                icon={outline_on ? "folder" : "list"}
                                title={outline_on ? t("文件目录") : t("大纲")}
                                onClick={() => set_nav_content(outline_on ? "folder" : "outline")}/>
                        </div>
                    )}
                </div>
            )}
            {show_nav && <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                 onPointerUp={handlePointerup}/>}
            {drag &&
                <div
                    className="shell__overlay" onPointerUp={handlePointerup}
                />
            }
            {/* md 文件走 md 编辑器（含工具栏、右键菜单、大纲、主题、源码模式），
                其他文件走 Ace 文本编辑器。
                md 编辑器嵌进来自带 md-editor-context 外壳，因此这里不再包 studio-editor 的内边距。 */}
            {is_md
                ? <div className={"studio-editor studio-editor--md"} key={edit_file_path}>
                    <React.Suspense fallback={null}>
                        <MdEditor pane={{
                            path: edit_file_path,
                            url: fileHttp.getDownloadUrl(encodeURIComponent(edit_file_path)),
                            name: edit_filename.name,
                            on_dirty: set_md_dirty,
                            on_outline: (items, active) => {
                                set_outline_items(items);
                                set_outline_active(active);
                            },
                            register: (api) => {
                                md_api.current = api;
                            },
                        }}/>
                    </React.Suspense>
                </div>
                : <div className={"studio-editor"} key={edit_file_path}>
                    {edit_filename.name && <React.Suspense fallback={null}>
                        <Ace name={edit_filename.name} on_change={change}/>
                    </React.Suspense>}
                </div>}
        </div>
    </div>
}