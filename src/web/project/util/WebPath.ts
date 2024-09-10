
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

// 获取资源所在的路径上一级
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
    return path.substring(0,index);
}

export function isNumeric(str) {
    return /^\d+$/.test(str);
}
