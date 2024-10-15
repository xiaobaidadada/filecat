
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
    unknow = "text",
    uncompress = "uncompress", // 压缩文件
    md = "md",
    excalidraw = "excalidraw",
    dev = "dev" // linux设备 不是文件或者目录
}

export interface FileItemData {
    type?: FileTypeEnum,
    name: string,
    mtime?: string,
    size?: string,
    isLink?: boolean,
    path?: string,
}

export interface FileInfoItemData {
    path?:string;
    name?:string;
    total_size?:any;
    left_size?:any;
    used_size?:any;
    fs_type?:string;
}

export interface GetFilePojo {
    files?: FileItemData[],
    folders?: FileItemData[]
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