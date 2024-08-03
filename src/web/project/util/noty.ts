import Noty from "noty";

let now = Date.now();
export function NotySucess(text) {
    if (Date.now() - now < 500) {
        return ;
    }
    now = Date.now();
    return new Noty({
        type: 'success',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();

}

export function NotyFail(text) {
    if (Date.now() - now < 500) {
        return ;
    }
    now = Date.now();
    new Noty({
        type: 'error',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();
}
