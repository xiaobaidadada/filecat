import {MaterialIcon} from "material-icons";
import {dir_upload_max_num_item} from "./req/setting.req";

export enum FileTypeEnum {
    audio = "audio",
    blob = 'blob',
    image = "image",
    pdf = 'pdf',
    text = 'text',
    video = 'video',
    invalid_link = 'invalid_link',
    folder = 'folder',
    upload_folder = 'upload_folder',
    studio_file = 'studio_file',
    studio_folder = 'studio_folder',
    directory = 'directory', // 一些目录操作 点击一些目录下的资源
    unknow = "text",
    uncompress = "uncompress", // 压缩文件
    md = "md",
    excalidraw = "excalidraw",
    draw = "draw",
    workflow_act = "act",
    dev = "dev", // linux设备 不是文件或者目录
    url = "url"
}

export interface FileItemData {
    type?: FileTypeEnum,
    name: string,
    mtime?: string | number,
    show_mtime?: string,
    origin_size?: any,
    size?: any, // 数字和字符串
    isLink?: boolean,
    path?: string,
    icon?: MaterialIcon,
}

export interface FileInfoItemData {
    path?: string;
    name?: string;
    total_size?: any;
    left_size?: any;
    used_size?: any;
    fs_type?: string;
    now_absolute_path?: string; // 当前决定路径
    dir_upload_max_num_value?: dir_upload_max_num_item;
}

export interface GetFilePojo {
    files?: FileItemData[],
    folders?: FileItemData[],
}

export class FileVideoFormatTransPojo {
    source_filename: string;
    to_format: string;
    to_filename: string;
    token: string;
}

export enum FileCompressType {
    zip = ".zip", // zip 支持多文件
    tar = ".tar",
    gz = ".gz", // gz 不支持多文件 只支持单文件
    rar = ".rar", // 只解压
    tar_gz = ".tar.gz",
}

// 有优先级的 后缀的 选择
export const file_select_list = [
    FileCompressType.zip,
    FileCompressType.tar_gz,
    FileCompressType.gz,
    FileCompressType.rar,
    FileCompressType.tar,
]

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
    size: number;
    children?: FileTree[];
}

export type FileTreeList = FileTree[];

export enum base64UploadType {
    all, // 全部上传
    start, // 开始部分
    part, // 部分
}


export class LogViewerPojo {
    path: string;
    token: string;
    position: number = 0; // 文件读取的偏移位置
    line: number = 1000; // 读取一千行
    once_max_size: number = 1024 * 60; // 一次读取最大的字节数 60 KB
    encoding:string;

    back: boolean; // 往回查找

    find_back_enter_index: boolean; // 往前找到最近的行位置

    // 返回用的
    context: string;
    context_list: string[] = []; // 多个数组
    context_start_position_list: number[] = []; // 多个数组 对应的开始位置
    context_position_list: number[] = []; // 多个数组 对应的结束位置
    max_size: number; // 当前文件的最大字节数
    query_text: string;
}

export interface FileInfo {
    /** 文件名称 */
    name: string;

    /** 文件完整路径 */
    path: string;


    /** 可读文件大小（如 1.23 MB） */
    size: number;

    /** 原始文件大小（字节） */
    // sizeBytes: number;

    /** 是否是普通文件 */
    isFile: boolean;

    /** 是否是软链接 */
    isSymbolicLink: boolean;

    /** 创建时间（格式化后的字符串） */
    createdAt: number;

    /** 最后修改时间 */
    modifiedAt: number;

    /** 最后访问时间 */
    accessedAt: number;

    /** 文件 mode 原始值 */
    mode: number;

    /** 可读权限字符串 (rwxr-xr-x) */
    // permissions: string;

    uid:number

    uname:string
}
