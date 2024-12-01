import React, {useContext, useEffect, useRef, useState} from 'react';
import {FileItem} from "./FileItem";
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp} from "../../util/config";
import {useLocation, useNavigate} from "react-router-dom";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {getNewDeleteByList, getNextByLoop} from "../../../../common/ListUtil";
import {scanFiles} from "../../util/file";
import {PromptEnum} from "../prompts/Prompt";
import {getRouterAfter} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {FileShell} from "../shell/FileShell";
import {getFileNameByLocation, getFilesByIndexs} from "./FileUtil";
import Noty from "noty";
import {DropdownTag, TextLine} from "../../../meta/component/Dashboard";
import {InputTextIcon} from "../../../meta/component/Input";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {NotyFail} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import {user_click_file} from "../../util/store.util";


export enum FileListShowTypeEmum {
    block = "",
    gallery = "gallery",
    list = "list"
}


const fileTypes = Object.values(FileListShowTypeEmum);

const columnWidth = 280;

let pre_search:GetFilePojo;

export default function FileList() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview);

    const { t } = useTranslation();

    const inputRef = useRef(null);
    let location = useLocation();
    const navigate = useNavigate();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [copyedFileList,setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [enterKey,setEnterKey] = useRecoilState($stroe.enterKey);
    const [cutedFileList,setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow,setShellShow] = useRecoilState($stroe.fileShellShow);

    const [file_paths, setFile_paths] = useRecoilState($stroe.file_root_list);
    const [file_root_path,setFile_root_path] = useRecoilState($stroe.file_root_index);
    const [itemWidth,setItemWidth] = useState(undefined);
    const [search,setSearch] = useState("");

    const {reloadUserInfo} = useContext(GlobalContext);
    const { click_file } = user_click_file();

    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);


    const fileHandler = async () => {
        // 文件列表初始化界面
        const rsp = await fileHttp.get(getRouterAfter('file',location.pathname));
        if (rsp.code === RCode.PreFile) {
            click_file({name:rsp.message,context:rsp.data}); // 对于非文本类型的暂时不能用这种长路径url直接打开
            return;
        }
        if (rsp.code !== RCode.Sucess) {
            if (rsp.message) {
                NotyFail(rsp.message);
            }
            return;
        }
        setNowFileList(rsp.data)
        pre_search =rsp.data;
    }
    const handleResize = () => {
        let columns = Math.floor(
            document.querySelector("main").offsetWidth / columnWidth
        );
        if (columns === 0) columns = 1;
        setItemWidth(`calc(${100 / columns}% - 1em)`)
    };
    // 在组件挂载后执行的逻辑
    useEffect(() => {
        const fetchData = async () => {
            await fileHandler();
        };
        fetchData();
        // @ts-ignore
        setEditorSetting({open: false});
        setFilePreview({open:false});

    }, [location]);
    const drop = async (event) => {
        event.preventDefault();
        let dt = event.dataTransfer;
        // console.log(dt)
        let el = event.target;
        // console.log(el,dt)
        if (dt.files.length <= 0) return;
        for (let i = 0; i < 5; i++) {
            if (el !== null && !el.classList.contains("item")) {
                el = el.parentElement;
            }
        }
        // 文件名不会包含绝对路径
        let files = await scanFiles(dt);
        setUploadFiles(files);
        setShowPrompt({show: true,type: PromptEnum.FilesUpload,overlay: false,data:{}});
    }
    const dragover = (event)=>{event.preventDefault();}
    useEffect(() => {

        const element = inputRef.current;
        // @ts-ignore
        const doc = element.ownerDocument;
        doc.addEventListener("dragover", dragover);
        doc.addEventListener("drop", drop);
        handleResize();
        window.addEventListener('resize', handleResize);
        return ()=>{
            doc.removeEventListener("dragover", dragover);
            doc.removeEventListener("drop", drop);
            window.removeEventListener('resize', handleResize);
            if(shellShow.show) {
                setShellShow({show: false,path: ''})
            }
        }
    }, []);
    function switchGridView() {
        setFileType(getNextByLoop(fileTypes, fileType))
    }
    function routerClick() {
        setSelectList([])
        setClickList([])
    }
    function shellClick() {
            if (!shellShow.show) {
                setShellShow({
                    show: true,
                    path: getRouterAfter('file',location.pathname)
                })
            } else {
                setShellShow({
                    show: false,
                    path: ''
                })
            }
    }
    function ok(txt) {
        new Noty({
            type: 'success',
            text: txt,
            timeout: 1000, // 设置通知消失的时间（单位：毫秒）
            layout:"bottomLeft"
        }).show();
    }


    // 文件复制 移动 剪辑 创建  下载 压缩
    function copy() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCopyedFileList(files.map(file=>getFileNameByLocation(location,file.name)));
        setCutedFileList([]);
        ok('已复制')
    }
    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCutedFileList(files.map(file=>getFileNameByLocation(location,file.name)));
        setCopyedFileList([])
        ok('已剪切')
    }
    function paste(){
        setShowPrompt({show: true,type:PromptEnum.Confirm,overlay: true,data:{}});
    }
    function dirnew() {
        setShowPrompt({show: true,type:PromptEnum.DirNew,overlay: true,data:{dir:getRouterAfter('file',location.pathname)}});
    }
    function filenew() {
        setShowPrompt({show: true,type:PromptEnum.FileNew,overlay: true,data:{dir:getRouterAfter('file',location.pathname)}});
    }
    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i]= getFileNameByLocation(location,file.name)
        }
        const url = fileHttp.getDownloadUrl(files);
        window.open(url);
    }
    function updateFile() {
        setShowPrompt({show: true,type:PromptEnum.FileRename,overlay: true,data:{}});
    }
    function compress() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i]= getFileNameByLocation(location,file.name)
        }
        if (!files || files.length === 0) {
            NotyFail("没有选中");
            return;
        }
        setShowPrompt({show: true,type:PromptEnum.Compress,overlay: true,data:{files}});
    }



    // 多root目录切换
    const baseSwitch = async (v) =>{
        setFile_root_path(v);
        await fileHttp.post("base_switch",{root_index:v})
        await reloadUserInfo();
        navigate("/file/");
        setSelectList([])
        setClickList([])
    }

    // 搜索
    const searchHanle = ()=>{
        if (!pre_search) {
            return;
        }
        setSelectList([])
        setClickList([])
        const files = [];
        const folders = [];
        for (const file of pre_search.files ?? []) {
            if (file.name.includes(search)) {
                files.push(file);
            }
        }
        for (const folder of pre_search.folders ?? []) {
            if (folder.name.includes(search)) {
                folders.push(folder);
            }
        }
        setNowFileList({files,folders});
    }

    // 文件夹信息
    const folder_info = async ()=>{
        const rsq = await fileHttp.post("file/info",{type:FileTypeEnum.folder,path:getRouterAfter('file',location.pathname)})
        if(rsq.code === RCode.Sucess) {
            set_prompt_card({open:true,title:"信息",context_div : (
                    <div >
                        <TextLine left={t("挂载位置磁盘")} right={ rsq.data && rsq.data.total_size}/>
                        <TextLine left={`${t("磁盘剩余")}`} right={ rsq.data && rsq.data.left_size}/>
                        <TextLine left={`${t("文件系统")}`} right={ rsq.data && rsq.data.fs_type}/>
                        <TextLine left={`${t("文件夹数")}`} right={nowFileList.folders.length}/>
                        <TextLine left={`${t("文件数")}`} right={nowFileList.files.length}/>
                    </div>
                )})
        }

    }


    // 快捷键
    const [isFocused, setIsFocused] = useState(false);
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!isFocused) {
                return;
            }
            if(!event.ctrlKey) {
                if(event.key === 'Escape') {
                    setSelectList([])
                } else if(event.key === 'Shift') {
                    setEnterKey("shift")
                }
                return;
            }
            if(event.key === 'a' || event.key === 'A') {
                const len = nowFileList.files.length;
                const len2 = nowFileList.folders.length;
                const list = [];
                for (let i= 0; i < len+len2; i++) {
                    list.push(i);
                }
                setSelectList(list)
            }  else {
                setEnterKey("ctrl")
            }
        };
        const handleKeyUp = (event) => {
            if (!event.ctrlKey) {
                setEnterKey("");
            }
        };
        // 添加全局键盘事件监听
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        // 在组件卸载时移除事件监听
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [nowFileList,isFocused]);
    const clickBlank = (event) => {
        if (event.target === event.currentTarget) {
            setSelectList([])
        }
    }

    return (
        <div className={"not-select-div"} >
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")} icon={"search"} value={""} handleInputChange={(v) => {setSearch(v)}} max_width={"25em"}/> }>
                {/*<ActionButton icon="upload_file" title={"上传"}/>*/}
                {selectedFile.length > 0 && <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                    setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {}})
                }}/>}
                {selectedFile.length > 0 && <ActionButton icon={"content_copy"} title={t("复制")} onClick={copy}/>}
                {selectedFile.length > 0 && <ActionButton icon={"content_cut"} title={t("剪切")} onClick={cut}/>}
                {(copyedFileList.length > 0 || cutedFileList.length > 0) &&
                    <ActionButton onClick={paste} icon={"content_paste"} title={t("粘贴到此处")}
                                  tip={copyedFileList.length + cutedFileList.length}/>}
                {selectedFile.length > 0 && <ActionButton icon={"download"} title={t("下载")} onClick={downloadFile}/>}
                {selectedFile.length > 0 && <ActionButton icon={"compress"} title={t("压缩")} onClick={compress}/>}
                {selectedFile.length === 1 &&
                    <ActionButton icon={"edit_attributes"} title={t("重命名")} onClick={updateFile}/>}
                <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
                <ActionButton icon={"grid_view"} title={t("切换样式")} onClick={switchGridView}/>
                <ActionButton icon={"create_new_folder"} title={t("创建文件夹")} onClick={dirnew}/>
                <ActionButton icon={"note_add"} title={t("创建文本文件")} onClick={filenew}/>
                <ActionButton icon={"info"} title={t("信息")} onClick={folder_info}/>
                <DropdownTag title={t("切换目录")} items={file_paths} click={(v) => {
                    baseSwitch(v);
                }} pre_value={file_root_path}/>
            </Header>
            <div id={"listing"} className={`mosaic file-icons ${fileType}`} ref={inputRef} onMouseEnter={()=>{setIsFocused(true)}} onMouseLeave={()=>{setIsFocused(false)}}>
                {<RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}></RouteBreadcrumbs>}
                {(nowFileList.folders && nowFileList.folders.length > 0) && <h2>{t("文件夹")}</h2>}
                {(nowFileList.folders) &&
                    // @ts-ignore
                    (<div onClick={clickBlank}>{nowFileList.folders.map((v, index) => (<FileItem itemWidth={itemWidth} index={index} key={index} {...v} />))}</div>)
                }
                {(nowFileList.files && nowFileList.files.length > 0) && <h2 onClick={clickBlank}>{t("文件")}</h2>}
                {(nowFileList.files) &&
                    // @ts-ignore
                    (<div onClick={clickBlank}>
                        {nowFileList.files.map((v, index) => (
                        // @ts-ignore
                        <FileItem itemWidth={itemWidth} index={index + nowFileList.folders.length} key={index} {...v}  />))}
                    </div>)
                }
            </div>
            <FileShell />
        </div>
    )
}
