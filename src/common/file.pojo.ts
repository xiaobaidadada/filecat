
export enum FileTypeEnum {
    audio= "audio",
    blob ='blob',
    image="image",
    pdf='pdf',
    text='text',
    video='video',
    invalid_link='invalid_link',
    folder='folder'
}

export interface FileItemData {
    type?:FileTypeEnum,
    name:string,
    mtime?:string,
    size?:string
}

export interface GetFilePojo {
    files?: FileItemData[],
    folders?: FileItemData[],
}

export class FileVideoFormatTransPojo {
    source_filename:string;
    to_format:string;
    to_filename:string;
    token:string;
}

export enum FileCompressType {
    zip = "zip",
    tar = "tar",
    gzip = "gz",
    rar = "rar"// 只解压
}
export class FileCompressPojo {
    format:FileCompressType;
    token:string;
    tar_dir:string; // 目标目录
    source_file:string; // 源文件
    filePaths:string[];
    tar_filename:string; // 目标压缩文件名字
    compress_level:1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; //压缩级别
}
