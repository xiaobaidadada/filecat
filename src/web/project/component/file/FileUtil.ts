import {getByIndexs, getNextByLoop, sort} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {DirListShowTypeEmum, fileTypes} from "../../../../common/req/user.req";
import {QuickCmdItem} from "../../../../common/req/setting.req";
import {PromptEnum} from "../prompts/Prompt";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {scanFiles} from "../../util/file";
import {useContext, useEffect, useState} from "react";
import {NotyFail, NotySucess} from "../../util/noty";
import {debounce, throttle} from "../../../../common/fun.util";
import {copyToClipboard} from "../../util/FunUtil";
import {userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {GlobalContext} from "../../GlobalProvider";
import {useSearchParams} from "react-router-dom";
import {getFileFormat} from "../../../../common/FileMenuType";
import {browser_file_pojo} from "../../../../common/req/common.pojo";

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
        NotySucess(`${it.slice(0, -13)} done!`);
    } else if (it.endsWith('.act')) {
        NotySucess(`${it.slice(0, -4)} done!`);
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
    NotySucess('复制成功');
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


export function useUpdateUrlParams() {
    const [searchParams, setSearchParams] = useSearchParams();

    return (key: string, value: string|undefined|null) => {
        const newParams = new URLSearchParams(searchParams);

        if (value === undefined || value === null) {
            newParams.delete(key);
        } else {
            newParams.set(key, value);
        }

        setSearchParams(newParams);
    };
}

export function use_share_preview() {
    const updateParams = useUpdateUrlParams();
    const list = ["text",
        FileTypeEnum.md,
        FileTypeEnum.excalidraw,
        FileTypeEnum.draw,
        FileTypeEnum.pdf,
        FileTypeEnum.image,
        FileTypeEnum.video
    ]
    return (name:string)=>{
        const type = getFileFormat(name);
        if(list.includes(type)) {
            updateParams('share_preview_file_name',name)
            return true;
        }
        return false;
    }
}