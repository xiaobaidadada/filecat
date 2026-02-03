import {Global} from "./global";
import {routerConfig} from "../../../common/RouterConfig";
import { path_join } from "../../../common/path_util";

Global.init();
// 获取某段路由以后的全部路径 最后会带一个 /
export function getRouterAfter(keyRouter,router) {
    let result = '';
    let keys = router.split('/');
    keys = keys.filter(function (key) {return key!==''})
    let start = false;
    for (let i = 0; i < keys.length; i++) {

        if (start) {
            result+= `${keys[i]}/`;
        }
        if (keys[i]===keyRouter) {
            start = true;
        }
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

export function is_share (){
   const abc = getRouterPath()
    return path_join("/",abc).startsWith(`/${routerConfig.share}`)
}