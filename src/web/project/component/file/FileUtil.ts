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

export function create_quick_cmd_items(quick_cmd:QuickCmdItem[],its:any[],father_index?:any) {
    for (let i = 0;i<quick_cmd.length;i++) {
        const it = quick_cmd[i];
        if(father_index !== undefined && it.index !== father_index) {
            continue;
        }
        const ok = {
            r:it.note,
            items:[],
            v: {
                tag: "quick_cmd",
                cmd: it.cmd,
            }
        }
        its.push(ok);
        for (let j = i+1; j < quick_cmd.length; j++) {
            const it1 = quick_cmd[j];
            if(it.index === it1.father_index) {
                ok.items.push({
                    r:it1.note,
                    items:[],
                    v: {
                        tag: "quick_cmd",
                        cmd:it1.cmd,
                    }
                });
                quick_cmd.splice(j,1);
            }
        }
    }
}


