export class Param {
    key: string;
    value?: any;
}

export class StringUtil {
    public static trim(str) {
        if (!str) return "";
        return str.replace(" ", "");
    }

    public static trimList(list, index) {
        const one = list[index];
        return this.trim(one);
    }

    public static getParam(...vs: Param[]) {
        let r = "?";
        let h = false;
        if (Array.isArray(vs)) {
            for (const item of vs) {
                if (item.value) {
                    if (h) {
                        r += `&${item.key}=${item.value}`;
                    } else {
                        r += `${item.key}=${item.value}`;
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
        case "cc":
            return 'c_cpp'
        case "excalidraw":
            return 'json'
    }
    return "";
}

export function join_url(u1: string, u2: string) {
    if (u1.endsWith("/") && u2.startsWith("/")) {
        return u1.slice(0, -1) + u2;
    } else if (!u1.endsWith("/") && !u2.startsWith("/")) {
        return u1 + "/" + u2;
    } else {
        return u1 + u2;
    }
}

// 获取路由url的第一个key值
export function getWebFirstKey(url: string) {
    if (!url) {
        return "";
    }
    for (let i = 1; i < url.length; i++) {
        if (url[i] === "//") {
            return url.slice(1, i);
        }
    }
    return url.slice(1);
}

export function generateSaltyUUID(context: string= "") {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + (context ?? `${Date.now()}`);
    let result = '';
    for (let i = 0; i < 60; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}