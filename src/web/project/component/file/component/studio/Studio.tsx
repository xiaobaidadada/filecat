import React, {useCallback, useEffect, useRef, useState} from "react";
import {$stroe} from "../../../../util/store";
import {useRecoilState} from "recoil";

import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {FolderTree} from "./Tree/FolderTree";
import {fileHttp} from "../../../../util/config";
import {getRouterAfter} from "../../../../util/WebPath";
import {RCode} from "../../../../../../common/Result.pojo";
import {FileTree} from "../../../../../../common/file.pojo";
import {editor_data} from "../../../../util/store.util";
import AceEditor from "react-ace";
import {getEditModelType} from "../../../../../../common/StringUtil";
import {NotyFail, NotySucess, NotyWaring} from "../../../../util/noty";
import {saveTxtReq} from "../../../../../../common/req/file.req";
import lodash from "lodash";


export function Studio(props) {
    const [studio, set_studio] = useRecoilState($stroe.studio);
    const [list,set_list] = useState([]);
    const [pre_path,set_pre_path] = useState("")
    const [editorValue, setEditorValue] = useState("");
    const [update,set_update] = useState<boolean>(false);
    const [edit_model,set_edit_model]= useState("text");
    const [edit_filename,set_edit_filename]=useState({path:"",name:""});
    const [edit_file_path,set_edit_file_path]=useState("");
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const [have_update,set_have_update] = useState(false);
    const [shellShow,setShellShow] = useRecoilState($stroe.fileShellShow);
    const [file_shell_hidden,set_file_shell_hidden] = useRecoilState($stroe.file_shell_hidden);
    const studioDividerRef = useRef(null);
    const studio_nav_ref = useRef(null);
    const [drag,setShellDrag] = useState(false);
    const [nav_width,set_nav_width] = useState(16);

    function shellClick() {
        if (file_shell_hidden !== undefined) {
            set_file_shell_hidden(!file_shell_hidden);
            return;
        }
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file',studio.folder_path)
            })
            set_file_shell_hidden(false);
        } else {
            setShellShow({
                show: false,
                path: ''
            })
        }
    }
    const get_item = async ()=>{
        const p = getRouterAfter('file',studio.folder_path);
        set_pre_path(p);
        const rsp = await fileHttp.post('studio/get/item',{path:p});
        if (rsp.code === RCode.Sucess) {
            set_list(rsp.data.list);
        }
    }
    useEffect(() => {
        setEditorValue("");
        set_edit_filename({});
        set_have_update(false);
        if (!studio.folder_path) {
            return;
        }
        get_item();
    }, [studio]);

    const cancel = ()=>{
        set_studio({});
        setShellShow({
            show: false,
            path: ''
        })
        set_file_shell_hidden(undefined);
    }
    const load_file = async (name,pre_path) => {
        const model = getEditModelType(name) ?? "text";
        set_edit_model(model);
        const rsq = await fileHttp.get(`${pre_path}`)
        if (rsq.code === RCode.File_Max) {
            NotyFail("超过20MB");
            return;
        }
        setEditorValue(rsq.data);
        editor_data.set_value_temp(rsq.data);
        set_edit_filename({path: pre_path,name});
        set_edit_file_path(pre_path);
    }
    const click = async (pojo:FileTree,set_children:(list:FileTree[])=>void,pre_path:string) => {
        if (pojo.type === "folder") {
            const rsp = await fileHttp.post('studio/get/item',{path:`${pre_path}`});
            if (rsp.code === RCode.Sucess) {
                set_children(rsp.data.list);
            }
        } else {
            if (have_update) {
                setShowPrompt({open: true,handle:()=>{
                        load_file(pojo.name,pre_path);
                        setShowPrompt({open:false,handle:null});
                        set_have_update(false);
                    },title:"确定不保存就切换吗?" });
                return;
            }
            // 点击文件
            await load_file(pojo.name,pre_path);
        }
    }
    async function file_save() {
        if (!have_update) {
            return;
        }
        const data: saveTxtReq = {
            context:editor_data.get_value_temp()
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
            file_save();
        }
    };
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [have_update]);
    let change = (value) => {
        editor_data.set_value_temp(value);
        if (!have_update) {
            set_have_update(true);
        }
    }
    const handleDrag = useCallback(lodash.throttle( (event)=> {

        const size = parseFloat(getComputedStyle(studio_nav_ref.current).fontSize);
        const left = window.innerWidth / size - 4;
        const userPos = event.clientX / size;
        // @ts-ignore
        const right =2.25 +studioDividerRef.current.offsetWidth / size;
        if (userPos <= left && userPos >= right) {
            console.log(size)
            set_nav_width(parseFloat(userPos.toFixed(2)))
        }
    }, 32),[])
    const handlePointerDown = () => {
        // 按下
        setShellDrag(true)
        studio_nav_ref.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup= () => {
        // 抬起
        setShellDrag(false)
        studio_nav_ref.current.removeEventListener("pointermove", handleDrag);

    };
    if (!studio.folder_path) {
        return ;
    }
    return <div  className={"studio"}>
        <Header ignore_tags={true}
                left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
                    <title key={2}>{edit_filename.name}</title>]}>
            <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
            {have_update && <ActionButton title={"保存"} icon={"save"} onClick={file_save}/>}
        </Header>
        <div className={"studio-body"} ref={studio_nav_ref}>
            <div className={"studio-nav"}  style={{
                width: `${nav_width - 1}em`,
            }}>
                <FolderTree pre_path={pre_path} list={list} click={click}/>
            </div>
            <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                 onPointerUp={handlePointerup}/>
            {drag &&
                <div
                    className="shell__overlay" onPointerUp={handlePointerup}
                />
            }
            <div className={"studio-editor"} key={edit_filename.path}>
                {edit_filename.name && <AceEditor
                    mode={edit_model}
                    width="100%"
                    height="100%"
                    theme={"github"}
                    onChange={change}
                    fontSize={14}
                    showPrintMargin={false}
                    showGutter={true}
                    highlightActiveLine={false}
                    defaultValue={editorValue}
                    // wrapEnabled={true}
                    setOptions={{
                        useWorker: false,
                        enableBasicAutocompletion: true,
                        enableLiveAutocompletion: true,
                        enableSnippets: true,
                        showLineNumbers: true,
                        tabSize: 2,
                        // wrap:true
                    }}
                />}
            </div>
        </div>
    </div>
}