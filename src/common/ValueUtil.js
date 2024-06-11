
// 是毫秒
function isMilliseconds(timestamp) {
    // 假设毫秒时间戳不超过 1000000000000
    return timestamp > 1000000000000;
}

export function getShortTime(startStamp) {
    startStamp = isMilliseconds(startStamp)?startStamp:startStamp*1000;
    const nowStamp = Date.now();
    // 之间的时间差（毫秒数）
    const diffMilliseconds = Math.abs(nowStamp - startStamp);
    // 将毫秒数转换为分钟数
    const minutesDiff = diffMilliseconds / (1000 * 60); // 1分钟 = 60秒 * 1000毫秒
    if (minutesDiff < 1) {
        return "小于一分钟";
    } else if (minutesDiff < 60) {
        return `${minutesDiff.toFixed(0)}分钟前`;
    } else if (minutesDiff < 60*24) {
        return `${(minutesDiff/(60)).toFixed(0)}小时前`;
    } else if (minutesDiff < (60*24*30)) {
        return `${(minutesDiff/(60*24)).toFixed(0)}天前`;
    } else {
        return "一月前";
    }
}

export function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
}

