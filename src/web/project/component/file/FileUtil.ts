import {getByIndexs, sort} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {GetFilePojo} from "../../../../common/file.pojo";
import {DirListShowTypeEmum} from "../../../../common/req/user.req";
import {QuickCmdItem} from "../../../../common/req/setting.req";

export function getFilesByIndexs(nowFileList, selectedFileList:number[]) {
    return getByIndexs([...nowFileList.folders, ...nowFileList.files], selectedFileList);
}

export function getFileNameByLocation(fileName) {
    return `${getRouterAfter('file',getRouterPath())}${fileName}`;
}

export function file_sort(data: GetFilePojo,type:DirListShowTypeEmum) {
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

export function create_quick_cmd_items(quick_cmd:QuickCmdItem[],its:any[]) {
    const index_map = {}
    const left_map = {}
    for (let i = 0;i<quick_cmd.length;i++) {
        const it = quick_cmd[i];
        const ok = {
            r:it.note,
            items:[],
            v: {
                tag: "quick_cmd",
                cmd: it.cmd,
            }
        }
        // 看看是否属于某个子集
        if(it.father_index != null) {
            left_map[it.father_index] = ok
            const v = index_map[it.father_index]
            if(v) {
                v.items.push(ok);
            }
            continue
        }
        its.push(ok);
        if(it.index != null) {
            index_map[it.index] = ok;
            // 有自己的子集
            if(left_map[it.index] != null) {
                ok.items.push(left_map[it.index]);
            }
        }
    }
}


