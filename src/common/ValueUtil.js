
const minute_1 = 1;
const hour_1 = minute_1 * 60;
const day_1 = hour_1 * 24;
const month_1 = day_1 * 30;
const year_1 = day_1 * 365;

const milliseconds_minute_60 = (1000 * 60);

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
    const minutesDiff = diffMilliseconds / milliseconds_minute_60; // 1分钟 = 60秒 * 1000毫秒
    if (minutesDiff < minute_1) {
        return "小于一分钟";
    } else if (minutesDiff < hour_1) {
        return `${minutesDiff.toFixed(0)}分钟前`;
    } else if (minutesDiff < day_1) {
        return `${(minutesDiff/ hour_1).toFixed(0)}小时前`;
    } else if (minutesDiff < month_1) {
        return `${(minutesDiff/ day_1).toFixed(0)}天前`;
    }else if (minutesDiff < year_1){
        return `${(minutesDiff/ month_1).toFixed(0)}月前`;
    } else {
        return `${(minutesDiff/ year_1).toFixed(0)}年前`;
    }
}
export const MAX_SIZE_TXT = 20 * 1024 * 1024;
const b_1 = 1024;
const kb_1 = 1024 *1024;
const mk_1 = 1024 * 1024 * 1024;
export function formatFileSize(bytes) {
    if(!bytes && bytes!==0) {
        return '';
    } else if (typeof bytes !== 'number') {
            return bytes;
    }
    if (bytes < b_1) {
        return bytes + ' B';
    } else if (bytes < kb_1) {
        return (bytes / b_1).toFixed(2) + ' KB';
    } else if (bytes < mk_1) {
        return (bytes / (kb_1)).toFixed(2) + ' MB';
    } else {
        return (bytes / (mk_1)).toFixed(2) + ' GB';
    }
}

// 格式化时间 2025/02/04 03:37:07
export function formatter_time(date){
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // 使用24小时制
    });
    return formatter.format(date);
}

export function  max_pages(total, pageSize) {
    if (total <= 0 || pageSize <= 0) {
        return 0;
    }
    return Math.ceil(total / pageSize);
}

