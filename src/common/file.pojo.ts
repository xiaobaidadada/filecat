
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

