/**
 * 平铺数组
 * @param list
 * @returns {*[]}
 */
export function flatten(list) {
    const result = [];
    if (Array.isArray(list)) {
        for (const one of list) {
            result.push(...flatten(one))
        }
    } else {
        result.push(list);
    }
    return result;
}

export function removeLastDir(url) {
    if(!url) return url;
    const arr = url.split("/");
    if (arr.pop() === "") {
        arr.pop();
    }

    return arr.join("/");
}