import {Global} from "./global";
import {routerConfig} from "../../../common/RouterConfig";

Global.init();
// 获取某段路由以后的全部路径 最后会带一个 /
export function getRouterAfter(keyRouter: string, router: string) {
    let result = '';
    // 1. 去掉 keyRouter 中的斜杠，确保匹配的是纯路径段
    const targetKey = keyRouter.replace(/\//g, '');

    // 2. 分割并过滤空字符串
    let keys = router.split('/').filter(key => key !== '');

    // 3. 查找 keyRouter 在路径中的位置
    // 注意：由于路由前缀位于路径的第一个段位置（如 /file/xxx），
    // 我们应该只匹配第一个出现的 targetKey，避免路径中同名的目录名导致误匹配
    const keyIndex = keys.indexOf(targetKey);
    if (keyIndex === -1) {
        return result;
    }

    // 4. 从 keyRouter 的下一个段开始收集
    for (let i = keyIndex + 1; i < keys.length; i++) {
        result += `${keys[i]}/`;
    }
    return result;
}

export function remove_router_tail(router) {
    if(router.endsWith("/")){
        router = router.slice(0, -1);
    }
    return router;
}

// 获取资源所在的路径上一级 会以/结尾
export function getRouterPrePath(path) {
    path = path.trim();
    if (path.endsWith('/') || path.endsWith('\\')) {
        path = path.slice(0,-1);
    }
    let index = -1;
    for (let i = path.length-1; i >=0 ; i--) {
        if (path[i] === "/" || path[i] === "\\") {
            index = i;
            break;
        }

    }
    path = path.substring(0,index);
    if (!path.endsWith('/')) {
        path = path+"/"
    }
    return path;
}

export function isNumeric(str) {
    return /^\d+$/.test(str);
}
function detectOS() {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes('windows')) {
        return 'Windows';
    } else if (userAgent.includes('macintosh') || userAgent.includes('mac os')) {
        return 'macOS';
    } else if (userAgent.includes('linux')) {
        return 'Linux';
    } else if (userAgent.includes('android')) {
        return 'Android';
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        return 'iOS';
    } else {
        return 'Unknown';
    }
}

const sys_pre = Global.base_url;
export function getRouterPath() {
    let path  = window.location.pathname + window.location.hash;
    // 去掉 BASENAME
    if (sys_pre && path.startsWith(sys_pre)) {
        path = path.slice(sys_pre.length) || "/";
    }
    return path;
}

export function get_router_key_set() {
   return new Set(getRouterPath().split("/"));
}

export function get_filter_key(key: string) {
    // [/*] 匹配斜杠或星号，g 代表全局替换
    return key.replace(/[/*]/g, "");
}

export function have_key_by_router_key_list(router_key_list:string[]) {
    const set = get_router_key_set()
    let have = false
    for (const key of router_key_list) {
        const filter_key = get_filter_key(key)
        if(set.has(filter_key)) {
            have = true;
            break;
        }
    }
    return have;
}

// todo 所有计算可以缓存的都缓存一下
export function is_share (){
   const path = getRouterPath()
   // const cleanPath = path.split("?")[0].split("#")[0].replace(/^\/+/, "");
   // const firstPath = cleanPath.split("/")[0];
   // debugger
    return path.startsWith(routerConfig.share)
}
