import React, {useCallback, useEffect, useRef, useState} from "react";
import {$stroe} from "../../../../util/store";
import {useRecoilState} from "recoil";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {FolderTree} from "./Tree/FolderTree";
import {fileHttp} from "../../../../util/config";
import {getRouterAfter, getRouterPrePath} from "../../../../util/WebPath";
import {RCode} from "../../../../../../common/Result.pojo";
import {FileTree, FileTypeEnum} from "../../../../../../common/file.pojo";
import {editor_data} from "../../../../util/store.util";
import {getEditModelType} from "../../../../../../common/StringUtil";
import {NotyFail, NotySucess, NotyWaring} from "../../../../util/noty";
import {saveTxtReq} from "../../../../../../common/req/file.req";
import lodash from "lodash";
import {FileMenuData, getFileFormat} from "../../../../../../common/FileMenuType";
import {PromptEnum} from "../../../prompts/Prompt";
import {useTranslation} from "react-i18next";
import Ace from "../Ace";




export default function Studio(props) {
    const [studio, set_studio] = useRecoilState($stroe.studio);
    const [list, set_list] = useState([]);
    const [pre_path, set_pre_path] = useState("")
    const [editorValue, setEditorValue] = useState("");
    const [update, set_update] = useState<boolean>(false);
    const [edit_model, set_edit_model] = useState("text");
    const [edit_filename, set_edit_filename] = useState({path: "", name: ""});
    const [edit_file_path, set_edit_file_path] = useState("");
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);
    const [have_update, set_have_update] = useState(false);
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const [file_shell_hidden, set_file_shell_hidden] = useRecoilState($stroe.file_shell_hidden);
    const studioDividerRef = useRef(null);
    const studio_nav_ref = useRef(null);
    const [drag, setShellDrag] = useState(false);
    const [nav_width, set_nav_width] = useState(16);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const {t} = useTranslation();
    const [editor,set_editor] = useState(undefined);

    function shellClick() {
        if (file_shell_hidden !== undefined) {
            set_file_shell_hidden(!file_shell_hidden);
            return;
        }
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file', studio.folder_path)
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
        const p = getRouterAfter('file', studio.folder_path);
        set_pre_path(p);
        const rsp = await fileHttp.post('studio/get/item', {path: p});
        if (rsp.code === RCode.Sucess) {
            set_list(rsp.data.list);
        }
    }
    useEffect(() => {
        setEditorValue("");
        // @ts-ignore
        set_edit_filename({});
        set_have_update(false);
        if (!studio.folder_path) {
            return;
        }
        get_item();
    }, [studio]);

    const cancel = () => {
        set_studio({});
        setShellShow({
            show: false,
            path: ''
        })
        set_file_shell_hidden(undefined);
    }
    const load_file = async (name, pre_path) => {
        const model = getEditModelType(name) ?? "text";
        set_edit_model(model);
        const rsq = await fileHttp.get(`${pre_path}`)
        if (rsq.code === RCode.File_Max) {
            NotyFail("超过20MB");
            return;
        }
        setEditorValue(rsq.data);
        editor_data.set_value_temp(rsq.data);
        set_edit_filename({path: pre_path, name});
        set_edit_file_path(pre_path);
    }
    const click = async (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => {
        if (pojo.type === "folder") {
            const rsp = await fileHttp.post('studio/get/item', {path: `${pre_path}`});
            if (rsp.code === RCode.Sucess) {
                set_children(rsp.data.list);
            }
        } else {
            if (have_update) {
                set_confirm({
                    open: true, handle: () => {
                        load_file(pojo.name, pre_path);
                        set_confirm({open: false, handle: null});
                        set_have_update(false);
                    }, title: "确定不保存就切换吗?"
                });
                return;
            }
            // 点击文件
            await load_file(pojo.name, pre_path);
        }
    }

    async function file_save() {
        if (!have_update) {
            return;
        }
        const data: saveTxtReq = {
            context: editor.getValue()
        }
        const rsq = await fileHttp.post(`save/${edit_file_path}`, data)
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
    if (!studio.folder_path) {
        return;
    }

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
                        setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path, call:extra_call}});
                        break;
                    }
                    setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path, call:isDir?()=>{call(true)}:call}});
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

    return <div className={"studio"}>
        <Header ignore_tags={true}
                left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
                    <title key={2}>{edit_filename.name}</title>]}>
            <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
            {have_update && <ActionButton title={"保存"} icon={"save"} onClick={file_save}/>}
        </Header>
        <div className={"studio-body"} ref={studio_nav_ref}>
            <div className={"studio-nav"} style={{
                width: `${nav_width - 1}em`,
            }}
                 onContextMenu={(event) => {
                         handleContextMenu(event, edit_filename.name, getRouterAfter('file', studio.folder_path), true, get_item)
                 }}
            >
                <FolderTree pre_path={pre_path} list={list} click={click} handleContextMenu={handleContextMenu} fatherNowToggleExpansion={get_item}/>
            </div>
            <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                 onPointerUp={handlePointerup}/>
            {drag &&
                <div
                    className="shell__overlay" onPointerUp={handlePointerup}
                />
            }
            <div className={"studio-editor"} key={edit_filename.path}>
                {edit_filename.name && <Ace name={edit_filename.name}  on_change={change} init={(v)=>set_editor(v)}/>}
            </div>
        </div>
    </div>
}