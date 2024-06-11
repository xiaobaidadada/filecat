import {getByIndexs} from "../../../../common/ListUtil";
import {getRouterAfter} from "../../util/WebPath";

export function getFilesByIndexs(nowFileList, selectedFileList:number[]) {
    return getByIndexs([...nowFileList.folders, ...nowFileList.files], selectedFileList);
}

export function getFileNameByLocation(location,fileName) {
    return `${getRouterAfter('file',location.pathname)}${fileName}`;
}