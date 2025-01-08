import {getByIndexs} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";

export function getFilesByIndexs(nowFileList, selectedFileList:number[]) {
    return getByIndexs([...nowFileList.folders, ...nowFileList.files], selectedFileList);
}

export function getFileNameByLocation(fileName) {
    return `${getRouterAfter('file',getRouterPath())}${fileName}`;
}