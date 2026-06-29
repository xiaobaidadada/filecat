// import {atom, RecoilState, useAtom} from 'recoil';
import { atom } from 'jotai';
import {FileTypeEnum, GetFilePojo} from "../../../common/file.pojo";
import {DirListShowTypeEmum, UserBaseInfo, UserData} from "../../../common/req/user.req";
import {FileMenuData} from "../../../common/FileMenuType";
import {DiskDevicePojo} from "../../../common/req/sys.pojo";
import {http_download_map} from "../../../common/req/net.pojo";
import {PromptEnum} from "../component/prompts/Prompt";
import {atomWithStorage} from "jotai/utils";

// const localStorageEffect = key => ({setSelf, onSet}) => {
//     const savedValue = localStorage.getItem(key);
//     if (savedValue != null) {
//         setSelf(JSON.parse(savedValue));
//     }
//
//     onSet(newValue => {
//         localStorage.setItem(key, JSON.stringify(newValue));
//     });
// };

const getInitialValue = (key: string, defaultValue: any) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
};

function sync_atomWithStorage<Value>(key:string,default_value:Value){
    return atomWithStorage<Value>(key,getInitialValue(key,default_value));
}

const default_v:any = null

export class ShowPromptData {
    show: boolean;
    type: PromptEnum|string;
    overlay: boolean;
    data: FileMenuData;
}

export class SqliteQueryContext {
    open: boolean = false;
    path: string = "";
    name: string = "";
}

export const $stroe = {
    // 当前的所有文件
    nowFileList: atom<GetFilePojo>({
        folders: [{name: "文件夹1"}, {name: "文件夹2"}],
        files: [{name: "文件1", type: FileTypeEnum.text}, {name: "文件2", type: FileTypeEnum.text}]
    }),
    // 当前因为各种原因正在运行的文件
    to_running_files: atom<Set<string>>(new Set<string>()),
    // 按下的键盘按键
    enterKey: atom<string>(""),
    // 选中的文件 下标
    selectedFileList: atom<number[]>([]),
    // 选中要被复制的文件名列表 不是下标
    copyedFileList: atom<string[]>([]),
    // 剪切
    cutedFileList: atom<string[]>([]),
    // 临时作为单击和双击判断条件 下标
    clickFileList: atom<number[]>([]),
    // 目前只用于 shell远程文件操作，控制当前目录的进退
    shellNowDir: atom<string[]>([]),

    // 上传队列中的文件
    uploadFiles: atom<any[]>([]),
    // 一次上传一个文件，当前文件的上传进度
    nowProgress: atom<{name: string, value: number, index: number}>({
        name: '',
        value: 1,
        index: 0
    }),
    // 通用 prompt 是否显示
    showPrompt: atom<ShowPromptData|undefined>(new ShowPromptData()),
    // 通用确认
    confirm: atom<{open: boolean, handle: (() => void) | null, title?: string, sub_title?: string, context_div?: any}>({
        open: false,
        handle: null
    }),
    // 通用卡片
    prompt_card: atom<{open: boolean, context_div?: any, title?: string, cancel?: () => any, confirm?: () => any}>({
        open: false
    }),
    // 编辑器设置
    editorSetting: atom<{menu_list?: any[], model?: string, open?: boolean, fileName?: string, save?: any, opt_shell?: boolean, can_format?: boolean, close?: () => any}>({
        model: 'text',
        open: false,
        fileName: '',
        save: null,
        can_format: false
    }),
    windows_width: atom<{width: number, is_mobile: boolean}>({
        width: typeof window !== 'undefined' ? window.innerWidth : 1200,
        is_mobile: typeof window !== 'undefined' ? window.innerWidth <= 736 : false,
    }),
    // shell是否开启 并传递初始目录
    fileShellShow: atom<{show: boolean, path: string, cmd?: string}>({
        show: false,
        path: '',
        cmd: ""
    }),
    // 只是隐藏不消失
    file_shell_hidden: atom<any | undefined>(default_v),
    // 远程shell是否开启
    remoteShellShow: atom<{show: boolean, path: string}>({
        show: false,
        path: ''
    }),
    // docker 的shell是否开启
    dockerShellShow: atom<{type: string, show: boolean, dockerId: string}>({
        type: "",
        show: false,
        dockerId: ""
    }),
    // systemd 的shell是否开启
    systemd_shell_show: atom<{show: boolean, unit_name: string}>({
        show: false,
        unit_name: ""
    }),
    // 日志 文件
    log_viewer: atom<{show: boolean, fileName?: string, encoding?: string}>({
        show: false
    }),
    // ssh工具连接信息
    sshInfo: sync_atomWithStorage("linux_key", {} as any),
    // 文件根路径主
    file_root_index: sync_atomWithStorage<number | null>("file_root_index", default_v),
    // root根路径
    file_root_list: sync_atomWithStorage<any[]>("file_root_list", []),
    // 用户基本信息
    user_base_info: sync_atomWithStorage<UserBaseInfo|any>("user_base_info", {
        user_data: new UserData(),
        sysSoftWare: {}
    }),
    // 自定义选项
    custom_fun_opt: sync_atomWithStorage<any>("custom_fun_opt", default_v),
    // 头部菜单状态
    header_min: atom<boolean>(false),
    // 文件预览
    file_preview: atom<{open: boolean, type?: FileTypeEnum, name?: string, url?: string, context?: string, close?: () => any}>({
        open: false
    }),
    // 分享页文件时间排序方式
    share_sort_type: atom<any>(DirListShowTypeEmum.time_max_min),
    // md预览
    markdown: atom<{filename?: string, context?: string, close?: () => any}>({}),
    // sqlite 查询页上下文
    sqlite_query_context: sync_atomWithStorage<any>("sqlite_query_context", new SqliteQueryContext()),
    // 编辑器
    studio: atom<{folder_path?: string, name?: string}>({}),
    // 图片编辑器
    image_editor: atom<{path?: string, name?: string}>({}),
    // excalidraw编辑器
    excalidraw_editor: atom<{url?: string, name?: string, close?: () => any}>({}),
    // 磁盘
    disk: atom<{type?: string, data?: DiskDevicePojo}>({
        type: ""
    }),
    // 导航列表当前插入元素
    nav_index_add_item_by_now_list: atom<any>(default_v),
    // workflow
    workflow_show: atom<boolean>(false),
    workflow_realtime_show: atom<{open: boolean, filename?: string}>({open: false}),
    // nav 效果
    nav_style: sync_atomWithStorage<{mobile_open?: boolean, pc_collapsed?: boolean}>("nav_style", {
        mobile_open: false,
        pc_collapsed: false,
    }),
    // router jump 跳转资源
    router_jump: atom<{page_self_router_api_data?: any, http_download_map_path?: string}>({}),
    // 文件夹信息
    folder_info_list_data: atom<number[]>([0, 0]),
    // 用于分页的信息
    file_page: atom<{page_size: number, page_num: number}>({
        page_size: 200,
        page_num: 1
    }),
    // workflow展示
    work_flow_show: atom<boolean>(false),
    // 文件单元的长度
    file_item_width_atom: atom<number>(0),
    // 文件列表缩放
    zoom_style_by_percent: atom<number>(100),
    // ai 会话列表
    ai_session_collapsed: sync_atomWithStorage<boolean>("ai_session_collapsed", false),
    // 空白搜索模式
    blank_search_mode: sync_atomWithStorage<boolean>("blank_search_mode", false),
    blank_search_mode_for_temp: atom<boolean>(false),
    // AI 聊天请求类型选择
    ai_request_type: sync_atomWithStorage<string>("ai_request_type", 'completions'),
};
