import React, {useContext, useEffect, useRef, useState} from 'react';
import {FileItem} from "./FileItem";
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp, userHttp} from "../../util/config";
import {useLocation, useNavigate} from "react-router-dom";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {getNextByLoop} from "../../../../common/ListUtil";
import {scanFiles} from "../../util/file";
import {PromptEnum} from "../prompts/Prompt";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {FileShell} from "../shell/FileShell";
import {getFileNameByLocation, getFilesByIndexs} from "./FileUtil";
import {DropdownTag, TextLine} from "../../../meta/component/Dashboard";
import {InputTextIcon} from "../../../meta/component/Input";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import {use_file_to_running, user_click_file} from "../../util/store.util";
import {formatFileSize} from '../../../../common/ValueUtil';
import {removeLastDir} from "../../../project/util/ListUitl";
import {TextTip} from "../../../meta/component/Card";
import {WorkFlow} from "./component/workflow/WorkFlow";
import {workflow_dir_name, WorkFlowRealTimeReq} from "../../../../common/req/file.req";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {WorkFlowRealTime} from "./component/workflow/WorkFlowRealTime";
import {FileListShowTypeEmum} from "../../../../common/req/user.req";
import {isAbsolutePath, path_join} from '../../../../common/path_util';
import {SysPojo} from "../../../../common/req/sys.pojo";


const fileTypes = Object.values(FileListShowTypeEmum);

const columnWidth = 280;

let pre_search:GetFilePojo;

let to_running_files_set_value;
let dir_info = {} as any;
export default function FileList() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview);

    const { t } = useTranslation();

    const inputRef = useRef(null);
    let location = useLocation();
    const navigate = useNavigate();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    // const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
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
    const [workflow_show,set_workflow_show] = useRecoilState($stroe.workflow_show);
    const [workflow_realtime_show,set_workflow_realtime_show] = useRecoilState($stroe.workflow_realtime_show);
    const [workflow_show_click,set_workflow_show_click] = useState(false);

    const {reloadUserInfo} = useContext(GlobalContext);
    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const { click_file } = user_click_file();

    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const {file_is_running} = use_file_to_running();
    const [to_running_files_set, set_to_running_files_set] = useRecoilState($stroe.to_running_files);

    const workflow_watcher = async () => {
        const p = new WorkFlowRealTimeReq();
        p.dir_path = `${getRouterAfter('file', getRouterPath())}`
        ws.addMsg(CmdType.workflow_realtime,(data)=>{
            // console.log(data.context??[])
            const set = new Set<string>(data.context??[]);
            for (const it of to_running_files_set_value??[]) {
                if(it.endsWith('.workflow.yml') && !set.has(it)) {
                    NotySucess(`${it.slice(0,-13)} done!`);
                } else if(it.endsWith('.act') && !set.has(it)) {
                    NotySucess(`${it.slice(0,-4)} done!`);
                }
            }
            to_running_files_set_value = set;
            set_to_running_files_set(set)
        })
        await ws.sendData(CmdType.workflow_realtime,p);
    }
    const fileHandler = async (path?:string) => {
        // 文件列表初始化界面
        if(path) {
            path = encodeURIComponent(path)+"?is_sys_path=1"
        } else {
            path = encodeURIComponent(getRouterAfter('file',getRouterPath()))
        }
        const rsp = await fileHttp.get(path); // 方式错误路径 因为没有使用  # 路由 这里加上去 location.hash
        if (rsp.code === RCode.PreFile) {
            click_file({name:rsp.message,context:rsp.data,opt_shell:true }); // 对于非文本类型的暂时不能用这种长路径url直接打开
            return;
        }
        if (rsp.code !== RCode.Sucess) {
            if (rsp.message) {
                NotyFail(rsp.message);
            }
            return;
        }
        const data :GetFilePojo = rsp.data;
        let have_workflow_water  = false;
        for (const item of data.files??[]) {
            item.origin_size = item.size;
            item.size = formatFileSize(item.size);
            if(item.name.endsWith('workflow.yml') && !have_workflow_water) {
                have_workflow_water = true;
                workflow_watcher();
            }
        }
        if(data.relative_user_path) {
            navigate(data.relative_user_path);
            return;
        }
        for (const folder of data.folders??[]) {
            if(folder.name === workflow_dir_name) {
                // 如果有workflow
                set_workflow_show_click(true)
                if(!have_workflow_water) {
                    workflow_watcher()
                }

            }
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
        set_workflow_show_click(false);
        dir_info = {};
        to_running_files_set_value = undefined;

    }, [location]);
    useEffect(() => {
        return async ()=>{
            if (!shellShow.show) {
                await ws.unConnect();
            }
            set_to_running_files_set(new Set())
        }
    }, [shellShow]);
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
    async function switchGridView() {
        // setFileType(getNextByLoop(fileTypes, fileType));
        const type = getNextByLoop(fileTypes, user_base_info?.user_data?.file_list_show_type??'');
        await userHttp.post('save_user_file_list_show_type',{type});
        initUserInfo();
    }
    function routerClick() {
        setSelectList([])
        setClickList([])
    }
    function shellClick() {
            if (!shellShow.show) {
                setShellShow({
                    show: true,
                    path: getRouterAfter('file',getRouterPath())
                })
            } else {
                setShellShow({
                    show: false,
                    path: ''
                })
            }
    }
    function ok(txt) {
        NotySucess(txt)
    }


    // 文件复制 移动 剪辑 创建  下载 压缩
    function copy() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCopyedFileList(files.map(file=>getFileNameByLocation(file.name)));
        setCutedFileList([]);
        ok('已复制')
    }
    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCutedFileList(files.map(file=>getFileNameByLocation(file.name)));
        setCopyedFileList([])
        ok('已剪切')
    }
    function paste(){
        setShowPrompt({show: true,type:PromptEnum.Confirm,overlay: true,data:{}});
    }
    function dirnew() {
        setShowPrompt({show: true,type:PromptEnum.DirNew,overlay: true,data:{dir:getRouterAfter('file',getRouterPath())}});
    }
    function filenew() {
        setShowPrompt({show: true,type:PromptEnum.FileNew,overlay: true,data:{dir:getRouterAfter('file',getRouterPath())}});
    }
    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i]= encodeURIComponent(getFileNameByLocation(file.name))
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
            files[i]= getFileNameByLocation(file.name)
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
    const update_dir_info = (show_info) => {
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    <TextLine left={t("挂载位置磁盘")} right={ show_info?.total_size}/>
                    <TextLine left={`${t("磁盘剩余")}`} right={ show_info?.left_size}/>
                    <TextLine left={`${t("文件系统")}`} right={ show_info?.fs_type}/>
                    <TextLine left={`${t("文件夹数")}`} right={nowFileList.folders.length}/>
                    <TextLine left={`${t("文件数")}`} right={nowFileList.files.length}/>
                    <TextLine left={`${t("当前位置")}`} right={<TextTip context={show_info?.now_absolute_path}/>}/>
                </div>
            )})
    }
    // 文件夹信息
    const folder_info = async ()=>{
        let show_info ;
        if(!dir_info.now_absolute_path) {
            ws.addMsg(CmdType.file_info, (wsData: WsData<SysPojo>) => {
                const pojo = wsData.context;
                if(show_info) {
                    dir_info = { ...dir_info, ...pojo };
                    // 排除第一次
                    ws.removeMsg(CmdType.file_info);
                    update_dir_info(dir_info);
                }
            })
            const result = await ws.sendData(CmdType.file_info,{type:FileTypeEnum.folder,path:getRouterAfter('file',getRouterPath())});
            show_info = result.context;
            dir_info = show_info;
            update_dir_info(dir_info);
        }
        update_dir_info(dir_info);
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
    const uploadFile = () => {
        setShowPrompt({show: true,type:PromptEnum.UploadFile,overlay: true,data:{
            call:(event)=>{

                let files = (event.currentTarget as HTMLInputElement)?.files;
                if(!files)return;

                let folder_upload = !!files[0].webkitRelativePath;

                const uploadFiles: any = [];
                const dirs = new Set(); // 文件夹需要提前创建
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const fullPath = folder_upload ? file.webkitRelativePath : `${file.webkitRelativePath}${file.name}`;
                    file['fullPath'] = fullPath;
                    if(folder_upload) {
                        dirs.add(removeLastDir(fullPath));
                    }
                    uploadFiles.push(file);
                    // uploadFiles.push({
                    //     file,
                    //     name: file.name,
                    //     size: file.size,
                    //     isDir: false,
                    //     fullPath,
                    // });
                }
                const list = [];
                if(folder_upload) {
                    // @ts-ignore
                    for (const file of dirs) {
                        list.push({
                            isDir:true,
                            fullPath:file,
                            name:file
                        })
                    }
                }
                list.push(...uploadFiles);
                setUploadFiles(list);
                setShowPrompt({show: true,type: PromptEnum.FilesUpload,overlay: false,data:{}});
            }
            }});
    }
    const routeBreadcrumbsEnter = (path)=>{
        if(isAbsolutePath(path)){
            fileHandler(path);
        } else {
            navigate(path_join(getRouterPath(), path))
        }
        setSelectList([])
        setClickList([])
        setNowFileList({files:[],folders:[]});
    }
    return (
        <div className={"not-select-div"} >
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")} icon={"search"} value={""} handleInputChange={(v) => {setSearch(v)}} max_width={"25em"}/> }>
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
                {workflow_show_click && <ActionButton icon={"api"} title={"workflow"} onClick={()=>{set_workflow_show(!workflow_show)}}/>}
                <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
                <ActionButton icon={"grid_view"} title={t("切换样式")} onClick={switchGridView}/>
                <ActionButton icon={"create_new_folder"} title={t("创建文件夹")} onClick={dirnew}/>
                <ActionButton icon={"note_add"} title={t("创建文本文件")} onClick={filenew}/>
                <ActionButton icon="upload_file" title={"上传"} onClick={uploadFile}/>
                <ActionButton icon={"info"} title={t("信息")} onClick={folder_info}/>
                <DropdownTag title={t("切换目录")} items={file_paths} click={(v) => {
                    baseSwitch(v);
                }} pre_value={file_root_path}/>
            </Header>
            <RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick} input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            <div id={"listing"} className={`mosaic file-icons ${user_base_info?.user_data?.file_list_show_type??''}`} ref={inputRef} onMouseEnter={()=>{setIsFocused(true)}} onMouseLeave={()=>{setIsFocused(false)}}>
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
                        // @ts-ignore 这里使用的就是  nowFileList.folders
                        <FileItem icon={file_is_running(v.name)?"refresh":undefined} itemWidth={itemWidth} index={index + nowFileList.folders.length} key={index} {...v}  />))}
                    </div>)
                }
            </div>
            <FileShell />
            {workflow_show && <WorkFlow />}
            {workflow_realtime_show.open &&  <WorkFlowRealTime />}

        </div>
    )
}
