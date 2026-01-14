import {getByIndexs, sort} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {DirListShowTypeEmum} from "../../../../common/req/user.req";
import {QuickCmdItem} from "../../../../common/req/setting.req";
import {PromptEnum} from "../prompts/Prompt";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {scanFiles} from "../../util/file";
import {useEffect, useState} from "react";
import {NotyFail, NotySucess} from "../../util/noty";
import {debounce} from "../../../../common/fun.util";

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
export function using_drop_file_upload(inputRef?:any) {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);

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
        let files = await scanFiles(dt);
        setUploadFiles(files);
        setShowPrompt({show: true, type: PromptEnum.FilesUpload, overlay: false, data: {}});
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
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);
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

const columnWidth = 280;

// 让文件页面的文件可以子适应 （控制 width参数)
export function using_file_page_handle_width_auto() {
    const [itemWidth, setItemWidth] = useState($stroe.file_item_width_atom);

    const handleResize = () => {
        let columns = Math.floor(
            document.querySelector("main").offsetWidth / columnWidth
        );
        if (columns === 0) columns = 1;
        setItemWidth(`calc(${100 / columns}% - 1em)`)
        // set_windows_width({width: window.innerWidth,is_mobile: window.innerWidth <= 736})
    };

    useEffect(() => {
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        }
    }, []);
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