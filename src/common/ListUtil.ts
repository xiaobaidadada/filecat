// 将数组作为循环队列，获取某个元素后的下一个元素
export function getNextByLoop(list, value) {
    const index = getIndexByList(list, value);

    if (index === null) {
        return null;
    }
    if (index === list.length - 1) {
        return list[0];
    }
    return list[index + 1];
}

// 从数组中获取某个元素的下标，如果存在
export function getIndexByList(list, value) {
    for (let i = 0; i < list.length; i++) {
        if (list[i] === value) {
            return i;
        }
    }
    return null;
}

// 从数组中获取某个元素，如果存在
export function getByList(list, value) {
    const index = getIndexByList(list, value);
    if (index === null) {
        return null;
    }
    return list[index];
}

// 获取数组元素的最大值和最小值
export function getMaxByList(list?:number[]) {
    if(!list) {
        return {};
    }
    let max;
    let min;
    for (let v of list) {
        if(max === undefined) {
            max = v;
        } else if (max < v) {
            max = v;
        }
        if (min === undefined) {
            min = v;
        } else if (min > v) {
            min = v;
        }
    }
    return {max,min};
}

// 删除数组中的一个元素，并返回新的数组
export function getNewDeleteByList(list, value) {
    const index = list.indexOf(value);
    const result = [...list];
    result.splice(index, 1);
    return result;
}

// 合并路径，前端使用
export function webPathJoin(...pathList) {
    let webPath = '';
    for (let index = 0; index < pathList.length; index++) {
        let srt = pathList[index];
        if (index === 0) {
            // 第一个
            if (srt[0] !== '/') {
                srt = '/' + srt;
            }
            if (srt[srt.length - 1] !== '/') {
                // 最后一个字符不是
                srt += '/';
            }
        } else if (index === pathList.length - 1) {
            // 最后一个
            if (srt[srt.list - 1] !== '/' && srt.indexOf('.') === -1) {
                srt += '/';
            }
        } else {
            // 一般的
            if (srt[0] === '/') {
                // 第一个字符是
                srt = srt.slice(1, srt.length - 1);
            }
            if (srt[srt.length - 1] !== '/') {
                // 最后一个字符不是
                srt += '/';
            }
        }
        webPath += srt;
    }
    return webPath;
}

// 简单合并路径
export function joinPaths(...parts) {
    let p = parts[0];
    for (let i = 1; i < parts.length; i++) {
        if (parts[i][parts[i].length-1] === '/') {
            p += parts[i];
            continue
        }
        p += '/' + parts[i];
    }
    // return parts
    //     // .map(part => part.replace(/\/+$/, ''))  // 移除结尾的斜杠
    //     // .map(part => part.replace(/^\/+/, ''))  // 移除开头的斜杠
    //     .filter(part => part)  // 移除空字符串
    //     .join('/');  // 使用斜杠连接
    return p;
}

// 获取特定下标下的元素
export function getByIndexs(list, indexs) {
    const result = [];
    for (const index of indexs) {
        result.push(list[index]);
    }
    return result;
}

/**
 * 冒泡排序，默认是升序
 * @param data_list
 * @param getKey
 * @param asc
 */
export function sort(data_list, getKey, asc = true) {
    if (!data_list || data_list.length === 0) {
        return data_list;
    }

    for (let index = 0; index < data_list.length; index++) {
        for (let index_a = data_list.length - 1; index_a > index; index_a--) {
            let data = getKey ? getKey(data_list[index_a]) : data_list[index_a];
            // 较前的一个
            let data_befor = getKey ? getKey(data_list[index_a - 1]) : data_list[index_a - 1];

            let object_data = data_list[index_a];

            if (data < data_befor) {
                if (asc) {
                    data_list[index_a] = data_list[index_a - 1];
                    data_list[index_a - 1] = object_data;
                }
            } else if (data > data_befor) {
                if (!asc) {
                    data_list[index_a] = data_list[index_a - 1];
                    data_list[index_a - 1] = object_data;
                }
            }

        }

    }


    return data_list;

}

export function getMapByList<T>(list: T[], getKeyFun: (one: T) => string | number | T): Map<string | number | T, T> {
    const resultMap: Map<string | number | T, T> = new Map();
    for (const item of list) {
        resultMap.set(getKeyFun(item), item);
    }
    return resultMap;
}

// 生成介于min（包括）和max（不包括）之间的随机整数
function getRandomInt(min: number, max: number): number {
    if (min === max) {
        return -1;
    }
    return Math.floor(Math.random() * (max - min)) + min;
}

// 随机获取数组内的一个元素
export function getByListRandom<T>(list: T[], ignoreIndex?: number) {
    if (list.length === 0) {
        return null;
    }
    const index = getRandomInt(0, list.length);
    if (!!ignoreIndex && index === ignoreIndex) {
        // 重试
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return getByListRandom(list, ignoreIndex);
    }
    return list[index];
}

export function  deleteList<T>(list: T[], check: (data: T) => boolean): T | undefined {
    if (!check) {
        return undefined;
    }
    for (let index = 0; index < list.length; index++) {
        if (check(list[index])) {
            return list.splice(index, 1)[0];
        }
    }
    return undefined;
}
