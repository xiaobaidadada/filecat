import {MaterialIcon} from "material-icons";

export enum FileTypeEnum {
    audio = "audio",
    blob = 'blob',
    image = "image",
    pdf = 'pdf',
    text = 'text',
    video = 'video',
    invalid_link = 'invalid_link',
    folder = 'folder',
    studio_file = 'studio_file',
    studio_folder = 'studio_folder',
    directory = 'directory',
    unknow = "text",
    uncompress = "uncompress", // 压缩文件
    md = "md",
    excalidraw = "excalidraw",
    draw = "draw",
    workflow_act = "act",
    dev = "dev" // linux设备 不是文件或者目录
}

export interface FileItemData {
    type?: FileTypeEnum,
    name: string,
    mtime?: string,
    origin_size?:any,
    size?: any, // 数字和字符串
    isLink?: boolean,
    path?: string,
    icon?: MaterialIcon,
}

export interface FileInfoItemData {
    path?:string;
    name?:string;
    total_size?:any;
    left_size?:any;
    used_size?:any;
    fs_type?:string;
    now_absolute_path?:string; // 当前决定路径
}

export interface GetFilePojo {
    files?: FileItemData[],
    folders?: FileItemData[],
    relative_user_path?:string; // 相对于用户当前token路径的相对路径 也就是token之后的路径 返回这个 文件夹内的数据就不返回了 前端通过这个相对路径再请求一次
}

export class FileVideoFormatTransPojo {
    source_filename: string;
    to_format: string;
    to_filename: string;
    token: string;
}

export enum FileCompressType {
    zip = "zip",
    tar = "tar",
    gzip = "gz",
    rar = "rar"// 只解压
}

export class FileCompressPojo {
    format: FileCompressType;
    token: string;
    tar_dir: string; // 目标目录
    source_file: string; // 源文件
    filePaths: string[];
    tar_filename: string; // 目标压缩文件名字
    compress_level: number | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; //压缩级别
}

export interface FileTree {
    type: string & "folder" | "file";
    name: string;
    children?: FileTree[];
}

export type FileTreeList = FileTree[];

export enum base64UploadType {
    all, // 全部上传
    start, // 开始部分
    part, // 部分
}


export class LogViewerPojo {
    path:string;
    token: string;
    position:number = 0; // 文件读取的偏移位置
    line:number = 1000; // 读取一千行
    once_max_size:number = 1024 * 60; // 一次读取最大的字节数 60 KB

    back:boolean; // 往回查找

    find_back_enter_index:boolean; // 往前找到最近的行位置

    // 返回用的
    context:string;
    context_list:string[] = []; // 多个数组
    context_start_position_list:number[] = []; // 多个数组 对应的开始位置
    context_position_list:number[] = []; // 多个数组 对应的结束位置
    max_size:number; // 当前文件的最大字节数
    query_text:string;
}