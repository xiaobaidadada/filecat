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
import {create_quick_cmd_items, file_sort} from "./FileUtil";
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
import {DirListShowTypeEmum, FileListPaginationModeEmum, UserAuth} from "../../../../common/req/user.req";
import {isAbsolutePath, path_join} from '../../../../common/path_util';
import {FileMenuData} from "../../../../common/FileMenuType";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {FileListLoad_file_folder_for_local, FileListLoad_file_folder_for_local_by_ws_page} from "./FileListLoad";
import {FileMenu} from "./FileMenu";
import {get_user_now_pwd} from "../../../../common/DataUtil";
import {cloneDeep} from "lodash";

const WorkFlow = React.lazy(() => import("./component/workflow/WorkFlow"));
const WorkFlowRealTime = React.lazy(() => import("./component/workflow/WorkFlowRealTime"));
const FileShell = React.lazy(() => import("../shell/FileShell"));


let pre_search: GetFilePojo;

export default function FileList() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview);

    const {t} = useTranslation();

    let location = useLocation();
    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const [search, setSearch] = useState("");
    const [workflow_show, set_workflow_show] = useRecoilState($stroe.workflow_show);
    const [workflow_realtime_show, set_workflow_realtime_show] = useRecoilState($stroe.workflow_realtime_show);
    const [workflow_show_click, set_workflow_show_click] = useState(false);

    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {click_file} = user_click_file();
    const [to_running_files_set, set_to_running_files_set] = useRecoilState($stroe.to_running_files);
    const [router_jump, set_router_jump] = useRecoilState($stroe.router_jump);

    const [file_page, set_file_page] = useRecoilState($stroe.file_page);

    const workflow_watcher = async () => {
        const p = new WorkFlowRealTimeReq();
        p.dir_path = `${getRouterAfter('file', getRouterPath())}`
        ws.addMsg(CmdType.workflow_realtime, (data) => {
            // console.log(data.context)
            const pojo = data.context as WorkFlowRealTimeRsq;
            if (!data.context) return;
            for (const it of pojo.sucess_file_list) {
                if (it.endsWith('.workflow.yml')) {
                    NotySucess(`${it.slice(0, -13)} done!`);
                } else if (it.endsWith('.act')) {
                    NotySucess(`${it.slice(0, -4)} done!`);
                }
            }
            for (const it of pojo.failed_file_list) {
                if (it.endsWith('.workflow.yml')) {
                    NotyFail(`${it.slice(0, -13)} failed!`);
                } else if (it.endsWith('.act')) {
                    NotyFail(`${it.slice(0, -4)} failed!`);
                }
            }
            set_to_running_files_set(new Set(pojo.running_file_list));
        })
        await ws.sendData(CmdType.workflow_realtime, p);
    }
    const fileHandler = async (path?: string) => {
        if (path) {
            // 有绝对目录的把前面替换掉
            path = path.replace(get_user_now_pwd(user_base_info.user_data),"")
            path = encodeURIComponent(path)
        } else {
            path = encodeURIComponent(getRouterAfter('file', getRouterPath()))
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
        // 排序一下
        const data: GetFilePojo = rsp.data;
        file_sort(data, user_base_info.user_data.dir_show_type)

        let have_workflow_water = false;
        for (const item of data.files ?? []) {
            item.show_mtime = item.mtime ? getShortTime(item.mtime) : "";
            item.origin_size = item.size;
            item.size = formatFileSize(item.size);
            if (!have_workflow_water && (item.name.endsWith('.workflow.yml') || item.name.endsWith('.act'))) {
                have_workflow_water = true;
                Promise.resolve().then(() => {
                    workflow_watcher();
                })
            }
        }
        have_workflow_water = false;
        for (const folder of data.folders ?? []) {
            folder.show_mtime = folder.mtime ? getShortTime(folder.mtime) : "";
            if (!have_workflow_water && folder.name === workflow_dir_name) {
                // 如果有workflow
                set_workflow_show_click(true)
                have_workflow_water = true;
            }
        }
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
    const searchHanle = () => {
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
        }
    }

    const routeBreadcrumbsEnter = (path) => {
        if (isAbsolutePath(path)) {
            fileHandler(path);
        } else {
            navigate(path_join(getRouterPath(), path))
        }
        setSelectList([])
        setClickList([])
        setNowFileList({files: [], folders: []});
    }
    const handleContextMenu = (event) => {
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
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_min_max ? "green" : undefined}}>{t("大小逆序")}</span>),
                v: DirListShowTypeEmum.size_min_max
            },
            {
                r: (<span
                    style={{color: user_base_info.user_data.dir_show_type === DirListShowTypeEmum.size_max_min ? "green" : undefined}}>{t("大小顺序")}</span>),
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
        
        const list: any[] = [
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
            if (v === false) return;
            const user_save_user_file_list_show_type_pojo:any = {}
            if (v === "code_resource") {
                const result = await ws.sendData(CmdType.file_info, {
                    // type: "",
                    path: getRouterAfter('file', getRouterPath())
                });
                set_router_jump({page_self_router_api_data: ["", result.context.now_absolute_path]});
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

            } else if(v=== FileListPaginationModeEmum.all || v===FileListPaginationModeEmum.pagination) {
                user_save_user_file_list_show_type_pojo['is_pagination_mode'] = true
            } else {
                // 默认是设置时间的
                user_save_user_file_list_show_type_pojo['is_dir_list_type'] = true
            }
            await userHttp.post(Http_controller_router.user_save_user_file_list_show_type, {
                type: v,
                ...user_save_user_file_list_show_type_pojo
            });
            await initUserInfo();
            setShowPrompt({data: undefined, overlay: false, type: "", show: false});
            navigate(getRouterPath());
        }
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };
    return (
        <React.Fragment>
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")}
                                                  icon={"search"} value={""}
                                                  handleInputChange={(v) => {
                                                      setSearch(v)
                                                  }} max_width={"25em"}/>}>
                <FileMenu/>
            </Header>
            <RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}
                              input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            {
                user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination ?
                    <FileListLoad_file_folder_for_local_by_ws_page handleContextMenu={handleContextMenu} clickBlank={clickBlank} list={nowFileList.files}/>
                    :
                    <FileListLoad_file_folder_for_local handleContextMenu={handleContextMenu} file_list={nowFileList.files}
                                                        folder_list={nowFileList.folders} clickBlank={clickBlank}/>
            }
            <FileShell/>
            {workflow_show && <WorkFlow/>}
            {workflow_realtime_show.open && <WorkFlowRealTime/>}
        </React.Fragment>
    )
}
