import React, {useContext, useEffect, useState} from 'react';
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {fileHttp, userHttp} from "../../util/config";
import {useLocation, useNavigate, useSearchParams} from "react-router-dom";
import {routerConfig} from "../../../../common/RouterConfig";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {PromptEnum} from "../prompts/Prompt";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {
    create_quick_cmd_items,
    file_sort,
    open_mode,
    title_workflow_file_fail,
    title_workflow_file_success,
    use_file_open,
    user_click_file
} from "./FileUtil";
import {InputTextIcon} from "../../../meta/component/Input";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {NotyFail, NotySuccess} from "../../util/noty";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../../GlobalProvider";
import {use_auth_check} from "../../util/store.util";
import {formatFileSize} from '../../../../common/ValueUtil';
import {getShortTime} from "../../util/common_util";
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
import {FileDeepSearch} from "../prompts/FileDeepSearch";
import {FileMenu, use_handleContextMenu} from "./FileMenu";
import {get_user_now_pwd} from "../../../../common/DataUtil";
import {cloneDeep, throttle} from "lodash";
import {formatDate} from "../../../../common/StringUtil";
import {webPathJoin} from "../../../../common/ListUtil";
import {ActionButton} from "../../../meta/component/Button";
import {DRIVER_OPTIONS} from "../setting/mount/mount_common";


const WorkFlow = React.lazy(() => import("./component/workflow/WorkFlow"));
const WorkFlowRealTime = React.lazy(() => import("./component/workflow/WorkFlowRealTime"));
// 通用聊天面板：内嵌模式放到右侧（Header 由面板自己渲染），与 Studio 用法一致
const ChatPanel = React.lazy(() => import("../aichat/page/ChatPanel"));


let pre_search: GetFilePojo;
// 记录分页模式下最近一次加载的目录路径，用于识别目录切换（含浏览器前进/后退、URL 变化等入口）
let pre_file_path = '';

export default function FileList() {
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting);
    const [, set_md_editor] = useAtom($stroe.md_editor);
    const [, set_file_log] = useAtom($stroe.log_viewer);
    const [, set_image_editor] = useAtom($stroe.image_editor);
    const [, set_markdown] = useAtom($stroe.markdown);
    const [, set_excalidraw_editor] = useAtom($stroe.excalidraw_editor);
    const [, set_mind_editor] = useAtom($stroe.mind_editor);
    const [file_preview, setFilePreview] = useAtom($stroe.file_preview);

    const {t} = useTranslation();

    let location = useLocation();
    const navigate = useNavigate();

    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);
    /** 挂载变更信号：变化时重新拉取当前目录列表 */
    const [file_list_refresh] = useAtom($stroe.file_list_refresh);
    /** 网盘挂载总开关：关闭时不请求任何挂载相关信息 */
    const [mount_enabled] = useAtom<boolean | null>($stroe.mount_enabled);
    /** 当前目录所在挂载的提示信息；null 表示不在挂载目录里（放 store 里与 FileMenu 共享） */
    const [mount_info, setMountInfo] = useAtom($stroe.current_mount);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [clickList, setClickList] = useAtom($stroe.clickFileList);
    const [shellShow, setShellShow] = useAtom($stroe.fileShellShow);
    const [search, setSearch] = useState("");
    const [workflow_show, set_workflow_show] = useAtom($stroe.workflow_show);
    const [workflow_realtime_show, set_workflow_realtime_show] = useAtom($stroe.workflow_realtime_show);
    const [workflow_show_click, set_workflow_show_click] = useAtom($stroe.work_flow_show);

    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    // AI 聊天面板按钮的权限判断（与 AI 聊天页同一权限）
    const {check_user_auth} = use_auth_check();
    const {click_file} = user_click_file();
    const [searchParams] = useSearchParams();
    const file_open = use_file_open();
    // 已自动打开过的 url 参数（目录+文件名），避免同一目录重复打开
    const auto_preview_ref = React.useRef<string | null>(null);
    const [to_running_files_set, set_to_running_files_set] = useAtom($stroe.to_running_files);

    const [file_page, set_file_page] = useAtom($stroe.file_page);
    const [blankSearchMode] = useAtom($stroe.blank_search_mode);
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [blank_search_mode_for_temp,set_blank_search_mode_for_temp ] = useAtom($stroe.blank_search_mode_for_temp);

    // ===== 右侧 AI 聊天面板（与 Studio 一致：左边文件目录、右边 AI 聊天）=====
    // 开关按钮在 Header 右侧；面板打开后按「当前所在目录」定位该目录的 AI 会话
    const [chat_open, set_chat_open] = useState(false);
    // 面板宽度（em），默认约占右侧可用空间 1/3；最小 320px、最大 70% 由拖拽逻辑约束
    const [chat_width, set_chat_width] = useState(33);
    const chatDividerRef = React.useRef<HTMLDivElement | null>(null);
    const [chat_drag, set_chat_drag] = useState(false);
    /** 已定位好的会话 id（由 ChatPanel 回调写入，用于 sessionStorage 记录） */
    const [chat_session_id, set_chat_session_id] = useState<string | undefined>(undefined);
    /** 当前目录路径（用于按目录定位/记忆会话） */
    const chat_cwd = getRouterAfter('file', getRouterPath());
    /** 目录 → 会话 id 的映射，存在 sessionStorage，保证同一目录切回来还是同一个会话 */
    const chat_storage_key = "file_list_chat_session";
    /** 读取该目录上次的会话 id（仅作初始提示，最终仍以工作目录匹配结果为准） */
    const read_chat_session = (cwd: string): string | undefined => {
        try {
            const raw = sessionStorage.getItem(chat_storage_key);
            if (!raw) return undefined;
            return JSON.parse(raw)?.[cwd] || undefined;
        } catch {
            return undefined;
        }
    };
    /** 记录该目录当前会话 id */
    const write_chat_session = (cwd: string, sessionId: string) => {
        try {
            const raw = sessionStorage.getItem(chat_storage_key);
            const map = raw ? JSON.parse(raw) : {};
            map[cwd] = sessionId;
            sessionStorage.setItem(chat_storage_key, JSON.stringify(map));
        } catch {
            // sessionStorage 不可用（隐私模式等）时静默忽略，不影响功能
        }
    };

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
    /** 拉取当前目录所在挂载的信息，用于列表顶部提示；未挂载时清空 */
    const mount_info_path_ref = React.useRef<string | null>(null);
    const fetchMountInfo = async (param_path: string) => {
        // 开关未加载或已关闭时，挂载全部按本地处理，无需请求
        if (mount_enabled !== true) {
            setMountInfo(null);
            return;
        }
        // 同一目录并发去重：开关加载完成后 effect 会判断 mount_info 是否为空来补拉，
        // 此时 fileHandler 的请求可能还没回来，用路径标记避免重复请求
        if (mount_info_path_ref.current === param_path) {
            return;
        }
        mount_info_path_ref.current = param_path;
        try {
            const rsp = await fileHttp.post("file/mount_info", {param_path});
            setMountInfo(rsp?.data ?? null);
        } catch (e) {
            setMountInfo(null);
        }
    }

    /** 关闭所有编辑器/预览器：url 切走或后退时，已打开的覆盖层必须收掉，否则会盖住文件列表 */
    const close_all_editors = () => {
        setEditorSetting({open: false});
        setFilePreview({open: false});
        set_md_editor({});
        set_file_log({show: false});
        set_image_editor({});
        set_markdown({});
        set_excalidraw_editor({});
        set_mind_editor({});
    };

    /**
     * 按 url 参数恢复上次打开的文件与打开方式。
     * 返回值表示 url 是否处于「打开文件」状态 —— 是的话调用方不应再请求文件列表。
     */
    const auto_open_preview = () => {
        const name = searchParams.get("preview_file_name");
        const mode = searchParams.get("preview_mode") as open_mode | null;
        if (!name || !mode) return false;
        const path = getRouterAfter('file', getRouterPath());
        // 同一目录下只自动打开一次：双击打开自身会写 url 参数，url 变化又会重新触发，
        // 但文件已经打开了，不能重复打开，也不能因此去请求列表
        if (auto_preview_ref.current === path + name) return true;
        auto_preview_ref.current = path + name;
        const close = () => file_open(null);
        // md 与日志走各自的 atom，其余交给 click_file 按类型分派
        if (mode === "md") {
            set_md_editor({
                url: fileHttp.getDownloadUrl(`${encodeURIComponent(path)}${name}`),
                path: `${path}${name}`,
                name,
                close,
            });
            return true;
        }
        if (mode === "log") {
            set_file_log({
                show: true,
                fileName: name,
                encoding: searchParams.get("preview_log_enc") ?? 'utf8',
                wrap: (searchParams.get("preview_log_wrap") as 'wrap' | 'nowrap') ?? 'wrap',
                close,
            });
            return true;
        }
        if (mode === "image_edit") {
            set_image_editor({
                path: webPathJoin(getRouterPath(), name),
                name,
                close,
            });
            return true;
        }
        // text 需显式指定 model，其余由 click_file 依据文件类型判断
        // （mind 与 excalidraw 都走 click_file 分派到各自的浮层编辑器）
        click_file({
            name, opt_shell: true,
            ...(mode === "text" ? {model: "text"} : {}),
            close,
        });
        return true;
    };

    const fileHandler = async () => {
        const path  = getRouterAfter('file', getRouterPath())
        // 空白搜索模式下，进入目录时不请求文件列表，直接显示空白
        if (blankSearchMode || blank_search_mode_for_temp) {
            return;
        }
        // 同步当前目录的挂载信息（用于列表顶部提示条），未挂载则为 null
        fetchMountInfo(path);
        // 文件列表初始化界面
        let rsp
        if(user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination) {
            // 目录已切换（点击文件夹、面包屑、浏览器前进/后退、URL 变化等任意入口），重置分页从第一页重新加载
            if(pre_file_path !== path) {
                pre_file_path = path
                if(file_page.page_num !== 1) {
                    // 页码不是第一页（含 -1），重置为第一页，触发一次渲染后重新从第一页加载
                    set_file_page({page_size: file_page.page_size, page_num: 1})
                    return
                }
                // 页码已是第一页，继续往下加载第一页
            } else if(file_page.page_num < 0) {
                // 同一目录且已滚动到底，无需再加载
                return
            }
            // 分页查询一页
            rsp = await fileHttp.post("file_get_page",{
                param_path: path,
                page_num:file_page.page_num,
                page_size:file_page.page_size,
            });
            if(rsp.code !== RCode.Success)return
            const pojo = rsp.data as GetFilePojo
            file_after(pojo)
            if(!pojo.files?.length) {
                // 没有更多数据，标记到底，避免继续滚动加载
                set_file_page({page_size: file_page.page_size,page_num: -1})
                return;
            }
            // 使用函数式更新基于最新的列表累积，避免 effect 闭包捕获旧目录文件导致重复显示
            setNowFileList(prev => {
                const files = cloneDeep(
                    file_page.page_num === 1
                        ? pojo.files                       // 进入新目录/第一页：直接替换
                        : [...(prev?.files ?? []), ...pojo.files] // 同目录滚动加载后续页：追加
                );
                const data: GetFilePojo = {...prev, files};
                file_sort(data, user_base_info.user_data.dir_show_type)
                return data;
            });
            pre_search = rsp.data;
            return;
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
    // const init_page =  () => {
    //     set_file_page({
    //         page_num: 1,
    //         page_size: 200
    //     })
    // }
    useEffect(() => {
        // init_page()
        return async () => {
            set_to_running_files_set(new Set())
        }
    }, []);
    const init = () =>{
        set_workflow_show_click(false);
        // url 是「打开文件」的，就只打开文件，不请求文件列表
        if (auto_open_preview()) {
            return;
        }
        close_all_editors();
        fileHandler();
    }
    // 在组件挂载后执行的逻辑
    useEffect(() => {
        // setNowFileList({
        //     files:[],
        //     folders:[]
        // })
        // init_page()
        init()
    }, [location,file_page]);

    // 挂载变更后触发列表重新拉取（挂载/取消挂载后立即生效，不用手动刷新页面）
    useEffect(() => {
        if (file_list_refresh > 0) {
            fileHandler();
        }
    }, [file_list_refresh]);

    // 总开关被切换时同步当前目录的挂载提示（关闭清空，开启重新拉取）
    const mount_toggled_ref = React.useRef(false);
    useEffect(() => {
        if (mount_enabled === null) {
            return;
        }
        // 首次拿到状态：不算切换，但要确保首屏提示拉取到了（fileHandler 可能早于开关加载执行）
        if (!mount_toggled_ref.current) {
            mount_toggled_ref.current = true;
            if (mount_enabled === true && mount_info === null) {
                fetchMountInfo(getRouterAfter('file', getRouterPath()));
            }
            return;
        }
        if (mount_enabled === true) {
            fetchMountInfo(getRouterAfter('file', getRouterPath()));
        } else {
            setMountInfo(null);
        }
    }, [mount_enabled]);
    // useEffect(() => {
    //     init()
    // }, [file_page]);


    function routerClick() {
        setSelectList([])
        setClickList([])
        // 点击面包屑 = 用户主动进入某目录（含当前所在目录）。
        // 分页模式下：
        //  1) 即使当前已滚动到底（page_num 被置为 -1），也应重置回第一页重新加载，
        //     否则点击“当前所在层级”的面包屑时会命中 fileHandler 里 `else if(page_num<0) return`，
        //     导致列表永远不刷新（表现为“点击最后一个没反应”）。
        //  2) 同时把文件列表滚动条拉回顶部，让用户视野回到列表最上方。
        // 滚动容器是分页列表根节点 <div id="listing">（见 FileListLoad_file_folder_for_local_by_page）。
        if (user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination) {
            const listing = document.getElementById("listing");
            if (listing) listing.scrollTop = 0;
            set_file_page({page_size: file_page.page_size, page_num: 1})
        }
    }

    // 打开全局递归搜索弹窗（点搜索框左侧放大镜触发）。
    // 和回车触发的「当前目录搜索」是两个入口：回车只过滤当前目录已加载的列表，
    // 这里会真的到磁盘上递归查找。
    const open_deep_search = () => {
        const base_path = getRouterAfter('file', getRouterPath());
        set_prompt_card({
            open: true,
            title: t("深搜"),
            context_div: <FileDeepSearch base_path={base_path}/>,
        });
    };

    // 搜索
    const searchHanle = async () => {
        if (blankSearchMode || blank_search_mode_for_temp) {
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
        setSelectList([])
        setClickList([])
        setNowFileList({files: [], folders: []});
        // 不在此手动重置分页：分页由 fileHandler 里的 pre_file_path 目录切换检测统一重置为第一页，
        // 避免 navigate(改 location) 与 set_file_page(改 file_page) 分别触发两次加载请求
        if (isAbsolutePath(path)) {
            path = path.replace(get_user_now_pwd(user_base_info.user_data),"")
            navigate(path)
        } else {
            navigate(path_join(getRouterPath(), path))
        }
    }

    // ===== 右侧 AI 面板拖拽（往左拖变宽，与 Studio 行为一致）=====
    const handleChatDrag = React.useCallback(throttle((event: PointerEvent) => {
        const el = chatDividerRef.current;
        if (!el || !el.parentElement) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        const parentRect = el.parentElement.getBoundingClientRect();
        // 面板宽度 = 容器右边界到鼠标的距离
        const width_px = parentRect.right - event.clientX;
        // 约束：最小 320px，最大不超过容器的 70%
        const clamped = Math.min(Math.max(width_px, 320), parentRect.width * 0.7);
        set_chat_width(parseFloat((clamped / size).toFixed(2)));
    }, 32), []);

    const handleChatPointerUp = () => {
        set_chat_drag(false);
        document.removeEventListener("pointermove", handleChatDrag);
    };

    const handleChatPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        set_chat_drag(true);
        // 用 document 监听：拖动时鼠标可能移出分隔线窄条
        document.addEventListener("pointermove", handleChatDrag);
        document.addEventListener("pointerup", handleChatPointerUp, { once: true });
    };

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

    // 文件列表主体（面包屑 + 挂载提示 + 列表），左右分栏时位于左侧
    const file_main = (
        <div className={"file-list-main"}>
            <RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}
                              input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            {/* 当前目录在挂载下：顶部提示挂载信息（凭据备注 - 驱动/账号 - 挂载备注），方便辨认数据来源 */}
            {mount_info && (
                <div className="mount-tip-bar" style={{borderLeftColor: mount_info.color}}>
                    <span className="material-icons" style={{color: mount_info.color}}>cloud</span>
                    <span>{[mount_info.credential_note, mount_info.account_note || (DRIVER_OPTIONS.find(d => d.value === mount_info.driver)?.title ?? mount_info.driver), mount_info.name].filter(Boolean).join(" - ")}</span>
                    {mount_info.readonly && <span className="mount-readonly-tag">{t("只读")}</span>}
                </div>
            )}
            {
                user_base_info.user_data.file_list_pagination_mode === FileListPaginationModeEmum.pagination ?
                    <FileListLoad_file_folder_for_local_by_page handleContextMenu={handleContextMenu} clickBlank={clickBlank} list={nowFileList.files}/>
                    :
                    <FileListLoad_file_folder_for_local handleContextMenu={handleContextMenu} file_list={nowFileList.files}
                                                        folder_list={nowFileList.folders} clickBlank={clickBlank}/>
            }
        </div>
    );

    return (
        <React.Fragment>
            <HeaderPortal>
                                <InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")}
                                                                  icon={"search"} value={""}
                                                                  mobile_hidden
                                                                  handleIconClick={open_deep_search}
                                                                  handleInputChange={(v) => {
                                                                      setSearch(v)
                                                                  }} max_width={"25em"}/>
            </HeaderPortal>
            <HeaderPortal position={"right"}>
                                {/* AI 聊天面板开关：打开后按「当前目录」定位该目录的 AI 会话。
                                    与 AI 聊天页同一权限（UserAuth.ai_agent_page），无权限则不显示 */}
                                {check_user_auth(UserAuth.ai_agent_page) && (
                                    <ActionButton icon={"smart_toy"} title={t("AI 聊天")} selected={chat_open}
                                                  onClick={() => set_chat_open(v => !v)}/>
                                )}
                                <div className="mobile-context-btn">
                                    <ActionButton icon={"more_horiz"} title={t("右键")} onClick={handleMobileMenu}/>
                                </div>
                                <FileMenu/>
            </HeaderPortal>
            {/* 左右分栏：左侧文件目录 + 右侧 AI 聊天面板（面板关闭时左侧独占） */}
            <div className={"file-list-split" + (chat_open ? " file-list-split--chat" : "")}>
                {file_main}
                {chat_open && (
                    <React.Fragment>
                        <div className={"studio__divider studio__divider--chat"} ref={chatDividerRef}
                             onPointerDown={handleChatPointerDown}/>
                        <div className={"studio-chat-panel"} style={{width: `${chat_width}em`}}>
                            <React.Suspense fallback={null}>
                                <ChatPanel
                                    inline_header={true}
                                    sync_url={false}
                                    file_cwd_path={chat_cwd}
                                    session_id={chat_session_id ?? read_chat_session(chat_cwd)}
                                    on_session_change={(id) => {
                                        set_chat_session_id(id);
                                        write_chat_session(chat_cwd, id);
                                    }}
                                />
                            </React.Suspense>
                        </div>
                    </React.Fragment>
                )}
            </div>
            {chat_drag &&
                <div
                    className="shell__overlay" onPointerUp={handleChatPointerUp}
                />
            }
            {workflow_show && <WorkFlow/>}
            {workflow_realtime_show.open && <WorkFlowRealTime/>}
        </React.Fragment>
    )
}
