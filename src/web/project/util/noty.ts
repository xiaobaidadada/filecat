import Noty from "noty";

let now = Date.now();
const time_out = 500
export function NotySuccess(text) {
    // if (Date.now() - now < time_out) {
    //     return ;
    // }
    // now = Date.now();
    return new Noty({
        type: 'success',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();

}

export function NotyFail(text) {
    // if (Date.now() - now < time_out) {
    //     return ;
    // }
    // now = Date.now();
    new Noty({
        type: 'error',
        text: text,
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "bottomLeft"
    }).show();
}

export function NotyWaring(text) {
    // if (Date.now() - now < 100) {
    //     return ;
    // }
    // now = Date.now();
    new Noty({
        type: 'warning',
        text: text,
        // timeout:false, // 需要点击才消失
        timeout: 1000, // 设置通知消失的时间（单位：毫秒）
        layout: "topLeft"
    }).show();
}

export function NotyInfo(text) {
    // if (Date.now() - now < time_out) {
    //     return ;
    // }
    // now = Date.now();
    new Noty({
        type: 'info',
        text: text,
        // timeout:false, // 需要点击才消失
        timeout: 300, // 设置通知消失的时间（单位：毫秒）
        layout: "topRight"
    }).show();
}

/**
 * 需要用户手动确认才关闭的提示。
 * 不会自动消失，必须点击「确认」按钮才会关闭，关闭后执行回调 onClose。
 * @param text     提示内容
 * @param onClose  用户点击确认后的回调（可拿到用户确认的时机，用于触发后续逻辑）
 * @param type     提示类型，默认 warning
 * @param confirm_t 确认按钮文案，默认「确认」
 */
export function NotyConfirm(text, onClose?: () => void, type: 'alert' | 'success' | 'warning' | 'error' | 'info' = 'warning') {
    const noty = new Noty({
        type: type,
        text: text,
        timeout: false, // 不自动消失，必须用户手动确认
        layout: "topLeft",
        // 只允许通过「确认」按钮关闭，避免点击空白处/其它方式误关闭
        closeWith: ['button'],
        // buttons: [
        //     Noty.button(confirm_t, 'button button--flat', () => {
        //         // 关闭提示，关闭后会触发下面的 onClose 回调
        //         noty.close();
        //     })
        // ],
        callbacks: {
            onClose: () => {
                onClose && onClose();
            }
        }
    });
    noty.show();
    return noty;
}
