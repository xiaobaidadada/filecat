import {is_text_file, StringUtil} from "./StringUtil";
import {FileTypeEnum} from "./file.pojo";

type menu_item = {r?:string,v?:any,items?:menu_item[]}

/** 「切换目录」菜单项的值类型：根目录项、子目录项、添加项 */
export enum FileMenuDirType {
    root,
    child,
    add,
}

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
    call?:(...args:any[])=>void;
    ok?:any;
    dockerId?:string;
    name?:string;
    extra_data?:any;
    is_share?:boolean;
    share_id?:string;
    share_token?:string;
    /** 右键菜单时，如果右键的文件已在选中列表中，此标记为 true，表示操作应作用于选中列表 */
    useSelectedList?:boolean;
}


const video_format_set = new Set(["mp4", "webm","flv","mov","m4v","mkv","avi","wmv","swf","mod","mpv","mpeg","asf"]);
const compressing_list = new Set(["tar","zip","gz","tgz","rar","7z"]);// compressing
const image_list = new Set(["jpg","jpeg","png","gif"]);
const sqlite_list = new Set(["db", "sqlite", "sqlite3"]);
const format_map = new Map<string, FileTypeEnum>([
    ["xlsx", FileTypeEnum.excel],
    ["xlsm", FileTypeEnum.excel],
    // ["xls", FileTypeEnum.excel],
    // Word 文档：docm 与 docx 同为 OOXML 包，同样可读写
    ["docx", FileTypeEnum.docx],
    ["docm", FileTypeEnum.docx],
    // ["doc", FileTypeEnum.docx],
    // 演示文稿：pptm 与 pptx 同为 OOXML 包
    ["pptx", FileTypeEnum.pptx],
    ["pptm", FileTypeEnum.pptx],
    // ["ppt", FileTypeEnum.pptx],
    // 电子书：epub/mobi/azw3/fb2/cbz 都由 foliate-js 渲染，只读
    ["epub", FileTypeEnum.ebook],
    ["mobi", FileTypeEnum.ebook],
    ["azw", FileTypeEnum.ebook],
    ["azw3", FileTypeEnum.ebook],
    ["fb2", FileTypeEnum.ebook],
    ["fbz", FileTypeEnum.ebook],
    ["cbz", FileTypeEnum.ebook],
]);
// const txt = new Set(["txt","ts","js","act","py","text","log","bash","sh","java"]);
const ExtBeautify = new Set(["js","mjs","json","html","htm","css","xml"]);

// 返回文件格式
export function getFileFormat(filename:string): FileTypeEnum {
    const extension = StringUtil.getFileExtension(filename);
    if (extension ==="pdf") {
        return FileTypeEnum.pdf;
    } else if (sqlite_list.has(extension)) {
        return FileTypeEnum.database;
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
    } else if (extension === FileTypeEnum.mind) {
        return FileTypeEnum.mind;
    } else if (extension === FileTypeEnum.timeline) {
        return FileTypeEnum.timeline;
    } else if(extension === FileTypeEnum.workflow_act) {
        return FileTypeEnum.workflow_act;
    } else if(extension === 'url') {
        return FileTypeEnum.url;
    }
    // else if(txt.has(extension)) {
    //     return FileTypeEnum.text;
    // }
    else if (format_map.has(extension)) {
        return format_map.get(extension);
    }
    const edit_mode = is_text_file(filename);
    if(edit_mode) {
        return FileTypeEnum.text;
    }
    return FileTypeEnum.unknow;
}

export function ableExtBeautify(filename) {
    const extension = StringUtil.getFileExtension(filename);
    return ExtBeautify.has(extension);
}
