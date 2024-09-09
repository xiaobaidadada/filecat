import {StringUtil} from "./StringUtil";
import {FileTypeEnum} from "./file.pojo";


export class FileMenuData {
    x:number;
    y:number;
    filename:string;
    type:FileTypeEnum;
    path:string;
}


const video_format_set = new Set(["mp4", "webm","flv","mov","m4v","mkv","avi","wmv","swf","mod","mpv","mpeg","asf"]);
const compressing_list = new Set(["tar","zip","gz","tgz","rar"]);// compressing
const image_list = new Set(["jpg","jpeg","png","gif"]);
const txt = new Set(["txt","ts","js"]);

export function getFileFormat(filename:string): FileTypeEnum {
    const extension = StringUtil.getFileExtension(filename);
    if (extension ==="pdf") {
        return FileTypeEnum.pdf;
    } else if (extension == "md") {
        return FileTypeEnum.md;
    }
    else if (video_format_set.has(extension)) {
        return FileTypeEnum.video;
    } else if (compressing_list.has(extension)) {
        return FileTypeEnum.uncompress;
    } else if(image_list.has(extension)) {
        return FileTypeEnum.image;
    }
    return FileTypeEnum.unknow;
}
