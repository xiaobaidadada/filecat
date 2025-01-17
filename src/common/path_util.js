

function get_extname(filePath) {
    const lastDotIndex = filePath.lastIndexOf('.');

    // 如果没有找到点或文件以点开头，则没有扩展名
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        return '';
    }

    // 返回从最后一个点开始到字符串结尾的部分
    return filePath.slice(lastDotIndex);
}

/**
 * windows 是 \ linux 是 /
 * @param path
 * @param filename
 * @returns {*|string}
 */
export function path_join(path,filename){
    let s_r;
    // 先找到系统上的分隔符是啥
    for (const it of path) {
        if(it==="/" || it==="\\") {
            s_r = it;
            break;
        }
    }
    if(filename === '.') {
        return path;
    } else if(filename === "..") {
        if(path.length > 1) {
            let ok = path[path.length-1] === s_r?1:0;
            for (let i = path.length-1-ok; i >= 0; i--) {
                if(path[i] === s_r) {
                    return path.substring(0,i+1);
                }
            }
        }
        return path;
    }
    if (path.endsWith(s_r) && filename.startsWith(s_r)) {
        // 前后都有 /
        return path.slice(0, -1) + filename;
    } else if (!path.endsWith(s_r) && !filename.startsWith(s_r)) {
        // 前后都没有 /
        return path + s_r + filename;
    } else {
        return path + filename;
    }
}


const exec_map = {// windwos文件命令执行优先级
    ".com":4, // 越大优先
    ".exe":3,
    ".bat":2,
    ".cmd":1
}
// 获取最合适的命令 list 都是字符串内容
export function get_best_cmd(list) {
    if(!list)return;
    let ok;
    let ok_p = 0;
    for (const item of list) {
        const v = exec_map[get_extname(item)];
        if(v!== undefined && v>ok_p) {
            ok = item;
            ok_p = v;
        }
    }
    if(ok===undefined) {
        // 选出一个最短的
        for (const item of list) {
            if(item.length>ok_p) {
                ok = item;
                ok_p = item.length;
            }
        }
    }
    return ok;
}

// console.log(get_best_cmd(['ab','ab.bat','ab.exe']))