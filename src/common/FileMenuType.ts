import {StringUtil} from "./StringUtil";
import {FileTypeEnum} from "./file.pojo";

type menu_item = {r?:string,v?:any,items?:menu_item[]}
export class FileMenuData {
    x?:number;
    y?:number;
    filename?:string;
    size?:any;
    path?:string;
    textClick?:(v) => void;
    type?:FileTypeEnum;
    items?:menu_item[];
    item_pre_value?: any
    files?:any;
    dir?:string;
    call?:(e?:any)=>void;
    ok?:any;
    dockerId?:string;
    name?:string;
    extra_data?:any;
}


const video_format_set = new Set(["mp4", "webm","flv","mov","m4v","mkv","avi","wmv","swf","mod","mpv","mpeg","asf"]);
const compressing_list = new Set(["tar","zip","gz","tgz","rar"]);// compressing
const image_list = new Set(["jpg","jpeg","png","gif"]);
const txt = new Set(["txt","ts","js"]);
const ExtBeautify = new Set(["js","mjs","json","html","htm","css","xml"]);

export function getFileFormat(filename:string): FileTypeEnum {
    const extension = StringUtil.getFileExtension(filename);
    if (extension ==="pdf") {
        return FileTypeEnum.pdf;
    } else if (extension == "md") {
        return FileTypeEnum.md;
    } else if (video_format_set.has(extension)) {
        return FileTypeEnum.video;
    } else if (compressing_list.has(extension)) {
        return FileTypeEnum.uncompress;
    } else if(image_list.has(extension)) {
        return FileTypeEnum.image;
    } else if (extension === FileTypeEnum.excalidraw || extension === FileTypeEnum.draw) {
        return FileTypeEnum.excalidraw;
    } else if(extension === FileTypeEnum.workflow_act) {
        return FileTypeEnum.workflow_act;
    }
    return FileTypeEnum.unknow;
}

export function ableExtBeautify(filename) {
    const extension = StringUtil.getFileExtension(filename);
    return ExtBeautify.has(extension);
}