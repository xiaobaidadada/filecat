import {getByIndexs, sort} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {FileTypeEnum, GetFilePojo} from "../../../../common/file.pojo";
import {DirListShowTypeEmum} from "../../../../common/req/user.req";
import {QuickCmdItem} from "../../../../common/req/setting.req";
import {PromptEnum} from "../prompts/Prompt";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {scanFiles} from "../../util/file";
import {useEffect} from "react";

export function getFilesByIndexs(nowFileList, selectedFileList: number[]) {
    return getByIndexs([...nowFileList.folders, ...nowFileList.files], selectedFileList);
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
export function using_drop_file_upload() {
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
    return {drop, dragover};
}

// 多选文件快捷键
export function using_file_quick_keyboard(file_list, folder_list, isFocused) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);

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
