import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ActionButton} from "../../../meta/component/Button";
import {PromptEnum} from "../prompts/Prompt";
import {FileMenuData} from "../../../../common/FileMenuType";
import {FileTypeEnum} from "../../../../common/file.pojo";
import {useTranslation} from "react-i18next";
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {use_auth_check, user_click_file} from "../../util/store.util";
import {GlobalContext} from "../../GlobalProvider";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {NotyFail, NotySuccess, NotyWaring} from "../../util/noty";
import {create_quick_cmd_items, getFileNameByLocation, getFilesByIndexs, unsing_switch_grid_view} from "./FileUtil";
import {fileHttp, gitHttp, userHttp} from "../../util/config";
import {getNextByLoop} from "../../../../common/ListUtil";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {
    DirListShowTypeEmum,
    FileListPaginationModeEmum,
    FileListShowTypeEnum,
    fileTypes, user_file_time_show_type,
    UserAuth
} from "../../../../common/req/user.req";
import {removeLastDir} from "../../../project/util/ListUitl";
import {TextLine} from "../../../meta/component/Dashboard";
import {TextTip} from "../../../meta/component/Card";
import {routerConfig} from "../../../../common/RouterConfig";

let dir_info = {} as any;

export function FileMenu() {
    const {t} = useTranslation();
    let location = useLocation();

    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();

    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);
    // const [fileType, setFileType] = useAtom($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useAtom($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useAtom($stroe.selectedFileList);
    const [copyedFileList, setCopyedFileList] = useAtom($stroe.copyedFileList);
    const [cutedFileList, setCutedFileList] = useAtom($stroe.cutedFileList);
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [clickList, setClickList] = useAtom($stroe.clickFileList);
    const [shellShow, setShellShow] = useAtom($stroe.fileShellShow);
    // const [windows_width, set_windows_width] = useAtom($stroe.windows_width);

    const [file_paths, setFile_paths] = useAtom($stroe.file_root_list);
    const [file_root_path, setFile_root_path] = useAtom($stroe.file_root_index);
    const [itemWidth, setItemWidth] = useState(undefined);
    const [search, setSearch] = useState("");
    const [workflow_show, set_workflow_show] = useAtom($stroe.workflow_show);
    const [workflow_realtime_show, set_workflow_realtime_show] = useAtom($stroe.workflow_realtime_show);
    const [workflow_show_click, set_workflow_show_click] = useAtom($stroe.work_flow_show);

    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    const {click_file} = user_click_file();
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
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
    useEffect(() => {
        return ()=>{
            setShellShow({
                show: false,
                path: ''
            })
        }
    }, []);

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
        NotySuccess(txt)
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
    const  switchGridView = unsing_switch_grid_view()

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
        {check_user_auth(UserAuth.share_file) && <ActionButton icon={"share"} title={t("文件分享")} onClick={file_share}/>}
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
            pojo.textClick = async (v:number) => {
                if(v===-1) {
                    // 添加
                    navigate(`/${routerConfig.setting_private_env_setting}`);
                    setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                    NotyWaring(t('请配置 文件夹路径'))
                    return;
                }
                baseSwitch(v);
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
            }
            setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
        }}/>
    </React.Fragment>
}



export function use_handleContextMenu() {
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();
    const [router_jump, set_router_jump] = useAtom($stroe.router_jump);
    const navigate = useNavigate();
    const {initUserInfo} = useContext(GlobalContext);

    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [shellShow, setShellShow] = useAtom($stroe.fileShellShow);
    const [blankSearchMode, setBlankSearchMode] = useAtom($stroe.blank_search_mode);

    return (event) =>{
        event.preventDefault();
        event.stopPropagation(); // 阻止事件冒泡 阻止向父标签传递事件
        const pojo = new FileMenuData();
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = FileTypeEnum.directory;
        const time_sort = [
            {
                r: (<span
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.time_minx_max ? "green" : undefined}}>{t("时间逆序")}</span>),
                v: DirListShowTypeEmum.time_minx_max
            },
            {
                r: (<span
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.time_max_min ? "green" : undefined}}>{t("时间顺序")}</span>),
                v: DirListShowTypeEmum.time_max_min
            }
        ]
        const size_sort = [
            {
                r: (<span
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_min_max ? "green" : undefined}}>{t("大小顺序")}</span>),
                v: DirListShowTypeEmum.size_min_max
            },
            {
                r: (<span
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_max_min ? "green" : undefined}}>{t("大小逆序")}</span>),
                v: DirListShowTypeEmum.size_max_min
            }
        ]
        const pagination_mode = [
            {
                r: (<span
                    style={{color: (!user_base_info.user_data.file_list_pagination_mode || user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.all) ? "green" : undefined}}>{t("全部加载文件")}</span>),
                v: FileListPaginationModeEmum.all
            },
            {
                r: (<span
                    style={{color: user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination ? "green" : undefined}}>{t("分页滚动加载文件")}</span>),
                v: FileListPaginationModeEmum.pagination
            }
        ];
        const time_show_mode = [
            {
                r: (<span
                    style={{color: (!user_base_info.user_data.file_time_show_type || user_base_info.user_data.file_time_show_type === user_file_time_show_type.current) ? "green" : undefined}}>{t("最近时间")}</span>),
                v: user_file_time_show_type.current
            },
            {
                r: (<span
                    style={{color: user_base_info.user_data.file_time_show_type === user_file_time_show_type.time ? "green" : undefined}}>{t("准确时间")}</span>),
                v: user_file_time_show_type.time
            }
        ];
        const common_handle_item = {
            r: t("文件列表展示"),
            items:[
                {
                    r: t("文件排序"),
                    v: "",
                    items: [
                        {
                            r: (<span
                                style={{color: !user_base_info.user_data.dir_show_type ? "green" : undefined}}>{t("系统默认")}</span>),
                            v: DirListShowTypeEmum.defualt
                        },
                        {
                            r: (<span
                                style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.name ? "green" : undefined}}>{t("名字")}</span>),
                            v: DirListShowTypeEmum.name
                        },
                        {
                            r: (<span
                                style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.time_minx_max || user_base_info.user_data.dir_show_type === DirListShowTypeEmum.time_max_min ? "green" : undefined}}
                            >{t("修改时间")}</span>), v: false, items: time_sort
                        },
                        {
                            r: (<span
                                style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_min_max || user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_max_min ? "green" : undefined}}
                            >{t("文件大小")}</span>), v: false, items: size_sort
                        },
                    ]
                },
                {
                    r: t("文件加载方式"),
                    v: "",
                    items: pagination_mode
                },
                {
                    r: t("时间展示"),
                    v: "",
                    items: time_show_mode
                },
                {
                    r: t("缩放调整"),
                    v: "zoom_adjust"
                },
                {
                    r: (<span
                        style={{color: blankSearchMode ? "green" : undefined}}>{t("以空白搜索模式打开目录")}</span>),
                    v: "blank_search_mode"
                },
            ]
        }
        const list: any[] = [
            common_handle_item,
            {r: t("以配置表方式打开目录"), v: "gcfg_dir_config"},
            {r: t("查看Git提交"), v: "git_page"}
        ];
        if (check_user_auth(UserAuth.code_resource)) {
            list.push({r: t("添加http资源根目录"), v: "code_resource"})
        }
        if (check_user_auth(UserAuth.http_proxy)) {
            list.push({r: t("在此目录下载http资源"), v: "http_resource"})
        }
        if (user_base_info?.user_data?.quick_cmd) {
            // const cmd = {
            //     r: t("快捷命令"),
            //     v: "",
            //     items:[]
            // }
            create_quick_cmd_items([...user_base_info.user_data.quick_cmd], list);
            // list.push(cmd);
        }
        pojo.items = list;
        pojo.textClick = async (v) => {
            console.log(v)
            if (v === false) return;
            const user_save_user_file_list_show_type_pojo:any = {}
            if (v === "gcfg_dir_config") {
                // 以配置表方式打开当前目录
                const dirPath = getRouterAfter('file', getRouterPath());
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                navigate(`/${routerConfig.gcfg_page}/${encodeURIComponent(dirPath)}`);
                return;
            } else if (v === "git_page") {
                // 打开Git管理页面
                const dirPath = getRouterAfter('file', getRouterPath());
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                navigate(`/${routerConfig.git_page}/${encodeURIComponent(dirPath)}`);
                return;
            } else if (v === "code_resource") {
                const result = await ws.sendData(CmdType.file_info, {
                    // type: "",
                    path: getRouterAfter('file', getRouterPath())
                });
                set_router_jump({page_self_router_api_data: [`/api/${Date.now()}`, result.context.now_absolute_path]});
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                navigate("/setting/customer_router/");
                return;
            } else if (v === "http_resource") {
                const result = await ws.sendData(CmdType.file_info, {
                    // type: "",
                    path: getRouterAfter('file', getRouterPath())
                });
                set_router_jump({http_download_map_path: result.context.now_absolute_path});
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                navigate("/proxy/http/");
                return;
            } else if (v === "zoom_adjust") {
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                setTimeout(() => {
                    setShowPrompt({show: true, type: PromptEnum.ZoomAdjust, overlay: false, data: {}});
                }, 0);
                return;
            } else if (typeof v === "object" && v.tag === "quick_cmd") {
                let cmd = v.cmd;
                if (cmd) {
                    if (!cmd.endsWith("\r")) {
                        cmd += "\r";
                        setShellShow({
                            show: true,
                            path: getRouterAfter('file', getRouterPath()),
                            cmd: cmd
                        })
                    }
                }

            } else if(v === "blank_search_mode") {
                setBlankSearchMode(!blankSearchMode);
                setShowPrompt({data: undefined, overlay: false, type: "", show: false});
                return;
            } else if(v=== FileListPaginationModeEmum.all || v===FileListPaginationModeEmum.pagination) {
                user_save_user_file_list_show_type_pojo['is_pagination_mode'] = true
            } else if(v === user_file_time_show_type.current || v === user_file_time_show_type.time) {
                user_save_user_file_list_show_type_pojo['is_file_show_type'] = true
            } else if(v === DirListShowTypeEmum.defualt ||
                v === DirListShowTypeEmum.name ||
                v === DirListShowTypeEmum.size_max_min ||
                v === DirListShowTypeEmum.size_min_max ||
                v === DirListShowTypeEmum.time_max_min ||
                v === DirListShowTypeEmum.time_minx_max) {
                user_save_user_file_list_show_type_pojo['is_dir_list_type'] = true
            } else
            {
                return
            }
            await userHttp.post(Http_controller_router.user_save_private_attr, {
                type: v,
                ...user_save_user_file_list_show_type_pojo
            });
            await initUserInfo();
            setShowPrompt({data: undefined, overlay: false, type: "", show: false});
            navigate(getRouterPath());
        }
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    }
}