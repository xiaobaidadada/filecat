import Noty from "noty";

export function NotySucess(text) {
    return new Noty({
        type: 'success',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();
}

export function NotyFail(text) {
    new Noty({
        type: 'error',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();
}
