import {FileTypeEnum} from "./file.pojo";

export class Param {
    key:string;
    value?:any;
}

export class StringUtil {
    public static  trim(str) {
        if (!str) return "";
        return str.replace(" ", "");
    }

    public static trimList(list,index) {
        const one = list[index];
        return this.trim(one);
    }

    public static getParam(...vs:Param[]) {
        let r = "?";
        let h = false;
        if (Array.isArray(vs)) {
            for (const item of vs) {
                if (item.value) {
                    if (h) {
                        r+=`&${item.key}=${item.value}`;
                    } else {
                        r+=`${item.key}=${item.value}`;
                        h = true;
                    }
                }
            }
        }
        return r;
    }

    public static getFileExtension(fileName) {
        return fileName.split('.').pop();
    }
}

// 获取编辑器模式
export function getEditModelType(name) {
    let p = name.split('.');
    if (p.length === 1) {
        return '';
    }
    p = p[p.length - 1];
    switch (p) {
        case 'java':
        case 'javascript':
        case 'css':
        case 'json':
        case 'python':
        case 'text':
        case 'sh':
        case 'lua':
        case 'html':
        case 'xml':
        case 'yaml':
        case 'tsx':
        case 'sql':
            return p;
        case 'txt':
        case 'ini':
        case 'env':
        case 'bash':
        case 'log':
        case 'config':
        case 'map':
        case 'out':
        case 'gitignore':
        case 'conf':
        case 'mod':
            return 'text';
        case 'js':
            return 'javascript';
        case 'md':
            return 'markdown';
        case 'py':
            return 'python';
        case 'ts':
            return 'typescript';
        case 'yml':
            return 'yaml';
        case 'cpp':
        case 'h':
        case 'c':
            return 'c_cpp'
    }
    return "";
}

export function getFileType(name):FileTypeEnum {
    let p = name.split('.');
    if (p.length === 1) {
        return FileTypeEnum.unknow;
    }
    p = p[p.length - 1];
    switch (p) {
        case 'mp4':
        // case "webm":
        // case "m3u8":
        // case "ogv":
        // case "mpd":
            return FileTypeEnum.video;
        case 'pdf':
            return FileTypeEnum.pdf;
    }
    return FileTypeEnum.unknow;
}
