

export interface fileReq {
    files:string[]
}

export interface saveTxtReq {
    context:string
}

export interface cutCopyReq {
    files:string[],
    to:string
}

export interface fileInfoReq {
    name:string,
    newName:string;
    context?:string
}

