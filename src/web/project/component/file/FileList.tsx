import React, {useContext, useEffect, useState} from 'react';
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp, userHttp} from "../../util/config";
import {useLocation, useNavigate} from "react-router-dom";
import Header from "../../../meta/component/Header";
import {PromptEnum} from "../prompts/Prompt";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {create_quick_cmd_items, file_sort, title_workflow_file_fail, title_workflow_file_success} from "./FileUtil";
import {InputTextIcon} from "../../../meta/component/Input";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import {use_auth_check, user_click_file} from "../../util/store.util";
import {formatFileSize} from '../../../../common/ValueUtil';
import {getShortTime} from "../../../project/util/common_util";
import {workflow_dir_name, WorkFlowRealTimeReq, WorkFlowRealTimeRsq} from "../../../../common/req/file.req";
import {ws} from "../../util/ws";
import {CmdType} from "../../../../common/frame/WsData";
import {
    DirListShowTypeEmum,
    FileListPaginationModeEmum,
    user_file_time_show_type,
    UserAuth
} from "../../../../common/req/user.req";
import {isAbsolutePath, path_join} from '../../../../common/path_util';
import {FileMenuData, getFileFormat} from "../../../../common/FileMenuType";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {FileListLoad_file_folder_for_local, FileListLoad_file_folder_for_local_by_page} from "./FileListLoad";
import {FileMenu, use_handleContextMenu} from "./FileMenu";
import {get_user_now_pwd} from "../../../../common/DataUtil";
import {cloneDeep} from "lodash";
import {formatDate} from "../../../../common/StringUtil";
import {webPathJoin} from "../../../../common/ListUtil";
import {ActionButton} from "../../../meta/component/Button";

const WorkFlow = React.lazy(() => import("./component/workflow/WorkFlow"));
const WorkFlowRealTime = React.lazy(() => import("./component/workflow/WorkFlowRealTime"));


let pre_search: GetFilePojo;

export default function FileList() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview);

    const {t} = useTranslation();

    let location = useLocation();
    const navigate = useNavigate();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const [search, setSearch] = useState("");
    const [workflow_show, set_workflow_show] = useRecoilState($stroe.workflow_show);
    const [workflow_realtime_show, set_workflow_realtime_show] = useRecoilState($stroe.workflow_realtime_show);
    const [workflow_show_click, set_workflow_show_click] = useRecoilState($stroe.work_flow_show);

    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {click_file} = user_click_file();
    const [to_running_files_set, set_to_running_files_set] = useRecoilState($stroe.to_running_files);

    const [file_page, set_file_page] = useRecoilState($stroe.file_page);
    const [blankSearchMode] = useRecoilState($stroe.blank_search_mode);

    const handleContextMenu = use_handleContextMenu()

    const workflow_watcher = async () => {
        const p = new WorkFlowRealTimeReq();
        p.dir_path = `${getRouterAfter('file', getRouterPath())}`
        ws.addMsg(CmdType.workflow_realtime, (data) => {
            // console.log(data.context)
            const pojo = data.context as WorkFlowRealTimeRsq;
            if (!data.context) return;
            for (const it of pojo.sucess_file_list) {
                title_workflow_file_success(it)
            }
            for (const it of pojo.failed_file_list) {
                title_workflow_file_fail(it)
            }
            set_to_running_files_set(new Set(pojo.running_file_list));
        })
        await ws.sendData(CmdType.workflow_realtime, p);
    }
    const file_after  = async (data)=>{
        let have_workflow_water = false;
        for (const item of data.files ?? []) {

            item.origin_size = item.size;
            item.size = formatFileSize(item.size);
            if(user_base_info.user_data.file_time_show_type === user_file_time_show_type.time) {
                item.show_mtime = item.mtime ? formatDate(item.mtime) : "";
            } else {
                item.show_mtime = item.mtime ? getShortTime(item.mtime) : "";
            }
            if (!have_workflow_water && (item.name.endsWith('.workflow.yml') || item.name.endsWith('.act'))) {
                have_workflow_water = true;
                Promise.resolve().then(() => {
                    workflow_watcher();
                })
            }
            if (item.name === workflow_dir_name) {
                have_workflow_water = true;
            }
        }
        for (const folder of data.folders ?? []) {
            if(user_base_info.user_data.file_time_show_type === user_file_time_show_type.time) {
                folder.show_mtime = folder.mtime ? formatDate(folder.mtime) : "";
            } else {
                folder.show_mtime = folder.mtime ? getShortTime(folder.mtime) : "";
            }
            if (folder.name === workflow_dir_name) {
                have_workflow_water = true;
            }
        }
        set_workflow_show_click(have_workflow_water)
    }
    const fileHandler = async () => {
        const path  = getRouterAfter('file', getRouterPath())
        // 空白搜索模式下，进入目录时不请求文件列表，直接显示空白
        if (blankSearchMode) {
            return;
        }
        // 文件列表初始化界面
        let rsp
        if(user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination) {
            if(file_page.page_num<0) return
            // 分页查询
            rsp = await fileHttp.post("file_get_page",{
                param_path: path,
                page_num:file_page.page_num,
                page_size:file_page.page_size,
            });
            const pojo = rsp.data as GetFilePojo
            if(!pojo.files?.length) {
                set_file_page({page_size: file_page.page_size,page_num: -1})
            }
            pojo.files = cloneDeep([...nowFileList.files,...pojo.files]);
        } else {
            rsp = await fileHttp.get(path);
        }
        if(rsp.code !== RCode.Success)return
        // 排序一下
        const data: GetFilePojo = rsp.data;
        file_sort(data, user_base_info.user_data.dir_show_type)
        file_after(rsp.data)
        setNowFileList(rsp.data)
        pre_search = rsp.data;
    }
    const init_page =  () => {
        set_file_page({
            page_num: 1,
            page_size: 200
        })
    }
    useEffect(() => {
        init_page()
        return async () => {
            set_to_running_files_set(new Set())
        }
    }, []);
    const init = () =>{
        fileHandler();
        setEditorSetting({open: false});
        setFilePreview({open: false});
        set_workflow_show_click(false);
    }
    // 在组件挂载后执行的逻辑
    useEffect(() => {
        setNowFileList({
            files:[],
            folders:[]
        })
        init_page()
        init()
    }, [location]);
    useEffect(() => {
        init()
    }, [file_page]);


    function routerClick() {
        setSelectList([])
        setClickList([])
    }

    // 搜索
    const searchHanle = async () => {
        if (blankSearchMode) {
            // 空白搜索模式：调用后端接口进行搜索过滤
            setSelectList([])
            setClickList([])
            if (!search || !search.trim()) {
                setNowFileList({files: [], folders: []});
                return;
            }
            const path = getRouterAfter('file', getRouterPath());
            const rsp = await fileHttp.post("file_get_page", {
                param_path: path,
                page_num: 1,
                page_size: 10000,
                search: search.trim(),
            });
            if (rsp.code !== RCode.Success) return;
            const data: GetFilePojo = rsp.data;
            file_sort(data, user_base_info.user_data.dir_show_type);
            file_after(data);
            setNowFileList(data);
            pre_search = data;
            return;
        }
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
        setNowFileList({files, folders});
    }


    const clickBlank = (event) => {
        if (event.target === event.currentTarget) {
            setSelectList([])
            setClickList([])
        }
    }

    const routeBreadcrumbsEnter = (path) => {
        if (isAbsolutePath(path)) {
            path = path.replace(get_user_now_pwd(user_base_info.user_data),"")
            navigate(path)
        } else {
            navigate(path_join(getRouterPath(), path))
        }
        setSelectList([])
        setClickList([])
        setNowFileList({files: [], folders: []});
    }

    // FileList.tsx
    const handleMobileMenu = () => {
        const selected = selectList[selectList.length - 1]; // 取最后一个选中的

        if (selected !== undefined) {
            // 有选中文件，触发文件右键菜单
            const allFiles = [...(nowFileList.folders ?? []), ...(nowFileList.files ?? [])];
            const item = allFiles[selected];
            if (item) {
                // 找到选中文件对应的 DOM 元素位置
                const els = document.querySelectorAll('.item');
                const el = els[selected];
                const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: 100 };

                const fakeEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    clientX: rect.left + 10,
                    clientY: rect.bottom ?? 100,
                };
                // 复用 FileItem 里的 handleContextMenu 逻辑
                const pojo = new FileMenuData();
                pojo.path = webPathJoin(getRouterPath(), item.name);
                pojo.filename = item.name;
                pojo.x = fakeEvent.clientX;
                pojo.y = fakeEvent.clientY;
                pojo.type = item.type === FileTypeEnum.folder ? FileTypeEnum.folder : getFileFormat(item.name);
                pojo.size = item.origin_size;
                setShowPrompt({ show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo });
            }
        } else {
            // 没有选中文件，触发空白区域右键菜单（复用 handleContextMenu）
            const fakeEvent = {
                preventDefault: () => {},
                stopPropagation: () => {},
                clientX: window.innerWidth / 2,
                clientY: window.innerHeight / 2,
            };
            handleContextMenu(fakeEvent);
        }
    };

    return (
        <React.Fragment>
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")}
                                                  icon={"search"} value={""}
                                                  handleInputChange={(v) => {
                                                      setSearch(v)
                                                  }} max_width={"25em"}/>}>
                <div className="mobile-context-btn">
                    <ActionButton icon={"more_horiz"} title={t("右键")} onClick={handleMobileMenu}/>
                </div>
                <FileMenu/>
            </Header>
            <RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}
                              input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            {
                user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination ?
                    <FileListLoad_file_folder_for_local_by_page handleContextMenu={handleContextMenu} clickBlank={clickBlank} list={nowFileList.files}/>
                    :
                    <FileListLoad_file_folder_for_local handleContextMenu={handleContextMenu} file_list={nowFileList.files}
                                                        folder_list={nowFileList.folders} clickBlank={clickBlank}/>
            }
            {workflow_show && <WorkFlow/>}
            {workflow_realtime_show.open && <WorkFlowRealTime/>}
        </React.Fragment>
    )
}
