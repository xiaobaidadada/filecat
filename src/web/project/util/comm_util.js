import i18n from "i18next";

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
        return i18n.t("小于一分钟");
    } else if (minutesDiff < hour_1) {
        return `${minutesDiff.toFixed(0)}${i18n.t("分钟前")}`;
    } else if (minutesDiff < day_1) {
        return `${(minutesDiff/ hour_1).toFixed(0)}${i18n.t("小时前")}`;
    } else if (minutesDiff < month_1) {
        return `${(minutesDiff/ day_1).toFixed(0)}${i18n.t("天前")}`;
    }else if (minutesDiff < year_1){
        return `${(minutesDiff/ month_1).toFixed(0)}${i18n.t("月前")}`;
    } else {
        return `${(minutesDiff/ year_1).toFixed(0)}${i18n.t("年前")}`;
    }
}
