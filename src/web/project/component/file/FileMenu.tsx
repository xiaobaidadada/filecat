import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ActionButton} from "../../../meta/component/Button";
import {PromptEnum} from "../prompts/Prompt";
import {FileMenuData} from "../../../../common/FileMenuType";
import {FileTypeEnum} from "../../../../common/file.pojo";
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {use_auth_check, user_click_file} from "../../util/store.util";
import {GlobalContext} from "../../GlobalProvider";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {NotyFail, NotySucess} from "../../util/noty";
import {getFileNameByLocation, getFilesByIndexs} from "./FileUtil";
import {fileHttp, userHttp} from "../../util/config";
import {getNextByLoop} from "../../../../common/ListUtil";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {FileListShowTypeEmum, UserAuth} from "../../../../common/req/user.req";
import {removeLastDir} from "../../../project/util/ListUitl";
import {TextLine} from "../../../meta/component/Dashboard";
import {TextTip} from "../../../meta/component/Card";
import {routerConfig} from "../../../../common/RouterConfig";

let dir_info = {} as any;
const fileTypes = Object.values(FileListShowTypeEmum);

export function FileMenu() {
    const {t} = useTranslation();
    let location = useLocation();

    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    // const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [copyedFileList, setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList, setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    // const [windows_width, set_windows_width] = useRecoilState($stroe.windows_width);

    const [file_paths, setFile_paths] = useRecoilState($stroe.file_root_list);
    const [file_root_path, setFile_root_path] = useRecoilState($stroe.file_root_index);
    const [itemWidth, setItemWidth] = useState(undefined);
    const [search, setSearch] = useState("");
    const [workflow_show, set_workflow_show] = useRecoilState($stroe.workflow_show);
    const [workflow_realtime_show, set_workflow_realtime_show] = useRecoilState($stroe.workflow_realtime_show);
    const [workflow_show_click, set_workflow_show_click] = useRecoilState($stroe.work_flow_show);

    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {click_file} = user_click_file();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const file_num = useMemo(() => {
        return nowFileList.files.reduce(
            (count, v) => count + (v.type !== FileTypeEnum.folder ? 1 : 0),
            0
        );
    },[nowFileList])
    const folder_num = useMemo(() => {
        return nowFileList.files.reduce(
            (count, v) => count + (v.type === FileTypeEnum.folder ? 1 : 0),
            0
        ) + (nowFileList.folders?.length ?? 0)
    },[nowFileList])

    useEffect(()=>{
        dir_info = {}
    },[location]);

    function shellClick() {
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file', getRouterPath())
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
        setCopyedFileList(files.map(file => getFileNameByLocation(file.name)));
        setCutedFileList([]);
        ok('已复制')
    }

    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCutedFileList(files.map(file => getFileNameByLocation(file.name)));
        setCopyedFileList([])
        ok('已剪切')
    }

    function paste() {
        setShowPrompt({show: true, type: PromptEnum.Confirm, overlay: true, data: {}});
    }

    function dirnew() {
        setShowPrompt({
            show: true,
            type: PromptEnum.DirNew,
            overlay: true,
            data: {dir: getRouterAfter('file', getRouterPath())}
        });
    }

    function filenew() {
        setShowPrompt({
            show: true,
            type: PromptEnum.FileNew,
            overlay: true,
            data: {dir: getRouterAfter('file', getRouterPath())}
        });
    }

    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i] = encodeURIComponent(getFileNameByLocation(file.name))
        }
        const url = fileHttp.getDownloadUrl(files);
        window.open(url);
    }

    function updateFile() {
        setShowPrompt({show: true, type: PromptEnum.FileRename, overlay: true, data: {}});
    }

    function compress() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i] = getFileNameByLocation(file.name)
        }
        if (!files || files.length === 0) {
            NotyFail("没有选中");
            return;
        }
        setShowPrompt({show: true, type: PromptEnum.Compress, overlay: true, data: {files}});
    }


    // 多root目录切换
    const baseSwitch = async (v) => {
        setFile_root_path(v);
        await fileHttp.post("base_switch", {root_index: v})
        await initUserInfo();
        navigate("/file/");
        setSelectList([])
        setClickList([])
    }
    async function switchGridView() {
        // setFileType(getNextByLoop(fileTypes, fileType));
        const type = getNextByLoop(fileTypes, user_base_info?.user_data?.file_list_show_type ?? '');
        await userHttp.post(Http_controller_router.user_save_user_file_list_show_type, {type});
        initUserInfo();
    }

    const uploadFile = () => {
        setShowPrompt({
            show: true, type: PromptEnum.UploadFile, overlay: true, data: {
                call: (event) => {

                    let files = (event.currentTarget as HTMLInputElement)?.files;
                    if (!files) return;

                    let folder_upload = !!files[0].webkitRelativePath;

                    const uploadFiles: any = [];
                    const dirs = new Set(); // 文件夹需要提前创建
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const fullPath = folder_upload ? file.webkitRelativePath : `${file.webkitRelativePath}${file.name}`;
                        file['fullPath'] = fullPath;
                        if (folder_upload) {
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
                    if (folder_upload) {
                        // @ts-ignore
                        for (const file of dirs) {
                            list.push({
                                isDir: true,
                                fullPath: file,
                                name: file
                            })
                        }
                    }
                    list.push(...uploadFiles);
                    setUploadFiles(list);
                    setShowPrompt({show: true, type: PromptEnum.FilesUpload, overlay: false, data: {}});
                }
            }
        });
    }

    const update_dir_info = (show_info) => {
        set_prompt_card({
            open: true, title: t("信息"), context_div: (
                <div style={{maxWidth: "25rem"}}>
                    <TextLine left={t("挂载位置磁盘")} right={show_info?.total_size}/>
                    <TextLine left={`${t("磁盘剩余")}`} right={show_info?.left_size}/>
                    <TextLine left={`${t("文件系统")}`} right={show_info?.fs_type}/>
                    <TextLine left={`${t("文件夹数")}`} right={folder_num}/>
                    <TextLine left={`${t("文件数")}`} right={file_num}/>
                    <TextLine left={`${t("当前位置")}`} right={<TextTip context={show_info?.now_absolute_path}/>}/>
                </div>
            ),
            cancel:()=>{
                ws.removeMsg(CmdType.file_info);
            }
        })
    }
    // 文件夹信息
    const folder_info = async () => {
        let show_info;
        if (!dir_info.now_absolute_path) {
            ws.addMsg(CmdType.file_info, (wsData: WsData<SysPojo>) => {
                const pojo = wsData.context;
                if (show_info) {
                    dir_info = {...dir_info, ...pojo};
                    // 排除第一次
                    ws.removeMsg(CmdType.file_info);
                    update_dir_info(dir_info);
                }
            })
            const result = await ws.sendData(CmdType.file_info, {
                type: FileTypeEnum.folder,
                path: getRouterAfter('file', getRouterPath())
            });
            show_info = result.context;
            dir_info = show_info;
            update_dir_info(dir_info);
        }
        update_dir_info(dir_info);
    }
    const file_share = ()=>{
        navigate(`/${routerConfig.share_list_setting_page}`);
    }
    return  <React.Fragment>
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
        {workflow_show_click && <ActionButton icon={"api"} title={"workflow"} onClick={() => {
            set_workflow_show(!workflow_show)
        }}/>}
        <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
        {check_user_auth(UserAuth.share_file) && <ActionButton icon={"share"} title={"文件分享"} onClick={file_share}/>}
        <ActionButton icon={"grid_view"} title={t("切换样式")} onClick={switchGridView}/>
        <ActionButton icon={"create_new_folder"} title={t("创建文件夹")} onClick={dirnew}/>
        <ActionButton icon={"note_add"} title={t("创建文本文件")} onClick={filenew}/>
        <ActionButton icon="upload_file" title={t("上传")} onClick={uploadFile}/>
        <ActionButton icon={"info"} title={t("信息")} onClick={folder_info}/>
        <ActionButton icon={"more_vert"} title={t("切换目录")} onClick={(event) => {
            const pojo = new FileMenuData();
            pojo.x = event.clientX;
            pojo.y = event.clientY;
            pojo.type = FileTypeEnum.directory;
            pojo.items = file_paths;
            pojo.item_pre_value = file_root_path
            pojo.textClick = async (v) => {
                baseSwitch(v);
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
            }
            setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
        }}/>
    </React.Fragment>
}