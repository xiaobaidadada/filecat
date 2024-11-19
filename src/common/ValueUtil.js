const MINUTE = 1;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

const MILLISECONDS_IN_MINUTE = 1000 * 60;

// Check if timestamp is in milliseconds
function isMilliseconds(timestamp) {
    // Assume a millisecond timestamp is greater than 1000000000000
    return timestamp > 1000000000000;
}

export function getShortTime(startStamp) {
    startStamp = isMilliseconds(startStamp) ? startStamp : startStamp * 1000;
    const nowStamp = Date.now();
    // Time difference in milliseconds
    const diffMilliseconds = Math.abs(nowStamp - startStamp);
    // Convert milliseconds to minutes
    const minutesDiff = diffMilliseconds / MILLISECONDS_IN_MINUTE;
    if (minutesDiff < MINUTE) {
        return "Less than a minute ago";
    } else if (minutesDiff < HOUR) {
        return `${minutesDiff.toFixed(0)} minutes ago`;
    } else if (minutesDiff < DAY) {
        return `${(minutesDiff / HOUR).toFixed(0)} hours ago`;
    } else if (minutesDiff < MONTH) {
        return `${(minutesDiff / DAY).toFixed(0)} days ago`;
    } else if (minutesDiff < YEAR) {
        return `${(minutesDiff / MONTH).toFixed(0)} months ago`;
    } else {
        return `${(minutesDiff / YEAR).toFixed(0)} years ago`;
    }
}

const BYTE = 1024;
const KILOBYTE = 1024 * 1024;
const MEGABYTE = 1024 * 1024 * 1024;
export function formatFileSize(bytes) {
    if (bytes < BYTE) {
        return `${bytes} B`;
    } else if (bytes < KILOBYTE) {
        return `${(bytes / BYTE).toFixed(2)} KB`;
    } else if (bytes < MEGABYTE) {
        return `${(bytes / KILOBYTE).toFixed(2)} MB`;
    } else {
        return `${(bytes / MEGABYTE).toFixed(2)} GB`;
    }
}
