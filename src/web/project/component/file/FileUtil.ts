import {getByIndexs, getNextByLoop, sort, webPathJoin} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {DirListShowTypeEmum, fileTypes, UserBaseInfo} from "../../../../common/req/user.req";
import {QuickCmdItem} from "../../../../common/req/setting.req";
import {PromptEnum} from "../prompts/Prompt";
import {$stroe} from "../../util/store";
import {scanFiles} from "../../util/file";
import {useContext, useEffect, useRef, useState} from "react";
import {NotyFail, NotySuccess} from "../../util/noty";
import {debounce, throttle} from "../../../../common/fun.util";
import {copyToClipboard} from "../../util/FunUtil";
import {fileHttp, userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {GlobalContext} from "../../GlobalProvider";
import {useNavigate, useSearchParams} from "react-router-dom";
import {getFileFormat} from "../../../../common/FileMenuType";
import {browser_file_pojo} from "../../../../common/req/common.pojo";
import {useAtom} from "jotai/index";
import {useTranslation} from "react-i18next";
import {MAX_SIZE_TXT} from "../../../../common/ValueUtil";
import {getEditModelType} from "../../../../common/StringUtil";
import {path_join} from "pty-shell/dist/path_util";
import {routerConfig} from "../../../../common/RouterConfig";
import {Http} from "../../util/http";
import {saveTxtReq} from "../../../../common/req/file.req";
import {editor_data} from "../../util/store.util";

export function getFilesByIndexs(nowFileList, selectedFileList: number[]) {
    const list = []
    if(nowFileList.folders) {
        list.push(...nowFileList.folders);
    }
    if(nowFileList.files) {
        list.push(...nowFileList.files);
    }
    return getByIndexs(list, selectedFileList);
}

export function getFileNameByLocation(fileName) {
    return `${getRouterAfter('file', getRouterPath())}${fileName}`;
}

export function file_sort(data: GetFilePojo, type: DirListShowTypeEmum) {
    // 排序一下
    switch (type) {
        case DirListShowTypeEmum.size_max_min:
        case DirListShowTypeEmum.size_min_max:
            // 从大到小排序
        {
            const asc = type === DirListShowTypeEmum.size_min_max;
            sort(data.files, v => v.size, asc);
            sort(data.folders, v => v.size, asc);
        }
            break;
        case DirListShowTypeEmum.time_minx_max:
        case DirListShowTypeEmum.time_max_min: {
            const asc = type === DirListShowTypeEmum.time_minx_max;
            sort(data.files, v => v.mtime, asc);
            sort(data.folders, v => v.mtime, asc);
        }
            break;
        case DirListShowTypeEmum.name:
            sort(data.folders, v => v.name);
            break;
        default:
            break;
    }
}

export function create_quick_cmd_items(quick_cmd: QuickCmdItem[], its: any[]) {
    const index_map = {}
    const left_map = {}
    for (let i = 0; i < quick_cmd.length; i++) {
        const it = quick_cmd[i];
        const ok = {
            r: it.note,
            items: [],
            v: {
                tag: "quick_cmd",
                cmd: it.cmd,
            }
        }
        // 看看是否属于某个子集
        if (it.father_index != null) {
            left_map[it.father_index] = ok
            const v = index_map[it.father_index]
            if (v) {
                v.items.push(ok);
            }
            continue
        }
        its.push(ok);
        if (it.index != null) {
            index_map[it.index] = ok;
            // 有自己的子集
            if (left_map[it.index] != null) {
                ok.items.push(left_map[it.index]);
            }
        }
    }
}

export type file_show_item = {
    name: string
    type?: FileTypeEnum
}

// 获取操作拖动文件上传 的函数方法
export function using_drop_file_upload(inputRef:any,call_fun_type:PromptEnum) {
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [uploadFiles, setUploadFiles] = useAtom($stroe.uploadFiles);
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);

    const drop = async (event) => {
        event.preventDefault();
        event.stopPropagation();
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
        let files:browser_file_pojo[] = await scanFiles(dt,user_base_info?.user_data?.upload_file_ignore_list);
        setUploadFiles(files);
        setShowPrompt({show: true, type: call_fun_type, overlay: false, data: {}});
    }
    const dragover = (event) => {
        event.preventDefault();
    }
    if(inputRef) {
        useEffect(() => {
            const element = inputRef.current;
            const doc = element.ownerDocument;
            doc.addEventListener("dragover", dragover);
            doc.addEventListener("drop", drop);
            return () => {
                doc.removeEventListener("dragover", dragover);
                doc.removeEventListener("drop", drop);
            }
        }, []);
    }

    return {drop, dragover};
}

// 多选文件快捷键
export function using_file_quick_keyboard(file_list, folder_list,inputRef) {
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [enterKey, setEnterKey] = useAtom($stroe.enterKey);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;

        const handleMouseEnter = () => setIsFocused(true);
        const handleMouseLeave = () => setIsFocused(false);

        el.addEventListener("mouseenter", handleMouseEnter);
        el.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            el.removeEventListener("mouseenter", handleMouseEnter);
            el.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!isFocused) {
                return;
            }
            if (!event.ctrlKey) {
                if (event.key === 'Escape') {
                    setSelectList([])
                } else if (event.key === 'Shift') {
                    setEnterKey("shift")
                }
                return;
            }
            if (event.key === 'a' || event.key === 'A') {
                const len = file_list?.length ?? 0;
                const len2 = folder_list?.length ?? 0;
                const list = [];
                for (let i = 0; i < len + len2; i++) {
                    list.push(i);
                }
                setSelectList(list)
            } else {
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
    }, [file_list, folder_list, isFocused]);
}


// 为dvi ref 添加滚动事件 需要在 useEffect 添加（只添加一次，没有删除事件，自己直接把ref删了就行)
export function using_add_div_wheel_event(ref, bottom: () => void,up: () => void) {
    useEffect(()=>{
        let last_position = 0;

        const handleScroll = () => {
            const element = ref.current;
            if (element) {
                if (last_position < element.scrollTop && element.scrollTop + element.clientHeight + 500 >= element.scrollHeight) {
                    // console.log("滚动到达底部");
                    bottom()
                }
                // 检测是否滚动到顶部
                else if (last_position > element.scrollTop && element.scrollTop - 300 <= 0) {
                    // console.log("滚动到达顶部");
                    up()
                }
                last_position = element.scrollTop;
            }
        };
        ref.current.addEventListener("scroll", debounce(handleScroll));

        const handleWheel = (e: WheelEvent) => {
            const element = ref.current;
            if (element) {
                // 阻止默认滚动行为
                // e.preventDefault();
                // 获取一行的高度
                // 你可以根据实际内容设置
                const scrollAmount = 200; // 可以控制滚动速度
                // 根据滚轮滚动的方向来滚动
                if (e.deltaY > 0) {
                    element.scrollTop += scrollAmount; // 向下滚动一行
                } else {
                    element.scrollTop -= scrollAmount; // 向上滚动一行
                }
            }
        };
        // ref.current.addEventListener("wheel", handleWheel, {passive: false});
        return () => {
            ref?.current?.removeEventListener('scroll', handleScroll);
            // ref.current.removeEventListener('wheel', handleWheel);
        };
    },[]) // 只执行一次 组件周期内
}

/**
 * 根据缩放百分比计算列宽和字号
 * @param percent 缩放百分比 (默认传 100，缩小传 60，放大传 130)
 */
export function getZoomStyleByPercent(percent: number) {
    if(percent == null) [
        percent = 100
    ]
    // 1. 安全边界控制，防止比例过小或过大
    // 转化后的 scale 在 100% 时刚好等于 1
    const scale = Math.max(30, Math.min(200, percent)) / 100;

    // 2. 计算列宽：全新基准 280px * 比例系数
    // 当 percent = 100 时，scale = 1，columnWidth = 280
    const columnWidth = 280 * scale;

    // 3. 计算字号：基准 1 * 比例系数
    // 当 percent = 100 时，scale = 1，fontSize = 1
    const fontSize = 1 * scale;

    return {
        columnWidth,
        fontSize: `${fontSize}em` // 或者是 `${fontSize}rem`
    };
}


const columnWidth = 280;

// 让文件页面的文件可以子适应 （控制 width参数)
export function using_file_page_handle_width_auto() {
    const [itemWidth, setItemWidth] = useState($stroe.file_item_width_atom);
    const [nav_style, set_nav_style] = useAtom($stroe.nav_style);
    const [zoomPercent] = useAtom($stroe.zoom_style_by_percent);

    const handleResize = () => {
        const scale = Math.max(30, Math.min(200, zoomPercent??100)) / 100;// 最大缩放 200 最小缩放30
        const scaledColumnWidth = columnWidth * scale;
        let columns = Math.floor(
            document.querySelector("main").offsetWidth / scaledColumnWidth
        );
        if (columns === 0) columns = 1;
        setItemWidth(`calc(${100 / columns}% - 1em)`)
    };

    useEffect(() => {
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        }
    }, [nav_style, zoomPercent]);
    return itemWidth
}

export function title_workflow_file_success(it){
    if (it.endsWith('.workflow.yml')) {
        NotySuccess(`${it.slice(0, -13)} done!`);
    } else if (it.endsWith('.act')) {
        NotySuccess(`${it.slice(0, -4)} done!`);
    }
}

export function title_workflow_file_fail(it){
    if (it.endsWith('.workflow.yml')) {
        NotyFail(`${it.slice(0, -13)} failed!`);
    } else if (it.endsWith('.act')) {
        NotyFail(`${it.slice(0, -4)} failed!`);
    }
}

const copy = throttle((text) => {
    copyToClipboard(text)
    NotySuccess('复制成功');
});

export function using_add_md__copy_button(){
    useEffect(() => {
        // 使用事件委托，避免重复绑定问题
        const handleCopyClick = (event: Event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('copy-btn')) {
                const code = target.getAttribute('data-code');
                if (code) {
                    copy(code);
                }
            }
        };

        // 添加全局事件监听
        document.addEventListener('click', handleCopyClick);

        // 清理事件绑定
        return () => {
            document.removeEventListener('click', handleCopyClick);
        };
    }, []);
}

export function unsing_switch_grid_view (is_local = false) {
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    const {initUserInfo} = useContext(GlobalContext);

    return async () => {
        const type = getNextByLoop(fileTypes, user_base_info?.user_data?.file_list_show_type ?? '');
        if (is_local) {
            setUser_base_info(prev => ({
                ...prev,
                user_data: {
                    ...prev?.user_data,
                    file_list_show_type: type,
                }
            }));
            return;
        }
        await userHttp.post(Http_controller_router.user_save_private_attr, {type});
        initUserInfo();
    }
}

// 更新 url 的参数 配合 const [searchParams] = useSearchParams() 可以及时得到有没有更新
export function useUpdateUrlParams() {
    const [searchParams, setSearchParams] = useSearchParams();

    return (key: string|string[]|Record<string, string|undefined|null>, value?: string|undefined|null) => {
        const newParams = new URLSearchParams(searchParams);
        if (typeof key === "string") {
            if (value === undefined || value === null) {
                newParams.delete(key);
            } else {
                newParams.set(key, value);
            }
        } else if (Array.isArray(key)) {
            // 批量删除
            for (const k of key) {
                newParams.delete(k);
            }
        } else {
            // 批量设置（值为 undefined/null 表示删除）
            for (const [k, v] of Object.entries(key)) {
                if (v === undefined || v === null) {
                    newParams.delete(k);
                } else {
                    newParams.set(k, v);
                }
            }
        }
        setSearchParams(newParams);
    };
}

// 可以直接预览的文件类型，分享与文件页共用
const preview_file_type_list = ["text",
    FileTypeEnum.md,
    FileTypeEnum.excalidraw,
    FileTypeEnum.draw,
    FileTypeEnum.pdf,
    FileTypeEnum.image,
    FileTypeEnum.video
]
// 判断该文件名是否可预览
export function is_preview_file(name: string) {
    return preview_file_type_list.includes(getFileFormat(name) as string);
}

// 按文件类型推断双击时的打开方式，写入 url 与 url 恢复共用同一套映射
export function get_open_mode_by_type(type: FileTypeEnum | undefined): open_mode {
    if (type === FileTypeEnum.md) return "md";
    if (type === FileTypeEnum.excalidraw || type === FileTypeEnum.draw) return "excalidraw";
    if (type === FileTypeEnum.pdf || type === FileTypeEnum.image || type === FileTypeEnum.video) return "preview";
    return "text";
}

// 检测 并执行 能不能预览
export function use_share_preview() {
    const updateParams = useUpdateUrlParams();
    return (name:string)=>{
        if(is_preview_file(name)) {
            updateParams('share_preview_file_name',name)
            return true;
        }
        return false;
    }
}

// 打开文件的方式（写入 url 参数，刷新后据此恢复）
export type open_mode = "text" | "md" | "image_edit" | "log" | "preview" | "excalidraw";

export interface file_open_param {
    name: string;
    mode: open_mode;
    // 日志查看器的编码与换行方式
    log_enc?: string;
    log_wrap?: 'wrap' | 'nowrap';
}

// 更新文件页的打开参数（传 null 清除），使刷新页面能恢复打开的文件与打开方式
export function use_file_open() {
    const updateParams = useUpdateUrlParams();
    return (param: file_open_param | null) => {
        if (!param) {
            updateParams(['preview_file_name', 'preview_mode', 'preview_log_enc', 'preview_log_wrap']);
            return;
        }
        updateParams({
            preview_file_name: param.name,
            preview_mode: param.mode,
            preview_log_enc: param.log_enc,
            preview_log_wrap: param.log_wrap,
        });
    }
}


export function use_click_double(interval: number = 500) {
    const lastClickRef = useRef<{ index: number, time: number } | null>(null);

    // 每次调用记录本次点击；interval 内同一 index 再次点击时执行 onDouble 并返回 true
    const clickDouble = (index: number, onDouble?: () => void): boolean => {
        const now = Date.now();
        const last = lastClickRef.current;

        // 判断双击：同一个 index 且间隔 ≤ interval
        const isDoubleClick = last !== null && last.index === index && now - last.time <= interval;

        // 用 ref 实时写入本次记录，无闭包问题
        lastClickRef.current = { index, time: now };

        if (isDoubleClick) {
            // 双击后清空记录，防止进入新目录后残留误判
            lastClickRef.current = null;
            onDouble?.();
            return true;
        }
        return false;
    };

    return { clickDouble };
}

export function use_click_folder() {
    const navigate = useNavigate();
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [clickList, setClickList] = useAtom($stroe.clickFileList);
    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);

    return (name:string)=>{
        setSelectList([])
        setClickList([])
        setNowFileList({files: [], folders: []});
        navigate(webPathJoin(getRouterPath(), name))
        // 不在此手动重置分页：分页由 FileList 里的 pre_file_path 目录切换检测统一重置为第一页，
        // 避免 navigate(改 location) 与 set_file_page(改 file_page) 分别触发两次加载请求
    }
}

export const user_click_file = () => {
    // 四个预览
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting);
    const [file_preview, setFilePreview] = useAtom($stroe.file_preview)
    // const [markdown, set_markdown] = useAtom($stroe.markdown)
    const [md_editor, set_md_editor] = useAtom($stroe.md_editor);

    const [excalidraw_editor, set_excalidraw_editor] = useAtom($stroe.excalidraw_editor);
    const [sqlite_query_context, set_sqlite_query_context] = useAtom($stroe.sqlite_query_context);

    const [showPrompt, setShowPrompt] = useAtom($stroe.confirm);
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    const navigate = useNavigate();
    const {t} = useTranslation();

    const click_file = async (param: {
        name,
        size?: number,
        ignore_size?: boolean,
        model?: string,
        menu_list?: any[],
        opt_shell?: boolean,
        mtime?: any,
        not_type_tip?: string,
        // 提供自定义的编辑来源 只用于txt文本编辑
        file_path?: string,
        file_url?: string,
        context?: string,
        get_file_fun?: () => Promise<string>,
        save_file_fun?: (text: string) => Promise<void>,
        // 只读打开（如分享模式）：md 编辑器据此隐藏主题切换、不做自动保存
        readonly?: boolean,
        close?: () => any
    }) => {
        const ab_dir_path = UserBaseInfo.get_now_dir(user_base_info)

        if (!param.ignore_size && typeof param.size === "number" && param.size > MAX_SIZE_TXT) {
            setShowPrompt({
                open: true,
                title: "提示",
                sub_title: `文件超过20MB了确定要打开吗?`,
                handle: async () => {
                    setShowPrompt({open: false, handle: null});
                    param.ignore_size = true;
                    click_file(param);
                }
            })
            return;
        }
        const {name, context} = param;
        let model = getEditModelType(name);
        const type = getFileFormat(name);
        const absolute_file_path = param.file_path ?? path_join(ab_dir_path, `${getRouterAfter('file', getRouterPath())}${name}`)
        const file_path_ = param.file_path ?? path_join(ab_dir_path, `${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${name}`)
        const url = param.file_url ?? fileHttp.getDownloadUrl(file_path_);
        if (type === FileTypeEnum.database) {
            set_sqlite_query_context({
                open: true,
                path: absolute_file_path,
                name
            });
            navigate(routerConfig.sqlite_query_page);
            return;
        }
        if (param.model === "text") {
            // 双击文件
            let value;
            if (context) {
                value = context;
            } else if (param.get_file_fun) {
                value = await param.get_file_fun()
            } else {
                value = await Http.get(url);
                // console.log(value)
                // console.log(url)
                // value = await get_file_context(param.sys_path ?? `${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${name}`, !!param.sys_path);
                // if (!value) {
                //     return;
                // }
            }
            // if (!model) {
            //     model = "text";
            // }
            let m = undefined;
            if (type === FileTypeEnum.workflow_act) {
                m = "ace/mode/yaml"
            } else if (type === FileTypeEnum.draw || type === FileTypeEnum.excalidraw) {
                m = "ace/mode/json"
            }
            setEditorSetting({
                menu_list: param.menu_list,
                model: m,
                open: true,
                fileName: name,
                save: async (context) => {
                    if (param.save_file_fun) {
                        await param.save_file_fun(context);
                        return;
                    }
                    const data: saveTxtReq = {
                        context
                    }
                    // const v = encodeURIComponent(getRouterAfter('file', getRouterPath()));
                    const rsq = await fileHttp.post(`save/${file_path_}`, data)
                    if (rsq.code === 0) {
                        editor_data.set_value_temp('')
                        // setEditorSetting({open: false, model: '', fileName: '', save: null})
                    }
                },
                opt_shell: param.opt_shell,
                close: param.close
            })
            editor_data.set_value_temp(value)
            return;
        } else {
            // let url = fileHttp.getDownloadUrl(getFileNameByLocation(name));
            switch (type) {
                case FileTypeEnum.draw:
                case FileTypeEnum.excalidraw:
                    set_excalidraw_editor({url, name, close: param.close});
                    break;
                case FileTypeEnum.md:
                    // set_markdown({
                    //     context: await Http.get(url),
                    //     filename: name,
                    //     close: param.close
                    // })
                    set_md_editor({
                        url: url,
                        path: absolute_file_path,
                        name,
                        readonly: param.readonly,
                        close: param.close,
                    });
                    break;
                case FileTypeEnum.video:
                case FileTypeEnum.pdf:
                    setFilePreview({open: true, type: type, name, url, close: param.close})
                    break;
                case FileTypeEnum.image:
                    setFilePreview({
                        open: true,
                        type: type,
                        name,
                        url: fileHttp.add_params(url, {mtime: param.mtime, cache: 1}),
                        close: param.close
                    })
                    break;
                case FileTypeEnum.workflow_act:
                    param.model = "text";
                    click_file(param);
                    break;
                case FileTypeEnum.url:
                    window.open(await Http.get(url), '_blank');
                    break;
                case FileTypeEnum.unknow:
                default:
                    if (model) {
                        param.model = "text";
                        click_file(param);
                        break;
                    }
                    NotyFail(param.not_type_tip ?? t("未知类型、请右键点击文件"))
                    break;
            }

        }

    }

    return {click_file};
}