
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

export function formatDuration(ms) {
    if(!ms) return ""
    const units = [
        { label: "y", value: 1000 * 60 * 60 * 24 * 365 },
        { label: "mo", value: 1000 * 60 * 60 * 24 * 30 },
        { label: "d", value: 1000 * 60 * 60 * 24 },
        { label: "h", value: 1000 * 60 * 60 },
        { label: "min", value: 1000 * 60 },
        { label: "s", value: 1000 },
        { label: "ms", value: 1 },
    ];

    for (const unit of units) {
        if (ms >= unit.value) {
            const value = ms / unit.value;
            return `${parseFloat(value.toFixed(2))} ${unit.label}`;
        }
    }

    return "0 ms";
}
