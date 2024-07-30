
// 获取某段路由以后的全部路径
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


export function isNumeric(str) {
    return /^\d+$/.test(str);
}
