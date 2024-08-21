import {StringUtil} from "../../../../../common/StringUtil";

export enum FileMenuEnum {
    video,
    uncompress,
    unknown,
    folder
}
export class FileMenuData {
    x:number;
    y:number;
    filename:string;
    type:FileMenuEnum;
}


const video_format_set = new Set(["mp4", "webm","flv","mov","m4v","mkv","avi","wmv","swf","mod","mpv","mpeg","asf"]);
const compressing_list = new Set(["tar","zip","gz","tgz","rar"]);// compressing
const txt = new Set(["txt","ts","js"]);

export function getFileFormat(filename:string): FileMenuEnum {
    const extension = StringUtil.getFileExtension(filename);
    if (video_format_set.has(extension)) {
        return FileMenuEnum.video;
    } else if (compressing_list.has(extension)) {
        return FileMenuEnum.uncompress;
    }
    return FileMenuEnum.unknown;
}
