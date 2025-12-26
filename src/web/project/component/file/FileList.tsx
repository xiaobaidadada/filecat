import React, {useContext, useEffect, useRef, useState} from 'react';
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp, userHttp} from "../../util/config";
import {useLocation, useNavigate} from "react-router-dom";
import Header from "../../../meta/component/Header";
import {PromptEnum} from "../prompts/Prompt";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {create_quick_cmd_items, file_sort, getFileNameByLocation, getFilesByIndexs} from "./FileUtil";
import {InputTextIcon} from "../../../meta/component/Input";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import {use_auth_check, use_file_to_running, user_click_file} from "../../util/store.util";
import {formatFileSize} from '../../../../common/ValueUtil';
import {getShortTime} from "../../../project/util/comm_util";
import {workflow_dir_name, WorkFlowRealTimeReq, WorkFlowRealTimeRsq} from "../../../../common/req/file.req";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {DirListShowTypeEmum, FileListShowTypeEmum, UserAuth} from "../../../../common/req/user.req";
import {isAbsolutePath, path_join} from '../../../../common/path_util';
import {FileMenuData} from "../../../../common/FileMenuType";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {FileListLoad_file_folder_for_local} from "./FileListLoad";
import {FileMenu} from "./FileMenu";

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
        // 文件列表初始化界面
        if (path) {
            path = encodeURIComponent(path) + "?is_sys_path=1"
        } else {
            path = encodeURIComponent(getRouterAfter('file', getRouterPath()))
        }
        const rsp = await fileHttp.get(path); // 方式错误路径 因为没有使用  # 路由 这里加上去 location.hash
        if (rsp.code === RCode.PreFile) {
            click_file({name: rsp.message, context: rsp.data, opt_shell: true}); // 对于非文本类型的暂时不能用这种长路径url直接打开
            return;
        }
        if (rsp.code !== RCode.Sucess) {
            if (rsp.message) {
                NotyFail(rsp.message);
            }
            return;
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
        if (data.relative_user_path !== undefined) {
            if (data.relative_user_path.startsWith("\\") || data.relative_user_path.startsWith("/")) {
                data.relative_user_path = data.relative_user_path.slice(1);
            }
            navigate(data.relative_user_path);
            return;
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

    // 在组件挂载后执行的逻辑
    useEffect(() => {
        const fetchData = async () => {
            await fileHandler();
        };
        fetchData();
        // @ts-ignore
        setEditorSetting({open: false});
        setFilePreview({open: false});
        set_workflow_show_click(false);

    }, [location]);
    useEffect(() => {
        return async () => {
            set_to_running_files_set(new Set())
        }
    }, []);


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

            }
            await userHttp.post(Http_controller_router.user_save_user_file_list_show_type, {
                type: v,
                is_dir_list_type: true
            });
            await initUserInfo();
            setShowPrompt({data: undefined, overlay: false, type: "", show: false});
            navigate(getRouterPath());
        }
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };
    return (
        <div className={"not-select-div"}>
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")}
                                                  icon={"search"} value={""}
                                                  handleInputChange={(v) => {
                                                      setSearch(v)
                                                  }} max_width={"25em"}/>}>
                <FileMenu/>
            </Header>
            <RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}
                              input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            <FileListLoad_file_folder_for_local handleContextMenu={handleContextMenu} file_list={nowFileList.files}
                                                folder_list={nowFileList.folders} clickBlank={clickBlank}/>
            <FileShell/>
            {workflow_show && <WorkFlow/>}
            {workflow_realtime_show.open && <WorkFlowRealTime/>}
        </div>
    )
}
